'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { getInvoice, getSettings, listInvoices } from '@/lib/db';
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
  const [nav, setNav] = useState({ prev: null, next: null });

  useEffect(() => {
    const inv = getInvoice(id);
    const s = getSettings();
    setInvoice(inv);
    setSettings(s);
    // التنقل بين الفواتير بالترتيب: يمين = السابقة، شمال = التالية
    const all = listInvoices().sort((a, b) => (a.number || 0) - (b.number || 0));
    const idx = all.findIndex((x) => x.id === id);
    setNav({
      prev: idx > 0 ? all[idx - 1] : null,
      next: idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null,
    });
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

  // أسهم الكيبورد: يمين للفاتورة السابقة وشمال للتالية
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' && nav.prev) router.push(`/print/${nav.prev.id}`);
      if (e.key === 'ArrowLeft' && nav.next) router.push(`/print/${nav.next.id}`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, router]);

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
      {/* الطباعة دايماً على A4 عادي (مضمونة مع كل الطابعات) — القصيرة بتطلع في النص العلوي مع خط قص */}
      <div className="print-actions no-print">
        <button className="btn-primary" disabled={!nav.prev}
          title={nav.prev ? `فاتورة ${nav.prev.number}` : ''}
          onClick={() => nav.prev && router.push(`/print/${nav.prev.id}`)}>
          ▶ السابقة
        </button>
        <button className="btn-accent" onClick={doPrint}>
          🖨️ طباعة{settings.printerName ? ` — ${settings.printerName}` : ''}
        </button>
        <button className="btn-primary" disabled={!nav.next}
          title={nav.next ? `فاتورة ${nav.next.number}` : ''}
          onClick={() => nav.next && router.push(`/print/${nav.next.id}`)}>
          التالية ◀
        </button>
        <button onClick={() => setPaper(paper === 'a5' ? 'a4' : 'a5')}>
          📄 {paper === 'a5' ? 'الوضع: نص ورقة (اقطع عند خط ✂)' : 'الوضع: ورقة كاملة'}
        </button>
        {invoice.customer?.phone && (
          <a className="btn btn-green" target="_blank" rel="noreferrer" href={waMeLink(invoice.customer.phone, waMsg)}>
            💬 إرسال واتساب
          </a>
        )}
        <button onClick={() => router.push('/pos')}>⬅ رجوع للبيع</button>
      </div>
      <InvoiceDoc invoice={invoice} settings={settings} qrDataUrl={qr} paper={paper} />
      {paper === 'a5' && (
        <div className="cut-line">✂ ‏- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - قص هنا</div>
      )}
    </div>
  );
}
