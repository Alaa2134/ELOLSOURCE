'use client';
// إيصال حراري 80mm — عمود واحد مضغوط لطابعة الكاشير الصغيرة
import { num, fmtDate, fmtTime } from '@/lib/format';

export default function ThermalReceipt({ invoice, settings, qrDataUrl }) {
  if (!invoice || !settings) return null;
  const ar = settings.arabicDigits;
  const t = invoice.totals || {};
  const cur = settings.currency;
  const items = invoice.items || [];

  return (
    <div className="thermal-receipt">
      <div className="th-center th-big">{settings.companyName}</div>
      {settings.phones && <div className="th-center th-sm">{settings.phones}</div>}
      <div className="th-hr" />
      <div className="th-row"><span>فاتورة رقم</span><b>{num(invoice.number, ar)}</b></div>
      <div className="th-row"><span>التاريخ</span><span>{fmtDate(invoice.date, ar)} {fmtTime(invoice.date, ar)}</span></div>
      {invoice.customer?.name && <div className="th-row"><span>العميل</span><span>{invoice.customer.name}</span></div>}
      {invoice.cashier && <div className="th-row"><span>الكاشير</span><span>{invoice.cashier}</span></div>}
      <div className="th-hr" />

      <table className="th-items">
        <thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="th-name">{it.name}</td>
              <td>{num(it.qty, ar)}</td>
              <td>{num(it.price, ar)}</td>
              <td>{num(it.total, ar)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="th-hr" />
      <div className="th-row"><span>الإجمالي</span><b>{num(t.subtotal ?? 0, ar)} {cur}</b></div>
      {(t.discount || 0) > 0 && <div className="th-row"><span>الخصم</span><span>{num(t.discount, ar)}</span></div>}
      {(t.prevBalance || 0) > 0 && <div className="th-row"><span>حساب سابق</span><span>{num(t.prevBalance, ar)}</span></div>}
      <div className="th-row th-total"><span>الصافي</span><b>{num(t.net ?? 0, ar)} {cur}</b></div>
      {(t.paid || 0) > 0 && <div className="th-row"><span>المدفوع</span><span>{num(t.paid, ar)}</span></div>}
      {(t.remaining || 0) > 0 && <div className="th-row"><span>المتبقي</span><b>{num(t.remaining, ar)} {cur}</b></div>}

      {invoice.notes && <div className="th-note">ملاحظة: {invoice.notes}</div>}
      {settings.invoice?.footerText && <div className="th-center th-sm" style={{ marginTop: 4 }}>{settings.invoice.footerText}</div>}
      {qrDataUrl && <div className="th-center" style={{ marginTop: 6 }}><img src={qrDataUrl} width={90} height={90} alt="QR" /></div>}
      <div className="th-center th-sm" style={{ marginTop: 6 }}>شكراً لتعاملكم معنا 🌹</div>
    </div>
  );
}
