'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { getInvoice, getSettings } from '@/lib/db';
import { invoiceLink, waMeLink, buildMessage } from '@/lib/wa';
import InvoiceDoc from '@/components/InvoiceDoc';

export default function PrintPage() {
  const { id } = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [settings, setSettings] = useState(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    const inv = getInvoice(id);
    const s = getSettings();
    setInvoice(inv);
    setSettings(s);
    if (inv) {
      const link = invoiceLink(s, inv.id);
      if (link) QRCode.toDataURL(link, { margin: 0, width: 120 }).then(setQr).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    if (invoice && search.get('auto') === '1') {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [invoice, search]);

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
      <div className="print-actions no-print">
        <button className="btn-accent" onClick={() => window.print()}>🖨️ طباعة</button>
        {invoice.customer?.phone && (
          <a className="btn btn-green" target="_blank" rel="noreferrer" href={waMeLink(invoice.customer.phone, waMsg)}>
            💬 إرسال واتساب
          </a>
        )}
        <button onClick={() => router.push('/pos')}>⬅ رجوع للبيع</button>
      </div>
      <InvoiceDoc invoice={invoice} settings={settings} qrDataUrl={qr} />
    </div>
  );
}
