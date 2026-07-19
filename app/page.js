'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listInvoices, listProducts, listCustomers, getSettings } from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const s = getSettings();
    const invoices = listInvoices();
    const products = listProducts();
    const today = new Date().toDateString();
    const todayInv = invoices.filter((i) => new Date(i.date).toDateString() === today);
    const todaySales = todayInv.reduce((sum, i) => sum + (i.totals?.net || 0), 0);
    const lowStock = products.filter((p) => (Number(p.stock) || 0) <= (Number(s.lowStock) || 5));
    const debt = invoices.reduce((sum, i) => sum + Math.max(0, i.totals?.remaining || 0), 0);
    setData({ s, invoices, todayInv, todaySales, lowStock, debt, customers: listCustomers().length });
  }, []);

  if (!data) return null;
  const { s, invoices, todayInv, todaySales, lowStock, debt } = data;
  const ar = s.arabicDigits;

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat orange">
          <div className="label">مبيعات اليوم</div>
          <div className="value">{num(todaySales, ar)} <small style={{ fontSize: 14 }}>{s.currency}</small></div>
          <div className="sub">{num(todayInv.length, ar)} فاتورة</div>
        </div>
        <div className="stat">
          <div className="label">إجمالي الفواتير</div>
          <div className="value">{num(invoices.length, ar)}</div>
          <div className="sub">{num(data.customers, ar)} عميل مسجل</div>
        </div>
        <div className="stat red">
          <div className="label">مديونيات العملاء (آجل)</div>
          <div className="value">{num(debt, ar)}</div>
          <div className="sub">{s.currency}</div>
        </div>
        <div className="stat green">
          <div className="label">أصناف قاربت على النفاد</div>
          <div className="value">{num(lowStock.length, ar)}</div>
          <div className="sub">حد التنبيه: {num(s.lowStock, ar)} قطع</div>
        </div>
      </div>

      <div className="card">
        <h3>⚡ إجراءات سريعة</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn btn-accent" href="/pos">🧾 فاتورة بيع جديدة</Link>
          <Link className="btn btn-primary" href="/products">📦 إضافة صنف</Link>
          <Link className="btn btn-primary" href="/customers">👥 إضافة عميل</Link>
          <Link className="btn btn-green" href="/whatsapp">💬 حالة الواتساب</Link>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>🕐 آخر الفواتير</h3>
          <table className="tbl">
            <thead>
              <tr><th>رقم</th><th>العميل</th><th>الوقت</th><th>الصافي</th></tr>
            </thead>
            <tbody>
              {invoices.slice(0, 8).map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/print/${i.id}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{num(i.number, ar)}</Link></td>
                  <td>{i.customer?.name}</td>
                  <td>{fmtTime(i.date, ar)}</td>
                  <td><b>{num(i.totals?.net || 0, ar)}</b></td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan={4} className="muted">لا توجد فواتير بعد — ابدأ البيع! 🚀</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>⚠️ أصناف قاربت على النفاد</h3>
          <table className="tbl">
            <thead>
              <tr><th>الكود</th><th>الصنف</th><th>المخزون</th></tr>
            </thead>
            <tbody>
              {lowStock.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td><span className="badge red">{num(p.stock || 0, ar)}</span></td>
                </tr>
              ))}
              {!lowStock.length && <tr><td colSpan={3} className="muted">المخزون تمام ✅</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
