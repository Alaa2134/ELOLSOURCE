'use client';
// نموذج طباعة "بيان أسعار" — مطابق لفاتورة السقا للأدوات المنزلية الورقية
// الترتيب من اليمين: اسم الشركة ← اسم العميل/نقدي ← جدول البيان ← اللوجو
// الفواتير الطويلة بتتقسم صفحات تلقائياً مع "صفحة ١ من ٢"
import { num, fmtDate, fmtDateLong, fmtTime, toArabicDigits } from '@/lib/format';

const ROWS_PER_PAGE = 22; // عدد الأصناف في الصفحة الواحدة

// paper: 'a4' عادي — 'a5' نص ورقة للفواتير القصيرة (بدون صفوف فاضية)
export default function InvoiceDoc({ invoice, settings, qrDataUrl, paper = 'a4' }) {
  const ar = settings.arabicDigits;
  const items = invoice.items || [];
  const t = invoice.totals || {};

  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += ROWS_PER_PAGE) {
    pages.push(items.slice(i, i + ROWS_PER_PAGE));
  }
  const pg = (n) => (ar ? toArabicDigits(String(n)) : String(n));

  const Header = () => (
    <div className="inv-head">
      <div className="co">
        <div className="name">{settings.companyName}</div>
        <div className="doc">{settings.docTitle}</div>
        <div className="tm">{fmtTime(invoice.date, ar)}</div>
      </div>
      <div className="mid">
        <div className="inv-box">{invoice.customer?.name || 'عميل نقدي'}</div>
        <div className="inv-box">{invoice.payment || 'نقدي'}</div>
      </div>
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
              <td className="k">رقم العميل</td>
              <td style={{ textAlign: 'center' }}>{num(invoice.customer?.number || 1, ar)}</td>
            </tr>
            <tr>
              <td className="k">العنوان</td>
              <td style={{ textAlign: 'center' }}>{invoice.customer?.address || ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="logo-print">
        <img src="/logo.jpg" alt="ALSAKA" />
      </div>
    </div>
  );

  const Footer = ({ pageIndex }) => (
    <div className="inv-foot">
      <span>{fmtDateLong(invoice.date, ar)}</span>
      <span>{settings.phones}</span>
      <span>صفحة {pg(pageIndex + 1)} من {pg(pages.length)}</span>
    </div>
  );

  return (
    <>
      {pages.map((pageItems, pi) => {
        const last = pi === pages.length - 1;
        const start = pi * ROWS_PER_PAGE;
        return (
          <div className={`a4 ${paper === 'a5' ? 'half' : ''} ${last ? '' : 'a4-break'}`} key={pi}>
            <div className="inv-outer">
              <Header />
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
                  {pageItems.map((it, i) => (
                    <tr key={i}>
                      <td className="c">{num(start + i + 1, ar)}</td>
                      <td className="c">{ar ? toArabicDigits(it.code) : it.code}</td>
                      <td>{it.name}</td>
                      <td className="c">{num(it.qty, ar)}</td>
                      <td className="c">{num(it.price, ar)}</td>
                      <td className="c" style={{ fontWeight: 700 }}>{num(it.total, ar)}</td>
                      <td className="c">{it.notes || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {last && (
                <>
                  <div className="inv-totals">
                    <div className="tbox">الإجمالي: {num(t.subtotal ?? 0, ar)} {settings.currency}</div>
                    {(t.discount || 0) > 0 && <div className="tbox">الخصم: {num(t.discount, ar)}</div>}
                    {(t.prevBalance || 0) > 0 && <div className="tbox">حساب سابق: {num(t.prevBalance, ar)}</div>}
                    <div className="tbox shaded">الصافي: {num(t.net ?? 0, ar)} {settings.currency}</div>
                    {(t.remaining || 0) > 0 && <div className="tbox">المتبقي: {num(t.remaining, ar)}</div>}
                    {qrDataUrl && (
                      <img src={qrDataUrl} alt="QR" width={58} height={58}
                        style={{ marginRight: 'auto', border: '1px solid #000' }} />
                    )}
                  </div>
                  <div className="inv-notes">ملاحظة: {invoice.notes || ''}</div>
                </>
              )}

              <Footer pageIndex={pi} />
            </div>
          </div>
        );
      })}
    </>
  );
}
