'use client';
// لوحة "اليوم" — نظرة واحدة على حالة المحل: مبيعات، محصّل، آجل، فلوس المندوبين، النواقص، الأكتر مبيعاً
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listInvoices, listProducts, listCustomers, listPayments, listExpenses, getSettings } from '@/lib/db';
import { num, fmtTime } from '@/lib/format';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const s = getSettings();
    const invoices = listInvoices();
    const products = listProducts();
    const payments = listPayments();
    const today = new Date().toDateString();

    const todayInv = invoices.filter((i) => new Date(i.date).toDateString() === today);
    const todaySales = todayInv.reduce((sum, i) => sum + (i.type === 'مرتجع' ? -1 : 1) * (i.totals?.net || 0), 0);
    const todayCash = todayInv.reduce((sum, i) => sum + (i.totals?.paid || 0), 0);
    // محصّل النهارده = سندات القبض النهارده (تحصيل آجل قديم)
    const collectedToday = payments
      .filter((p) => new Date(p.date).toDateString() === today)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const debt = invoices.reduce((sum, i) => sum + Math.max(0, i.totals?.remaining || 0), 0);
    // فلوس مع المندوبين = فواتير طلعت مع مندوب ولسه متبقّي عليها
    const repMoney = invoices
      .filter((i) => i.rep && (i.totals?.remaining || 0) > 0)
      .reduce((sum, i) => sum + (i.totals.remaining || 0), 0);

    const lowStock = products.filter((p) => (Number(p.stock) || 0) <= (Number(s.lowStock) || 5));

    // ربح النهارده (تقريبي حسب سعر الشراء)
    const costByCode = Object.fromEntries(products.map((p) => [String(p.code), Number(p.cost) || 0]));
    let todayProfit = 0;
    // الأكتر مبيعاً النهارده (بالكمية)
    const byItem = {};
    for (const inv of todayInv) {
      const sign = inv.type === 'مرتجع' ? -1 : 1;
      for (const it of inv.items || []) {
        todayProfit += sign * ((Number(it.price) || 0) - (costByCode[String(it.code)] || 0)) * (Number(it.qty) || 0);
        if (sign < 0) continue;
        const k = it.name || it.code;
        byItem[k] = byItem[k] || { name: it.name, qty: 0, total: 0 };
        byItem[k].qty += Number(it.qty) || 0;
        byItem[k].total += Number(it.total) || 0;
      }
    }
    const topItems = Object.values(byItem).sort((a, b) => b.qty - a.qty).slice(0, 6);
    const todayExpenses = listExpenses()
      .filter((x) => new Date(x.date).toDateString() === today)
      .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    const newDebtToday = todayInv.reduce((sum, i) => sum + (i.type === 'مرتجع' ? 0 : Math.max(0, i.totals?.remaining || 0)), 0);

    setData({ s, invoices, todayInv, todaySales, todayCash, collectedToday, debt, repMoney, lowStock, topItems, todayProfit, todayExpenses, newDebtToday, customers: listCustomers().length });
  }, []);

  if (!data) return null;
  const { s, invoices, todayInv, todaySales, todayCash, collectedToday, debt, repMoney, lowStock, topItems, todayProfit, todayExpenses, newDebtToday } = data;
  const ar = s.arabicDigits;
  const money = (v) => `${num(v, ar)} ${s.currency}`;

  // ملخص اليوم لصاحب المحل — نص جاهز للواتساب
  function dailySummaryText() {
    const d = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const cur = s.currency;
    const lines = [
      `📊 ملخص يوم ${d}`,
      `— ${s.companyName || 'المحل'} —`,
      ``,
      `🧾 المبيعات: ${num(todaySales)} ${cur} (${num(todayInv.length)} فاتورة)`,
      `💵 نقدي محصّل: ${num(todayCash)} ${cur}`,
      `💰 تحصيل آجل (سندات): ${num(collectedToday)} ${cur}`,
      `📈 الربح التقريبي: ${num(Math.round(todayProfit))} ${cur}`,
      `💸 المصروفات: ${num(todayExpenses)} ${cur}`,
      `📕 آجل جديد النهارده: ${num(newDebtToday)} ${cur}`,
      `📉 أصناف قاربت تخلص: ${num(lowStock.length)}`,
    ];
    if (topItems.length) lines.push(``, `🏆 الأكتر مبيعاً: ${topItems.slice(0, 3).map((t) => t.name).join('، ')}`);
    return lines.join('\n');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ color: 'var(--brand)', margin: 0 }}>👋 أهلاً — ده ملخّص اليوم</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-green" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(dailySummaryText())}`} title="ابعت ملخص اليوم على واتساب لنفسك أو للإدارة">
            📤 ملخص اليوم واتساب
          </a>
          <button title="نسخ الملخص" onClick={() => { navigator.clipboard?.writeText(dailySummaryText()); }}>📋</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 8 }}>
        <div className="stat green" style={{ borderTopColor: 'var(--gold)' }}>
          <div className="label">📈 ربح النهارده (تقريبي)</div>
          <div className="value">{num(Math.round(todayProfit), ar)} <small style={{ fontSize: 14 }}>{s.currency}</small></div>
          <div className="sub">مصروفات النهارده {money(todayExpenses)}</div>
        </div>
        <div className="stat orange">
          <div className="label">🧾 مبيعات النهارده</div>
          <div className="value">{num(todaySales, ar)} <small style={{ fontSize: 14 }}>{s.currency}</small></div>
          <div className="sub">{num(todayInv.length, ar)} فاتورة · نقدي منها {money(todayCash)}</div>
        </div>
        <div className="stat green">
          <div className="label">💵 محصّل النهارده (سندات قبض)</div>
          <div className="value">{num(collectedToday, ar)}</div>
          <div className="sub">{s.currency}</div>
        </div>
        <div className="stat red">
          <div className="label">📕 آجل على العملاء (كله)</div>
          <div className="value">{num(debt, ar)}</div>
          <div className="sub">{s.currency}</div>
        </div>
        <div className="stat">
          <div className="label">🛵 فلوس مع المندوبين</div>
          <div className="value">{num(repMoney, ar)}</div>
          <div className="sub">لسه متحصّلتش</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link className="btn btn-accent" href="/pos">🧾 فاتورة بيع جديدة</Link>
          <Link className="btn btn-primary" href="/payments">💵 سند قبض</Link>
          <Link className="btn btn-primary" href="/reps">🛵 تحصيل المندوبين</Link>
          <Link className="btn" href="/lowstock">
            📉 النواقص {lowStock.length > 0 && <span className="badge red" style={{ marginRight: 6 }}>{num(lowStock.length, ar)}</span>}
          </Link>
          <Link className="btn btn-green" href="/whatsapp">💬 الواتساب</Link>
          <Link className="btn" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} href="/insights">🧠 مركز الذكاء</Link>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>🏆 الأكتر مبيعاً النهارده</h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>الكمية</th><th>القيمة</th></tr></thead>
            <tbody>
              {topItems.map((it, i) => (
                <tr key={i}>
                  <td>{it.name}</td>
                  <td><b>{num(it.qty, ar)}</b></td>
                  <td>{num(it.total, ar)}</td>
                </tr>
              ))}
              {!topItems.length && <tr><td colSpan={3} className="muted">لسه مفيش مبيعات النهارده</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>🕐 آخر الفواتير</h3>
          <table className="tbl">
            <thead><tr><th>رقم</th><th>العميل</th><th>الكاشير</th><th>الوقت</th><th>الصافي</th></tr></thead>
            <tbody>
              {invoices.slice(0, 8).map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/print/${i.id}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{num(i.number, ar)}</Link></td>
                  <td>{i.customer?.name}</td>
                  <td>{i.cashier || '—'}</td>
                  <td>{fmtTime(i.date, ar)}</td>
                  <td><b>{num(i.totals?.net || 0, ar)}</b></td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan={5} className="muted">لا توجد فواتير بعد — ابدأ البيع! 🚀</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>⚠️ أصناف قاربت على النفاد <Link href="/lowstock" style={{ fontSize: 13, marginRight: 8 }}>عرض الكل ←</Link></h3>
        <table className="tbl">
          <thead><tr><th>الكود</th><th>الصنف</th><th>المورد</th><th>المخزون</th></tr></thead>
          <tbody>
            {lowStock.slice(0, 8).map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.category && p.category !== 'أدوات منزلية' ? p.category : '—'}</td>
                <td><span className="badge red">{num(p.stock || 0, ar)}</span></td>
              </tr>
            ))}
            {!lowStock.length && <tr><td colSpan={4} className="muted">المخزون تمام ✅</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
