'use client';
// معاينة وطباعة طلب البضاعة — A4 من غير أي أسعار + إرسال واتساب للمورد
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOrder, getSettings } from '@/lib/db';
import { waMeLink, buildOrderText } from '@/lib/wa';
import OrderDoc from '@/components/OrderDoc';

export default function OrderPrintPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    setOrder(getOrder(id));
    setSettings(getSettings());
  }, [id]);

  function doPrint() {
    if (typeof window !== 'undefined' && window.electronAPI?.print) {
      window.electronAPI.print(settings?.printerName || '');
    } else {
      window.print();
    }
  }

  if (!order || !settings) return <p style={{ padding: 30, textAlign: 'center' }}>جاري التحميل...</p>;

  return (
    <div style={{ background: '#888', minHeight: '100vh', padding: '14px 0' }}>
      <div className="print-actions no-print">
        <button className="btn-accent" onClick={doPrint}>
          🖨️ طباعة الطلب{settings.printerName ? ` — ${settings.printerName}` : ''}
        </button>
        {order.supplier?.phone && (
          <a className="btn btn-green" target="_blank" rel="noreferrer"
            href={waMeLink(order.supplier.phone, buildOrderText(order, settings))}>
            💬 إرسال واتساب للمورد
          </a>
        )}
        <button className="btn-primary" onClick={() => router.push(`/purchases?order=${order.id}`)}>
          📥 البضاعة وصلت — حوّلها فاتورة شراء
        </button>
        <button onClick={() => router.push('/order')}>⬅ رجوع للطلبات</button>
      </div>
      <OrderDoc order={order} settings={settings} />
    </div>
  );
}
