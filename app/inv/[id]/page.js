'use client';
// صفحة عامة يفتحها العميل من رابط الواتساب أو QR الفاتورة — بدون تسجيل دخول
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getInvoice, fetchInvoiceCloud, getSettings, cloudEnabled, cloudConfigFromHash } from '@/lib/db';
import InvoiceDoc from '@/components/InvoiceDoc';

export default function PublicInvoicePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      cloudConfigFromHash(); // رابط الفاتورة بيحمل إعداد السحابة لموبايل العميل تلقائياً
      let inv = null;
      if (cloudEnabled()) inv = await fetchInvoiceCloud(id);
      if (!inv) inv = getInvoice(id);
      setInvoice(inv);
      setSettings(getSettings());
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>جاري تحميل الفاتورة...</p>;
  if (!invoice || !settings)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>عذراً، الفاتورة غير موجودة</h2>
        <p className="muted">تأكد من صحة الرابط أو تواصل مع السقا للأدوات المنزلية</p>
      </div>
    );

  return (
    <div style={{ background: '#888', minHeight: '100vh', padding: '14px 0' }}>
      <div className="print-actions no-print">
        <button className="btn-accent" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
      </div>
      <InvoiceDoc invoice={invoice} settings={settings} />
    </div>
  );
}
