'use client';
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, listProducts, getSettings } from '@/lib/db';
import { num, fmtDate } from '@/lib/format';
import { BarsChart, TrendLine } from '@/components/Charts';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function monthLabel(k) { const [, m] = k.split('-'); return MONTHS[Number(m) - 1] || k; }

export default function ReportsPage() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setInvoices(listInvoices());
    setProducts(listProducts());
    setSettings(getSettings());
    const d = new Date();
    const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    setFrom(first);
    setTo(dayKey(d.toISOString()));
  }, []);

  const filtered = useMemo(
    () => invoices.filter((i) => { const k = dayKey(i.date); return (!from || k >= from) && (!to || k <= to); }),
    [invoices, from, to]
  );

  const stats = useMemo(() => {
    const costByCode = Object.fromEntries(products.map((p) => [String(p.code), Number(p.cost) || 0]));
    let total = 0, returns = 0, cost = 0;
    const byDay = {}, byItem = {}, byCashier = {};
    const soldCodes = new Set();
    for (const inv of filtered) {
      const sign = inv.type === 'مرتجع' ? -1 : 1;
      if (sign < 0) returns += inv.totals?.net || 0;
      total += sign * (inv.totals?.net || 0);
      const k = dayKey(inv.date);
      byDay[k] = byDay[k] || { count: 0, total: 0 };
      if (sign > 0) byDay[k].count++;
      byDay[k].total += sign * (inv.totals?.net || 0);
      const who = inv.cashier || 'غير محدد';
      byCashier[who] = (byCashier[who] || 0) + sign * (inv.totals?.net || 0);
      for (const it of inv.items || []) {
        const c = costByCode[String(it.code)] || 0;
        const q = Number(it.stockQty ?? it.qty) || 0;
        cost += sign * c * q;
        soldCodes.add(String(it.code));
        const key = it.code + '|' + it.name;
        byItem[key] = byItem[key] || { code: it.code, name: it.name, qty: 0, total: 0, profit: 0 };
        byItem[key].qty += sign * (Number(it.qty) || 0);
        byItem[key].total += sign * (Number(it.total) || 0);
        byItem[key].profit += sign * ((Number(it.price) || 0) - c) * (Number(it.qty) || 0);
      }
    }
    const items = Object.values(byItem);
    // أبطأ الأصناف حركة: مخزون موجود ومتباعش (أو اتباع قليل) في الفترة
    const slow = products
      .filter((p) => (Number(p.stock) || 0) > 0 && !soldCodes.has(String(p.code)))
      .sort((a, b) => (Number(b.stock) || 0) * (Number(b.cost) || Number(b.price) || 0) - (Number(a.stock) || 0) * (Number(a.cost) || Number(a.price) || 0))
      .slice(0, 15);
    return {
      total, returns, count: filtered.filter((i) => i.type !== 'مرتجع').length, profit: total - cost,
      byDay: Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])),
      topItems: items.sort((a, b) => b.total - a.total).slice(0, 12),
      topProfit: items.filter((x) => x.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 10),
      byCashier: Object.entries(byCashier).sort((a, b) => b[1] - a[1]),
      slow,
    };
  }, [filtered, products]);

  // اتجاه المبيعات آخر 12 شهر (مستقل عن فلتر الفترة)
  const monthly = useMemo(() => {
    const by = {};
    for (const inv of invoices) {
      const sign = inv.type === 'مرتجع' ? -1 : 1;
      const k = monthKey(inv.date);
      by[k] = (by[k] || 0) + sign * (inv.totals?.net || 0);
    }
    const keys = Object.keys(by).sort().slice(-12);
    return keys.map((k) => ({ label: monthLabel(k), value: by[k], key: k }));
  }, [invoices]);

  const monthCompare = useMemo(() => {
    const now = new Date();
    const thisK = monthKey(now.toISOString());
    const lastK = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
    const sum = (k) => invoices.filter((i) => monthKey(i.date) === k).reduce((s, i) => s + (i.type === 'مرتجع' ? -1 : 1) * (i.totals?.net || 0), 0);
    const t = sum(thisK), l = sum(lastK);
    return { t, l, diff: l ? Math.round(((t - l) / l) * 100) : (t > 0 ? 100 : 0) };
  }, [invoices]);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  return (
    <div>
      <div className="card no-print">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field"><span>من تاريخ</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>إلى تاريخ</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn-primary" onClick={() => window.print()}>🖨️ طباعة التقرير</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat orange">
          <div className="label">صافي المبيعات {stats.returns > 0 ? '(بعد المرتجعات)' : ''}</div>
          <div className="value">{num(stats.total, ar)}</div>
          <div className="sub">{settings.currency}{stats.returns > 0 ? ` — مرتجعات ${num(stats.returns, ar)}` : ''}</div>
        </div>
        <div className="stat"><div className="label">عدد الفواتير</div><div className="value">{num(stats.count, ar)}</div></div>
        <div className="stat green"><div className="label">الربح التقريبي</div><div className="value">{num(stats.profit, ar)}</div>
          <div className="sub">حسب السعر المبدئي</div></div>
        <div className={`stat ${monthCompare.diff >= 0 ? 'green' : 'red'}`}>
          <div className="label">الشهر ده مقابل الشهر اللي فات</div>
          <div className="value">{monthCompare.diff >= 0 ? '▲' : '▼'} {num(Math.abs(monthCompare.diff), ar)}%</div>
          <div className="sub">{num(monthCompare.t, ar)} مقابل {num(monthCompare.l, ar)}</div>
        </div>
      </div>

      <div className="card">
        <h3>📈 اتجاه المبيعات (آخر ١٢ شهر)</h3>
        <TrendLine data={monthly} fmt={(n) => num(Math.round(n), ar)} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>📊 المبيعات باليوم (خلال الفترة)</h3>
          <BarsChart data={stats.byDay.map(([k, v]) => ({ label: fmtDate(k, ar).slice(0, 5), value: v.total }))} fmt={(n) => num(Math.round(n), ar)} />
        </div>
        <div className="card">
          <h3>💰 أكثر الأصناف ربحاً</h3>
          <BarsChart data={stats.topProfit.map((it) => ({ label: it.name.slice(0, 10), value: it.profit, color: 'var(--green)' }))} fmt={(n) => num(Math.round(n), ar)} />
        </div>
      </div>

      {stats.byCashier.length > 1 && (
        <div className="card">
          <h3>🧑‍💼 مبيعات كل كاشير</h3>
          <BarsChart data={stats.byCashier.map(([name, v]) => ({ label: name, value: v, color: 'var(--brand)' }))} fmt={(n) => num(Math.round(n), ar)} />
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h3>🏆 الأصناف الأكثر مبيعاً</h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th><th>الربح</th></tr></thead>
            <tbody>
              {stats.topItems.map((it) => (
                <tr key={it.code + it.name}>
                  <td>{it.name}</td>
                  <td>{num(it.qty, ar)}</td>
                  <td><b>{num(it.total, ar)}</b></td>
                  <td className="green-text">{num(Math.round(it.profit), ar)}</td>
                </tr>
              ))}
              {!stats.topItems.length && <tr><td colSpan={4} className="muted">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>🐢 أبطأ الأصناف حركة <small className="muted">(مخزون راكد — متباعش في الفترة)</small></h3>
          <table className="tbl">
            <thead><tr><th>الصنف</th><th>المخزون</th><th>قيمة راكدة</th></tr></thead>
            <tbody>
              {stats.slow.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><span className="badge orange">{num(p.stock, ar)}</span></td>
                  <td className="red-text">{num(Math.round((Number(p.stock) || 0) * (Number(p.cost) || Number(p.price) || 0)), ar)}</td>
                </tr>
              ))}
              {!stats.slow.length && <tr><td colSpan={3} className="muted">كل الأصناف بتتحرك ✅</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
