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
    let done = false;
    const finish = (inv) => {
      if (done) return;
      done = true;
      setInvoice(inv || null);
      setSettings(getSettings());
      setLoading(false);
    };
    (async () => {
      cloudConfigFromHash(); // رابط الفاتورة بيحمل إعداد السحابة لموبايل العميل تلقائياً
      // مهلة 12 ثانية: لو النت ضعيف منفضلش بنحمّل للأبد — نرجع للمحلي أو رسالة واضحة
      const timer = setTimeout(() => finish(getInvoice(id)), 12000);
      try {
        let inv = null;
        if (cloudEnabled()) inv = await fetchInvoiceCloud(id);
        if (!inv) inv = getInvoice(id);
        clearTimeout(timer);
        finish(inv);
      } catch {
        clearTimeout(timer);
        finish(getInvoice(id));
      }
    })();
  }, [id]);

  if (loading)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <img src="/logo.jpg" alt="" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 12 }} />
        <p>جاري تحميل الفاتورة...</p>
      </div>
    );
  if (!invoice || !settings)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <img src="/logo.jpg" alt="" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 12 }} />
        <h2>الفاتورة مش متاحة أونلاين حالياً</h2>
        <p className="muted" style={{ marginTop: 8, lineHeight: 2 }}>
          الفاتورة محفوظة عند السقا للأدوات المنزلية —<br />
          ممكن تطلب نسخة محدثة على الواتساب، أو تجرب الرابط تاني بعد شوية.
        </p>
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
