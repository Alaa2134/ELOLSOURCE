'use client';
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, listProducts, getSettings } from '@/lib/db';
import { num, fmtDate } from '@/lib/format';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    () =>
      invoices.filter((i) => {
        const k = dayKey(i.date);
        return (!from || k >= from) && (!to || k <= to);
      }),
    [invoices, from, to]
  );

  const stats = useMemo(() => {
    const costByCode = Object.fromEntries(products.map((p) => [String(p.code), Number(p.cost) || 0]));
    let total = 0;
    let returns = 0;
    let cost = 0;
    const byDay = {};
    const byItem = {};
    for (const inv of filtered) {
      const sign = inv.type === 'مرتجع' ? -1 : 1; // المرتجعات بتتخصم من المبيعات والربح
      if (sign < 0) returns += inv.totals?.net || 0;
      total += sign * (inv.totals?.net || 0);
      const k = dayKey(inv.date);
      byDay[k] = byDay[k] || { count: 0, total: 0 };
      if (sign > 0) byDay[k].count++;
      byDay[k].total += sign * (inv.totals?.net || 0);
      for (const it of inv.items || []) {
        cost += sign * (costByCode[String(it.code)] || 0) * (Number(it.stockQty ?? it.qty) || 0);
        const key = it.code + '|' + it.name;
        byItem[key] = byItem[key] || { code: it.code, name: it.name, qty: 0, total: 0 };
        byItem[key].qty += sign * (Number(it.qty) || 0);
        byItem[key].total += sign * (Number(it.total) || 0);
      }
    }
    return {
      total,
      returns,
      count: filtered.filter((i) => i.type !== 'مرتجع').length,
      profit: total - cost,
      byDay: Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])),
      topItems: Object.values(byItem).sort((a, b) => b.total - a.total).slice(0, 15),
    };
  }, [filtered, products]);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field"><span>من تاريخ</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>إلى تاريخ</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn-primary no-print" onClick={() => window.print()}>🖨️ طباعة التقرير</button>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat orange">
          <div className="label">صافي المبيعات {stats.returns > 0 ? '(بعد المرتجعات)' : ''}</div>
          <div className="value">{num(stats.total, ar)}</div>
          <div className="sub">{settings.currency}{stats.returns > 0 ? ` — مرتجعات ${num(stats.returns, ar)}` : ''}</div>
        </div>
        <div className="stat">
          <div className="label">عدد الفواتير</div>
          <div className="value">{num(stats.count, ar)}</div>
        </div>
        <div className="stat green">
          <div className="label">الربح التقريبي</div>
          <div className="value">{num(stats.profit, ar)}</div>
          <div className="sub">حسب أسعار التكلفة المسجلة</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>📅 المبيعات باليوم</h3>
          <table className="tbl">
            <thead><tr><th>اليوم</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {stats.byDay.map(([k, v]) => (
                <tr key={k}>
                  <td>{fmtDate(k, ar)}</td>
                  <td>{num(v.count, ar)}</td>
                  <td><b>{num(v.total, ar)}</b></td>
                </tr>
              ))}
              {!stats.byDay.length && <tr><td colSpan={3} className="muted">لا توجد بيانات في الفترة دي</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>🏆 الأصناف الأكثر مبيعاً</h3>
          <table className="tbl">
            <thead><tr><th>الكود</th><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {stats.topItems.map((it) => (
                <tr key={it.code + it.name}>
                  <td>{it.code}</td>
                  <td>{it.name}</td>
                  <td>{num(it.qty, ar)}</td>
                  <td><b>{num(it.total, ar)}</b></td>
                </tr>
              ))}
              {!stats.topItems.length && <tr><td colSpan={4} className="muted">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
