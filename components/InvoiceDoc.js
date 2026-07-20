'use client';
// نموذج طباعة "بيان أسعار" — مطابق لفاتورة السقا للأدوات المنزلية الورقية
// الترتيب من اليمين: اسم الشركة ← اسم العميل/نقدي ← جدول البيان ← اللوجو
// الفواتير الطويلة بتتقسم صفحات تلقائياً — وكل التفاصيل بتتخصص من لوحة الأدمن
import { num, fmtDate, fmtDateLong, fmtTime, toArabicDigits } from '@/lib/format';

const LOGO_SIZES = { 'صغير': 56, 'وسط': 84, 'كبير': 112 };
const FONT_SIZES = { 'صغير': 12, 'وسط': 14, 'كبير': 16 };

export default function InvoiceDoc({ invoice, settings, qrDataUrl, paper = 'a4' }) {
  const ar = settings.arabicDigits;
  const opt = settings.invoice || {};
  const items = invoice.items || [];
  const t = invoice.totals || {};
  const rowsPerPage = Math.max(8, Number(opt.rowsPerPage) || 22);
  const fontPx = FONT_SIZES[opt.fontSize] || 14;
  const logoPx = LOGO_SIZES[opt.logoSize] || 84;

  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += rowsPerPage) {
    pages.push(items.slice(i, i + rowsPerPage));
  }
  const pg = (n) => (ar ? toArabicDigits(String(n)) : String(n));

  const Header = () => (
    <div className="inv-head">
      <div className="co">
        <div className="name">{settings.companyName}</div>
        <div className="doc">
          {invoice.type === 'مرتجع'
            ? `فاتورة مرتجع${invoice.refNumber ? ` — من فاتورة ${num(invoice.refNumber, ar)}` : ''}`
            : settings.docTitle}
        </div>
        {opt.showTime !== false && <div className="tm">{fmtTime(invoice.date, ar)}</div>}
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
            {opt.showCustomerNo !== false && (
              <tr>
                <td className="k">رقم العميل</td>
                <td style={{ textAlign: 'center' }}>{num(invoice.customer?.number || 1, ar)}</td>
              </tr>
            )}
            {opt.showAddressRow !== false && (
              <tr>
                <td className="k">العنوان</td>
                <td style={{ textAlign: 'center' }}>{invoice.customer?.address || ''}</td>
              </tr>
            )}
            {(opt.customFields || [])
              .filter((f) => f && f.label)
              .map((f, i) => (
                <tr key={`cf${i}`}>
                  <td className="k">{f.label}</td>
                  <td style={{ textAlign: 'center' }}>{f.value || ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {opt.showLogo !== false && (
        <div className="logo-print">
          <img src={settings.logoImage || '/logo.jpg'} alt="لوجو" style={{ width: logoPx, height: logoPx }} />
        </div>
      )}
    </div>
  );

  const Footer = ({ pageIndex }) => (
    <div className="inv-foot">
      <span>{fmtDateLong(invoice.date, ar)}</span>
      <span>{settings.phones}</span>
      {opt.showPageNo !== false && <span>صفحة {pg(pageIndex + 1)} من {pg(pages.length)}</span>}
    </div>
  );

  return (
    <>
      {pages.map((pageItems, pi) => {
        const last = pi === pages.length - 1;
        const start = pi * rowsPerPage;
        return (
          <div className={`a4 ${paper === 'a5' ? 'half' : ''} ${last ? '' : 'a4-break'}`} key={pi}>
            <div className="inv-outer">
              <Header />
              <table className="inv-items" style={{ fontSize: fontPx }}>
                <thead>
                  <tr>
                    <th style={{ width: '5%', fontSize: fontPx }}>م</th>
                    {opt.colCode !== false && <th style={{ width: '11%', fontSize: fontPx }}>رقم الصنف</th>}
                    <th style={{ fontSize: fontPx }}>اسم الصنف</th>
                    <th style={{ width: '8%', fontSize: fontPx }}>الكمية</th>
                    <th style={{ width: '11%', fontSize: fontPx }}>السعر</th>
                    <th style={{ width: '12%', fontSize: fontPx }}>الإجمالي</th>
                    {opt.colNotes !== false && <th style={{ width: '11%', fontSize: fontPx }}>ملاحظات</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((it, i) => (
                    <tr key={i}>
                      <td className="c">{num(start + i + 1, ar)}</td>
                      {opt.colCode !== false && <td className="c">{ar ? toArabicDigits(it.code) : it.code}</td>}
                      <td>{it.name}</td>
                      <td className="c">{num(it.qty, ar)}</td>
                      <td className="c">{num(it.price, ar)}</td>
                      <td className="c" style={{ fontWeight: 700 }}>{num(it.total, ar)}</td>
                      {opt.colNotes !== false && <td className="c">{it.notes || ''}</td>}
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
                    {opt.showQr !== false && qrDataUrl && (
                      <img src={qrDataUrl} alt="QR" width={58} height={58}
                        style={{ marginRight: 'auto', border: '1px solid #000' }} />
                    )}
                  </div>
                  <div className="inv-notes">
                    ملاحظة: {invoice.notes || ''}
                    {opt.footerText && (
                      <div style={{ marginTop: 4, fontWeight: 700, textAlign: 'center' }}>{opt.footerText}</div>
                    )}
                  </div>
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
