'use client';
// تحصيل المندوبين: الفواتير اللي طلعت مع مندوب ولسه فلوسها متحصلتش
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listInvoices,
  saveInvoice,
  savePayment,
  nextPaymentNumber,
  getSettings,
} from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';

export default function RepsPage() {
  const [settings, setSettings] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [toast, setToast] = useState('');
  const [showAll, setShowAll] = useState(false);

  function reload() {
    setSettings(getSettings());
    setInvoices(listInvoices().filter((i) => i.rep));
  }
  useEffect(reload, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  }

  const open = invoices.filter((i) => (i.totals?.remaining || 0) > 0);
  const done = invoices.filter((i) => (i.totals?.remaining || 0) <= 0);
  const shown = showAll ? invoices : open;

  // تجميع حسب المندوب
  const byRep = {};
  for (const inv of shown) {
    byRep[inv.rep] = byRep[inv.rep] || [];
    byRep[inv.rep].push(inv);
  }

  function collect(inv) {
    const remaining = inv.totals?.remaining || 0;
    const val = prompt(
      `تحصيل من المندوب ${inv.rep} — فاتورة ${inv.number} (${inv.customer?.name})\nالمتبقي: ${num(remaining)} ${settings.currency}\nاكتب المبلغ المستلم:`,
      String(remaining)
    );
    if (val === null) return;
    const amount = Number(val) || 0;
    if (amount <= 0) return;
    savePayment({
      number: nextPaymentNumber(),
      date: todayISO(),
      customerName: inv.customer?.name,
      phone: inv.customer?.phone || '',
      amount,
      method: 'نقدي',
      notes: `تحصيل عن طريق المندوب ${inv.rep} — فاتورة ${inv.number}`,
      targetInvoiceId: inv.id,
      debtBefore: remaining,
      debtAfter: Math.max(0, remaining - amount),
    });
    // تحديث حالة الفاتورة
    const updated = listInvoices().find((x) => x.id === inv.id);
    if (updated) {
      saveInvoice({
        ...updated,
        repStatus: (updated.totals?.remaining || 0) <= 0 ? 'تم التحصيل' : 'تحصيل جزئي',
      });
    }
    reload();
    showToast(`✅ تم تحصيل ${num(amount)} من المندوب ${inv.rep}`);
  }

  const totalOut = open.reduce((s, i) => s + (i.totals?.remaining || 0), 0);

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="stat red">
          <div className="label">فلوس برة مع المندوبين</div>
          <div className="value">{num(totalOut, ar)}</div>
          <div className="sub">{settings.currency}</div>
        </div>
        <div className="stat orange">
          <div className="label">فواتير لسه متحصلتش</div>
          <div className="value">{num(open.length, ar)}</div>
        </div>
        <div className="stat green">
          <div className="label">فواتير اتحصلت</div>
          <div className="value">{num(done.length, ar)}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🛵 تحصيل المندوبين</h3>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginRight: 'auto' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            إظهار المُحصَّل كمان
          </label>
        </div>

        {!Object.keys(byRep).length && (
          <p className="muted">مفيش فواتير مع مندوبين حالياً — حدد المندوب وأنت بتعمل الفاتورة في شاشة البيع 🛵</p>
        )}

        {Object.entries(byRep).map(([repName, invs]) => {
          const repTotal = invs.reduce((s, i) => s + (i.totals?.remaining || 0), 0);
          return (
            <div key={repName} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f4f7fa', padding: '8px 12px', borderRadius: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 16 }}>🛵 {repName}</b>
                <span className="muted">{num(invs.length, ar)} فاتورة</span>
                {repTotal > 0 && <span className="badge red" style={{ marginRight: 'auto' }}>عليه {num(repTotal, ar)} {settings.currency}</span>}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr><th>فاتورة</th><th>التاريخ</th><th>العميل</th><th>الصافي</th><th>المتبقي</th><th>الحالة</th><th>إجراءات</th></tr>
                  </thead>
                  <tbody>
                    {invs.map((i) => (
                      <tr key={i.id}>
                        <td><b>{num(i.number, ar)}</b></td>
                        <td>{fmtDate(i.date, ar)}</td>
                        <td>{i.customer?.name}</td>
                        <td>{num(i.totals?.net || 0, ar)}</td>
                        <td>{(i.totals?.remaining || 0) > 0 ? <b className="red-text">{num(i.totals.remaining, ar)}</b> : '—'}</td>
                        <td>
                          <span className={`badge ${(i.totals?.remaining || 0) <= 0 ? 'green' : i.repStatus === 'تحصيل جزئي' ? 'orange' : 'red'}`}>
                            {(i.totals?.remaining || 0) <= 0 ? 'تم التحصيل ✅' : i.repStatus || 'مع المندوب'}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          {(i.totals?.remaining || 0) > 0 && (
                            <button className="btn-sm btn-green" onClick={() => collect(i)}>💵 تحصيل</button>
                          )}
                          <Link className="btn btn-sm btn-primary" href={`/print/${i.id}`}>🖨️</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
