'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listInvoices, deleteInvoice, getSettings, isAdmin } from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';
import { waMeLink, buildMessage, invoiceLink, notifyAdmin } from '@/lib/wa';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [showCount, setShowCount] = useState(150); // عرض تدريجي عشان البرنامج ميتقلش مع آلاف الفواتير

  function reload() {
    setInvoices(listInvoices());
    setSettings(getSettings());
  }
  useEffect(reload, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const filtered = invoices.filter((i) => {
    if (!q) return true;
    const s = q.trim();
    return (
      String(i.number).includes(s) ||
      (i.customer?.name || '').includes(s) ||
      fmtDate(i.date).includes(s)
    );
  });
  const visible = filtered.slice(0, showCount);

  function waMsg(inv) {
    return buildMessage(settings.wa.thanksTemplate, {
      name: inv.customer?.name,
      number: inv.number,
      total: inv.totals?.net,
      currency: settings.currency,
      company: settings.companyName,
      link: settings.wa.sendInvoiceLink ? `📄 فاتورتك: ${invoiceLink(settings, inv.id)}` : '',
    });
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input
          style={{ maxWidth: 320 }}
          placeholder="🔍 بحث برقم الفاتورة / العميل / التاريخ"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="muted">{num(filtered.length, ar)} فاتورة</span>
        <Link href="/pos" className="btn btn-accent" style={{ marginRight: 'auto' }}>➕ فاتورة جديدة</Link>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>رقم</th><th>التاريخ</th><th>الوقت</th><th>العميل</th><th>المندوب</th><th>الدفع</th>
              <th>الصافي</th><th>المتبقي</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id}>
                <td>
                  <b>{num(i.number, ar)}</b>
                  {i.type === 'مرتجع' && <span className="badge red" style={{ marginRight: 6 }}>↩️ مرتجع{i.refNumber ? ` من ${num(i.refNumber, ar)}` : ''}</span>}
                </td>
                <td>{fmtDate(i.date, ar)}</td>
                <td>{fmtTime(i.date, ar)}</td>
                <td>{i.customer?.name}</td>
                <td>{i.rep ? <span className="badge blue">🛵 {i.rep}</span> : '—'}</td>
                <td><span className={`badge ${i.payment === 'نقدي' ? 'green' : 'orange'}`}>{i.payment}</span></td>
                <td><b>{num(i.totals?.net || 0, ar)}</b></td>
                <td>{(i.totals?.remaining || 0) > 0 ? <span className="red-text">{num(i.totals.remaining, ar)}</span> : '—'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <Link className="btn btn-sm btn-primary" href={`/print/${i.id}`}>🖨️ طباعة</Link>
                  {i.type !== 'مرتجع' && <Link className="btn btn-sm" href={`/returns?inv=${i.id}`} title="عمل مرتجع">↩️</Link>}
                  {i.customer?.phone && (
                    <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={waMeLink(i.customer.phone, waMsg(i))}>💬</a>
                  )}
                  {(isAdmin() || settings.perms?.allowDeleteInvoice) && (
                    <button
                      className="btn-sm btn-red"
                      onClick={() => {
                        if (confirm(`حذف الفاتورة رقم ${i.number}؟ سيتم إرجاع الكميات للمخزون.`)) {
                          deleteInvoice(i.id);
                          notifyAdmin(`🗑️ تم حذف فاتورة رقم ${i.number} (${i.customer?.name}) بقيمة ${i.totals?.net || 0}`);
                          reload();
                        }
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={9} className="muted">لا توجد فواتير</td></tr>}
          </tbody>
        </table>
      </div>
      {filtered.length > showCount && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="btn-primary" onClick={() => setShowCount((c) => c + 150)}>
            ⬇️ عرض المزيد ({num(filtered.length - showCount, ar)} فاتورة كمان)
          </button>
        </div>
      )}
    </div>
  );
}
