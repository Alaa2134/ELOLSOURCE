'use client';
// 🧠 مركز الذكاء — بيحلّل كل بيانات المحل ويطلّع توصيات عملية تزوّد المكسب وتمنع الخسارة
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listInvoices, listProducts, listCustomers, getSettings } from '@/lib/db';
import { num } from '@/lib/format';
import { waMeLink } from '@/lib/wa';

const DAY = 86400000;

export default function InsightsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    setSettings(getSettings());
    setInvoices(listInvoices());
    setProducts(listProducts());
    setCustomers(listCustomers());
  }, []);

  const ins = useMemo(() => {
    const now = Date.now();
    // مبيعات آخر 30/60 يوم لكل صنف
    const sold30 = {}, sold60 = {}, lastSold = {};
    const profitByItem = {};
    const costByCode = Object.fromEntries(products.map((p) => [String(p.code), Number(p.cost) || 0]));
    const custLast = {}, custTotal = {};
    for (const inv of invoices) {
      const t = new Date(inv.date).getTime();
      const sign = inv.type === 'مرتجع' ? -1 : 1;
      const nm = inv.customer?.name;
      if (nm && nm !== 'نقدي' && sign > 0) {
        custLast[nm] = Math.max(custLast[nm] || 0, t);
        custTotal[nm] = (custTotal[nm] || 0) + (inv.totals?.net || 0);
      }
      for (const it of inv.items || []) {
        const c = String(it.code);
        const q = Number(it.qty) || 0;
        if (sign > 0 && now - t <= 30 * DAY) sold30[c] = (sold30[c] || 0) + q;
        if (sign > 0 && now - t <= 60 * DAY) sold60[c] = (sold60[c] || 0) + q;
        if (sign > 0) lastSold[c] = Math.max(lastSold[c] || 0, t);
        const key = c + '|' + it.name;
        profitByItem[key] = profitByItem[key] || { code: c, name: it.name, profit: 0, qty: 0 };
        profitByItem[key].profit += sign * ((Number(it.price) || 0) - (costByCode[c] || 0)) * q;
        profitByItem[key].qty += sign * q;
      }
    }

    // 🔴 أصناف بتخسر فيها: سعر البيع ≤ التكلفة (وليها تكلفة)
    const losing = products
      .filter((p) => Number(p.cost) > 0 && Number(p.price) > 0 && Number(p.price) <= Number(p.cost))
      .map((p) => ({ ...p, loss: Number(p.cost) - Number(p.price) }))
      .sort((a, b) => b.loss - a.loss).slice(0, 30);

    // 🟠 فلوس واقفة: مخزون بقيمة ومتباعش من 60 يوم
    const dead = products
      .filter((p) => (Number(p.stock) || 0) > 0 && (Number(p.cost) || Number(p.price) || 0) > 0 && (!lastSold[String(p.code)] || now - lastSold[String(p.code)] > 60 * DAY))
      .map((p) => ({ ...p, tied: (Number(p.stock) || 0) * (Number(p.cost) || Number(p.price) || 0) }))
      .sort((a, b) => b.tied - a.tied);
    const deadTotal = dead.reduce((s, p) => s + p.tied, 0);

    // 🔵 عملاء غابوا: اشتروا قبل كده ومن 30+ يوم مجوش
    const gone = Object.keys(custLast)
      .filter((n) => now - custLast[n] > 30 * DAY)
      .map((n) => ({ name: n, days: Math.floor((now - custLast[n]) / DAY), total: custTotal[n], phone: customers.find((c) => c.name === n)?.phone || '' }))
      .sort((a, b) => b.total - a.total).slice(0, 20);

    // 🟢 نجوم الربح: أعلى ربح فعلي
    const stars = Object.values(profitByItem).filter((x) => x.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 10);

    // ⚡ اطلب دلوقتي: سرعة بيع عالية ومخزون قليل
    const restock = products
      .map((p) => { const per = (sold30[String(p.code)] || 0) / 30; return { ...p, per, daysLeft: per > 0 ? (Number(p.stock) || 0) / per : Infinity }; })
      .filter((p) => p.per > 0 && p.daysLeft <= 10)
      .sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 20);

    return { losing, dead, deadTotal, gone, stars, restock };
  }, [invoices, products, customers]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const cur = settings.currency;
  const money = (v) => `${num(Math.round(v), ar)} ${cur}`;

  function winBackMsg(c) {
    return `أهلاً ${c.name} 🌹\nوحشتنا! عندنا وصل جديد وعروض حلوة في ${settings.companyName}.\nتحب نجهزلك طلبية؟`;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: 'var(--brand)', margin: 0 }}>🧠 مركز الذكاء — نصايح تزوّد مكسبك</h2>
      </div>

      {/* ملخص سريع */}
      <div className="grid cols-4" style={{ marginBottom: 8 }}>
        <div className="stat red"><div className="label">🔴 أصناف بتخسر فيها</div><div className="value">{num(ins.losing.length, ar)}</div><div className="sub">سعرها ≤ تكلفتها</div></div>
        <div className="stat orange"><div className="label">🟠 فلوس واقفة (مخزون راكد)</div><div className="value">{num(Math.round(ins.deadTotal), ar)}</div><div className="sub">{cur} في {num(ins.dead.length, ar)} صنف</div></div>
        <div className="stat"><div className="label">🔵 عملاء غابوا</div><div className="value">{num(ins.gone.length, ar)}</div><div className="sub">+30 يوم</div></div>
        <div className="stat green" style={{ borderTopColor: 'var(--accent)' }}><div className="label">⚡ محتاج تطلبه دلوقتي</div><div className="value">{num(ins.restock.length, ar)}</div><div className="sub">بيتباع وقرب يخلص</div></div>
      </div>

      {/* 🔴 خسائر */}
      {ins.losing.length > 0 && (
        <div className="card" style={{ borderRight: '4px solid var(--red)' }}>
          <h3>🔴 أصناف بتبيعها بسعر أقل من تكلفتها — عدّل السعر فوراً</h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>التكلفة</th><th>سعر البيع</th><th>الخسارة/قطعة</th><th></th></tr></thead>
            <tbody>
              {ins.losing.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(p.cost)}</td>
                  <td className="red-text">{money(p.price)}</td>
                  <td><span className="badge red">-{money(p.loss)}</span></td>
                  <td><button className="btn-sm btn-primary" onClick={() => router.push(`/products?q=${encodeURIComponent(p.code)}`)}>عدّل السعر</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {/* 🟢 نجوم الربح */}
        <div className="card">
          <h3>🟢 نجوم الربح — الأصناف اللي بتكسّبك أكتر</h3>
          <p className="muted" style={{ marginTop: 0 }}>ركّز عليها في العرض والتوفير — دي اللي بتجيب الفلوس.</p>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>الكمية المباعة</th><th>ربح</th></tr></thead>
            <tbody>
              {ins.stars.map((it) => (
                <tr key={it.code + it.name}><td>{it.name}</td><td>{num(it.qty, ar)}</td><td className="green-text"><b>{money(it.profit)}</b></td></tr>
              ))}
              {!ins.stars.length && <tr><td colSpan={3} className="muted">لسه مفيش مبيعات كفاية</td></tr>}
            </tbody>
          </table>
        </div>

        {/* ⚡ اطلب دلوقتي */}
        <div className="card">
          <h3>⚡ اطلبه دلوقتي — بيتباع بسرعة وقرب يخلص</h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>المخزون</th><th>هيكفي</th></tr></thead>
            <tbody>
              {ins.restock.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td><span className="badge orange">{num(p.stock, ar)}</span></td><td><span className={`badge ${p.daysLeft <= 4 ? 'red' : 'orange'}`}>{num(Math.ceil(p.daysLeft), ar)} يوم</span></td></tr>
              ))}
              {!ins.restock.length && <tr><td colSpan={3} className="muted">المخزون كويس ✅</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🔵 عملاء غابوا */}
      {ins.gone.length > 0 && (
        <div className="card" style={{ borderRight: '4px solid var(--brand)' }}>
          <h3>🔵 عملاء غابوا — كلّمهم يرجعوا يشتروا</h3>
          <table className="tbl">
            <thead><tr><th>العميل</th><th>آخر شراء</th><th>إجمالي تعامله</th><th></th></tr></thead>
            <tbody>
              {ins.gone.map((c) => (
                <tr key={c.name}>
                  <td><b>{c.name}</b></td>
                  <td><span className="badge orange">من {num(c.days, ar)} يوم</span></td>
                  <td>{money(c.total)}</td>
                  <td>
                    {c.phone
                      ? <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={waMeLink(c.phone, winBackMsg(c))}>💬 كلّمه يرجع</a>
                      : <span className="muted">مفيش رقم</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 🟠 فلوس واقفة */}
      {ins.dead.length > 0 && (
        <div className="card" style={{ borderRight: '4px solid var(--accent)' }}>
          <h3>🟠 فلوس واقفة في مخزون راكد <small className="muted">— اعملها عرض/تخفيض تحرّك فلوسك ({money(ins.deadTotal)})</small></h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>المورد</th><th>المخزون</th><th>فلوس واقفة</th></tr></thead>
            <tbody>
              {ins.dead.slice(0, 25).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category && p.category !== 'أدوات منزلية' ? p.category : '—'}</td>
                  <td><span className="badge orange">{num(p.stock, ar)}</span></td>
                  <td className="red-text">{money(p.tied)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
