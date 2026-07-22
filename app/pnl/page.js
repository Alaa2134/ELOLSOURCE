'use client';
// 📗 كشف الأرباح والخسائر — مبيعات ناقص تكلفة ناقص مصروفات = صافي الربح، شهرياً وجاهز للطباعة
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, listProducts, listExpenses, getSettings } from '@/lib/db';
import { num } from '@/lib/format';

function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function monthName(k) { const [y, m] = k.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; }

export default function PnlPage() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [month, setMonth] = useState('');

  useEffect(() => {
    setInvoices(listInvoices());
    setProducts(listProducts());
    setExpenses(listExpenses());
    setSettings(getSettings());
    setMonth(monthKey(new Date().toISOString()));
  }, []);

  // الشهور المتاحة (فيها فواتير أو مصروفات)
  const months = useMemo(() => {
    const set = new Set();
    invoices.forEach((i) => set.add(monthKey(i.date)));
    expenses.forEach((e) => set.add(monthKey(e.date)));
    set.add(monthKey(new Date().toISOString()));
    return [...set].sort().reverse();
  }, [invoices, expenses]);

  const pnl = useMemo(() => {
    if (!month) return null;
    const costByCode = Object.fromEntries(products.map((p) => [String(p.code), Number(p.cost) || 0]));
    let sales = 0, returns = 0, cogs = 0, invCount = 0;
    for (const inv of invoices) {
      if (monthKey(inv.date) !== month) continue;
      const sign = inv.type === 'مرتجع' ? -1 : 1;
      if (sign < 0) returns += inv.totals?.net || 0; else invCount++;
      sales += sign * (inv.totals?.net || 0);
      for (const it of inv.items || []) {
        cogs += sign * (costByCode[String(it.code)] || 0) * (Number(it.stockQty ?? it.qty) || 0);
      }
    }
    const expRows = expenses.filter((e) => monthKey(e.date) === month);
    const expTotal = expRows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byCat = {};
    for (const e of expRows) { const k = e.desc || 'أخرى'; byCat[k] = (byCat[k] || 0) + (Number(e.amount) || 0); }
    const gross = sales - cogs;
    const net = gross - expTotal;
    return {
      sales, returns, cogs, gross, expTotal, net, invCount,
      margin: sales > 0 ? Math.round((net / sales) * 100) : 0,
      grossMargin: sales > 0 ? Math.round((gross / sales) * 100) : 0,
      byCat: Object.entries(byCat).sort((a, b) => b[1] - a[1]),
    };
  }, [month, invoices, products, expenses]);

  if (!settings || !pnl) return null;
  const ar = settings.arabicDigits;
  const cur = settings.currency;
  const money = (v) => `${num(Math.round(v), ar)} ${cur}`;

  return (
    <div>
      <div className="card no-print">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field"><span>الشهر</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((k) => <option key={k} value={k}>{monthName(k)}</option>)}
            </select>
          </label>
          <button className="btn-primary" onClick={() => window.print()}>🖨️ طباعة الكشف</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ textAlign: 'center', fontSize: 20 }}>📗 كشف الأرباح والخسائر — {monthName(month)}</h3>
        <p className="muted" style={{ textAlign: 'center', marginTop: -6 }}>{settings.companyName}</p>

        <table className="tbl pnl-table" style={{ maxWidth: 620, margin: '10px auto' }}>
          <tbody>
            <tr><td>🧾 المبيعات ({num(pnl.invCount, ar)} فاتورة)</td><td className="pnl-num">{money(pnl.sales + pnl.returns)}</td></tr>
            {pnl.returns > 0 && <tr><td className="muted">( − ) مرتجعات</td><td className="pnl-num red-text">-{money(pnl.returns)}</td></tr>}
            <tr className="pnl-sub"><td>صافي المبيعات</td><td className="pnl-num">{money(pnl.sales)}</td></tr>
            <tr><td>📦 ( − ) تكلفة البضاعة المباعة</td><td className="pnl-num red-text">-{money(pnl.cogs)}</td></tr>
            <tr className="pnl-total green"><td>💰 مجمل الربح <span className="muted">(هامش {num(pnl.grossMargin, ar)}%)</span></td><td className="pnl-num">{money(pnl.gross)}</td></tr>
            <tr><td>💸 ( − ) المصروفات</td><td className="pnl-num red-text">-{money(pnl.expTotal)}</td></tr>
            <tr className={`pnl-total ${pnl.net >= 0 ? 'green' : 'red'}`}>
              <td>{pnl.net >= 0 ? '✅' : '⚠️'} صافي الربح {pnl.net < 0 ? '(خسارة)' : ''} <span className="muted">(هامش {num(pnl.margin, ar)}%)</span></td>
              <td className="pnl-num">{money(pnl.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {pnl.byCat.length > 0 && (
        <div className="card">
          <h3>💸 تفصيل المصروفات</h3>
          <table className="tbl" style={{ maxWidth: 500 }}>
            <thead><tr><th>البند</th><th>المبلغ</th><th>نسبة</th></tr></thead>
            <tbody>
              {pnl.byCat.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td><b>{money(v)}</b></td>
                  <td>{num(pnl.expTotal > 0 ? Math.round((v / pnl.expTotal) * 100) : 0, ar)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted no-print" style={{ textAlign: 'center' }}>
        * التكلفة محسوبة بمتوسط التكلفة المتحرّك المسجّل على كل صنف.
      </p>
    </div>
  );
}
