'use client';
// نموذج طباعة "بيان أسعار" — مطابق لشكل فاتورة السقا للأدوات المنزلية
import { num, fmtDate, fmtTime, toArabicDigits } from '@/lib/format';

const MIN_ROWS = 14; // صفوف فاضية لتكملة شكل الجدول

export default function InvoiceDoc({ invoice, settings, qrDataUrl }) {
  const ar = settings.arabicDigits;
  const items = invoice.items || [];
  const emptyCount = Math.max(0, MIN_ROWS - items.length);
  const t = invoice.totals || {};

  return (
    <div className="a4">
      <div className="inv-outer">
        <div className="inv-head">
          <div className="meta">
            <table className="inv-meta-table">
              <tbody>
                <tr>
                  <td className="k">رقم البيان</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{num(invoice.number, ar)}</td>
                </tr>
                <tr>
                  <td className="k">تاريخ</td>
                  <td style={{ textAlign: 'center' }}>{fmtDate(invoice.date, ar)}</td>
                </tr>
                <tr>
                  <td className="k">نوع الدفع</td>
                  <td style={{ textAlign: 'center' }}>{invoice.payment || 'نقدي'}</td>
                </tr>
                <tr>
                  <td className="k">العنوان</td>
                  <td style={{ textAlign: 'center' }}>{invoice.customer?.address || ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mid">
            <div className="inv-box">{invoice.customer?.name || 'عميل نقدي'}</div>
            <div className="inv-box" style={{ background: '#eee' }}>{invoice.payment || 'نقدي'}</div>
          </div>
          <div className="co">
            <div className="name">{settings.companyName}</div>
            <div className="doc">{settings.docTitle}</div>
            <div className="tm">{fmtTime(invoice.date, ar)}</div>
          </div>
          <div className="logo-print">
            <div className="circ">
              {settings.logoText || 'A'}
              <small>lska</small>
            </div>
          </div>
        </div>

        <table className="inv-items">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>م</th>
              <th style={{ width: '11%' }}>رقم الصنف</th>
              <th style={{ width: '42%' }}>اسم الصنف</th>
              <th style={{ width: '8%' }}>الكمية</th>
              <th style={{ width: '11%' }}>السعر</th>
              <th style={{ width: '12%' }}>الإجمالي</th>
              <th style={{ width: '11%' }}>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="c">{num(i + 1, ar)}</td>
                <td className="c">{ar ? toArabicDigits(it.code) : it.code}</td>
                <td>{it.name}</td>
                <td className="c">{num(it.qty, ar)}</td>
                <td className="c">{num(it.price, ar)}</td>
                <td className="c" style={{ fontWeight: 700 }}>{num(it.total, ar)}</td>
                <td className="c">{it.notes || ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyCount }).map((_, i) => (
              <tr className="empty" key={`e${i}`}>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-totals">
          <div className="tbox">الإجمالي: {num(t.subtotal ?? 0, ar)} {settings.currency}</div>
          {(t.discount || 0) > 0 && <div className="tbox">الخصم: {num(t.discount, ar)}</div>}
          <div className="tbox" style={{ background: '#eee' }}>الصافي: {num(t.net ?? 0, ar)} {settings.currency}</div>
          {(t.remaining || 0) > 0 && <div className="tbox">المتبقي: {num(t.remaining, ar)}</div>}
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR"
              width={58}
              height={58}
              style={{ marginRight: 'auto', border: '1px solid #000' }}
            />
          )}
        </div>

        <div className="inv-notes">ملاحظة: {invoice.notes || ''}</div>

        <div className="inv-foot">
          <span>{fmtDate(invoice.date, ar)}</span>
          <span>{settings.phones}</span>
          <span>{ar ? 'صفحة ١ من ١' : 'صفحة 1 من 1'}</span>
        </div>
      </div>
    </div>
  );
}
