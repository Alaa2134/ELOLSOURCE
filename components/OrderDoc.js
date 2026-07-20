'use client';
// نموذج طباعة "طلب بضاعة من مورد" — نفس شكل فاتورة الشركة لكن من غير أي أسعار
// بيتبعت للمورد واتساب أو يتطبع ويتسلم له
import { num, fmtDate, fmtDateLong, toArabicDigits } from '@/lib/format';

const LOGO_SIZES = { 'صغير': 56, 'وسط': 84, 'كبير': 112 };
const FONT_SIZES = { 'صغير': 12, 'وسط': 14, 'كبير': 16 };

export default function OrderDoc({ order, settings }) {
  const ar = settings.arabicDigits;
  const opt = settings.invoice || {};
  const items = order.items || [];
  const rowsPerPage = Math.max(8, Number(opt.rowsPerPage) || 22);
  const fontPx = FONT_SIZES[opt.fontSize] || 14;
  const logoPx = LOGO_SIZES[opt.logoSize] || 84;

  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += rowsPerPage) {
    pages.push(items.slice(i, i + rowsPerPage));
  }
  const pg = (n) => (ar ? toArabicDigits(String(n)) : String(n));
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const Header = () => (
    <div className="inv-head">
      <div className="co">
        <div className="name">{settings.companyName}</div>
        <div className="doc">طلب بضاعة</div>
      </div>
      <div className="mid">
        <div className="inv-box">المورد: {order.supplier?.name || ''}</div>
        <div className="inv-box">نرجو توريد الأصناف التالية</div>
      </div>
      <div className="meta">
        <table className="inv-meta-table">
          <tbody>
            <tr>
              <td className="k">رقم الطلب</td>
              <td style={{ textAlign: 'center', fontWeight: 700 }}>{num(order.number, ar)}</td>
            </tr>
            <tr>
              <td className="k">تاريخ</td>
              <td style={{ textAlign: 'center' }}>{fmtDate(order.date, ar)}</td>
            </tr>
            <tr>
              <td className="k">عدد الأصناف</td>
              <td style={{ textAlign: 'center' }}>{num(items.length, ar)}</td>
            </tr>
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
      <span>{fmtDateLong(order.date, ar)}</span>
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
          <div className={`a4 ${last ? '' : 'a4-break'}`} key={pi}>
            <div className="inv-outer">
              <Header />
              <table className="inv-items" style={{ fontSize: fontPx }}>
                <thead>
                  <tr>
                    <th style={{ width: '6%', fontSize: fontPx }}>م</th>
                    <th style={{ width: '14%', fontSize: fontPx }}>رقم الصنف</th>
                    <th style={{ fontSize: fontPx }}>اسم الصنف</th>
                    <th style={{ width: '11%', fontSize: fontPx }}>الكمية</th>
                    <th style={{ width: '20%', fontSize: fontPx }}>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((it, i) => (
                    <tr key={i}>
                      <td className="c">{num(start + i + 1, ar)}</td>
                      <td className="c">{ar ? toArabicDigits(String(it.code || '')) : it.code}</td>
                      <td>{it.name}</td>
                      <td className="c" style={{ fontWeight: 700 }}>{num(it.qty, ar)}</td>
                      <td className="c">{it.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {last && (
                <>
                  <div className="inv-totals">
                    <div className="tbox">عدد الأصناف: {num(items.length, ar)}</div>
                    <div className="tbox shaded">إجمالي الكميات: {num(totalQty, ar)}</div>
                  </div>
                  <div className="inv-notes">ملاحظة: {order.notes || ''}</div>
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
