'use client';
// طباعة سند القبض
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getPayment, getSettings } from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';

export default function PaymentPrintPage() {
  const { id } = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const [p, setP] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    setP(getPayment(id));
    setSettings(getSettings());
  }, [id]);

  useEffect(() => {
    if (p && search.get('auto') === '1') {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [p, search]);

  if (!p || !settings) return <p style={{ padding: 30, textAlign: 'center' }}>جاري التحميل...</p>;
  const ar = settings.arabicDigits;

  return (
    <div style={{ background: '#888', minHeight: '100vh', padding: '14px 0' }}>
      <div className="print-actions no-print">
        <button className="btn-accent" onClick={() => window.print()}>🖨️ طباعة</button>
        <button onClick={() => router.push('/payments')}>⬅ رجوع</button>
      </div>
      <div className="a4 voucher">
        <div className="inv-outer" style={{ flex: 'none' }}>
          <div className="inv-head">
            <div className="meta">
              <table className="inv-meta-table">
                <tbody>
                  <tr><td className="k">رقم السند</td><td style={{ textAlign: 'center', fontWeight: 700 }}>{num(p.number, ar)}</td></tr>
                  <tr><td className="k">التاريخ</td><td style={{ textAlign: 'center' }}>{fmtDate(p.date, ar)}</td></tr>
                  <tr><td className="k">الوقت</td><td style={{ textAlign: 'center' }}>{fmtTime(p.date, ar)}</td></tr>
                  <tr><td className="k">طريقة الدفع</td><td style={{ textAlign: 'center' }}>{p.method}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="co">
              <div className="name">{settings.companyName}</div>
              <div className="doc">سـنـد قـبـض</div>
            </div>
            <div className="logo-print">
              <img src="/logo.jpg" alt="ALSAKA" />
            </div>
          </div>

          <div style={{ padding: '16px 20px', fontSize: 17, lineHeight: 2.4 }}>
            <p>استلمنا من السيد/ <b style={{ borderBottom: '1px dotted #000', padding: '0 30px' }}>{p.customerName}</b></p>
            <p>
              مبلغ وقدره <b style={{ border: '1.5px solid #000', padding: '2px 24px', fontSize: 20 }}>{num(p.amount, ar)} {settings.currency}</b>
              &nbsp; وذلك سداداً من الحساب.
            </p>
            <p>
              الحساب قبل السداد: <b>{num(p.debtBefore ?? 0, ar)} {settings.currency}</b>
              &nbsp;&nbsp;—&nbsp;&nbsp; المتبقي بعد السداد: <b style={{ color: '#000' }}>{num(p.debtAfter ?? 0, ar)} {settings.currency}</b>
            </p>
            {p.notes && <p>ملاحظات: {p.notes}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30, fontSize: 15 }}>
              <span>توقيع المستلم: ..........................</span>
              <span>توقيع العميل: ..........................</span>
            </div>
          </div>

          <div className="inv-foot">
            <span>{fmtDate(p.date, ar)}</span>
            <span>{settings.phones}</span>
            <span>{settings.companyName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
