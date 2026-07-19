'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { getInvoice, getSettings } from '@/lib/db';
import { invoiceLink, waMeLink, buildMessage } from '@/lib/wa';
import InvoiceDoc from '@/components/InvoiceDoc';

const SHORT_LIMIT = 8; // فاتورة ≤ 8 أصناف بتتطبع على نص ورقة A4

export default function PrintPage() {
  const { id } = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [qr, setQr] = useState('');
  const [paper, setPaper] = useState('a4');

  useEffect(() => {
    const inv = getInvoice(id);
    const s = getSettings();
    setInvoice(inv);
    setSettings(s);
    if (inv) {
      // فاتورة قصيرة → نص ورقة تلقائياً
      setPaper((inv.items || []).length <= SHORT_LIMIT ? 'a5' : 'a4');
      const link = invoiceLink(s, inv.id);
      if (link) QRCode.toDataURL(link, { margin: 0, width: 120 }).then(setQr).catch(() => {});
    }
  }, [id]);

  // الطباعة: في نسخة الديسكتوب بتطبع مباشرة على الطابعة المختارة — في المتصفح بتفتح نافذة الطباعة
  function doPrint() {
    if (typeof window !== 'undefined' && window.electronAPI?.print) {
      window.electronAPI.print(settings?.printerName || '');
    } else {
      window.print();
    }
  }

  useEffect(() => {
    if (invoice && settings && search.get('auto') === '1') {
      const t = setTimeout(doPrint, 700);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, settings, search]);

  if (!invoice || !settings) return <p style={{ padding: 30, textAlign: 'center' }}>جاري التحميل...</p>;

  const waMsg = buildMessage(settings.wa.thanksTemplate, {
    name: invoice.customer?.name,
    number: invoice.number,
    total: invoice.totals?.net,
    currency: settings.currency,
    company: settings.companyName,
    link: settings.wa.sendInvoiceLink ? `📄 فاتورتك: ${invoiceLink(settings, invoice.id)}` : '',
  });

  return (
    <div style={{ background: '#888', minHeight: '100vh', padding: '14px 0' }}>
      {/* حجم ورقة الطباعة حسب طول الفاتورة: نص A4 للقصيرة */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print { @page { size: ${paper === 'a5' ? 'A5 landscape' : 'A4 portrait'}; margin: 6mm; } }`,
        }}
      />
      <div className="print-actions no-print">
        <button className="btn-accent" onClick={doPrint}>
          🖨️ طباعة ({paper === 'a5' ? 'نص ورقة' : 'A4'})
          {settings.printerName ? ` — ${settings.printerName}` : ''}
        </button>
        <button onClick={() => setPaper(paper === 'a5' ? 'a4' : 'a5')}>
          📄 تبديل الحجم: {paper === 'a5' ? 'ورقة A4 كاملة' : 'نص ورقة'}
        </button>
        {invoice.customer?.phone && (
          <a className="btn btn-green" target="_blank" rel="noreferrer" href={waMeLink(invoice.customer.phone, waMsg)}>
            💬 إرسال واتساب
          </a>
        )}
        <button onClick={() => router.push('/pos')}>⬅ رجوع للبيع</button>
      </div>
      <InvoiceDoc invoice={invoice} settings={settings} qrDataUrl={qr} paper={paper} />
    </div>
  );
}
