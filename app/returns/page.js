'use client';
// مرتجع بيع: اختار الفاتورة الأصلية وحدد الكميات — المخزون بيرجع والحساب بيتخصم تلقائياً
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listInvoices,
  getInvoice,
  saveInvoice,
  nextInvoiceNumber,
  applyReturnCredit,
  getSettings,
} from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';

export default function ReturnsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState(null); // الفاتورة الأصلية
  const [retQty, setRetQty] = useState({}); // كميات المرتجع
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setInvoices(listInvoices().filter((i) => i.type !== 'مرتجع'));
    const invId = new URLSearchParams(window.location.search).get('inv');
    if (invId) pick(getInvoice(invId));
  }, []);

  function pick(inv) {
    if (!inv) return;
    setSource(inv);
    setRetQty({});
    setQ('');
  }

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const found = q
    ? invoices.filter((i) => String(i.number).includes(q) || (i.customer?.name || '').includes(q)).slice(0, 8)
    : [];

  // كميات اترجعت قبل كده من نفس الفاتورة
  function alreadyReturned(code) {
    return listInvoices()
      .filter((r) => r.type === 'مرتجع' && r.refNumber === source?.number)
      .reduce((s, r) => s + (r.items || []).filter((it) => it.code === code).reduce((x, it) => x + (Number(it.qty) || 0), 0), 0);
  }

  const retItems = source
    ? (source.items || [])
        .map((it) => {
          const max = (Number(it.qty) || 0) - alreadyReturned(it.code);
          const qty = Math.min(Number(retQty[it.code]) || 0, max);
          return { ...it, max, retQty: qty, retTotal: qty * (Number(it.price) || 0) };
        })
    : [];
  const retTotal = retItems.reduce((s, it) => s + it.retTotal, 0);

  function save() {
    const items = retItems
      .filter((it) => it.retQty > 0)
      .map((it) => ({
        code: it.code,
        name: it.name,
        qty: it.retQty,
        stockQty: it.stockQty ? (it.stockQty / it.qty) * it.retQty : it.retQty,
        price: it.price,
        total: it.retTotal,
        notes: '',
      }));
    if (!items.length) { setToast('⚠️ حدد كمية مرتجعة لصنف واحد على الأقل'); setTimeout(() => setToast(''), 3000); return; }

    // المرتجع بيتخصم من آجل العميل الأول — والباقي كاش يترد له
    const { credited, cashRefund } = applyReturnCredit(source.customer?.name, retTotal, source.id);

    const inv = saveInvoice({
      number: nextInvoiceNumber(),
      date: todayISO(),
      type: 'مرتجع',
      refNumber: source.number,
      payment: source.payment,
      customer: source.customer,
      notes: reason ? `سبب المرتجع: ${reason}` : `مرتجع من فاتورة ${source.number}`,
      items,
      totals: { subtotal: retTotal, discount: 0, net: retTotal, paid: 0, remaining: 0, creditedToDebt: credited, cashRefund },
    });
    setToast(`✅ تم تسجيل المرتجع — اتخصم ${num(credited)} من الآجل${cashRefund > 0 ? ` ويُرد ${num(cashRefund)} نقدي للعميل` : ''}`);
    setTimeout(() => router.push(`/print/${inv.id}?auto=1`), 1200);
  }

  return (
    <div>
      {!source ? (
        <div className="card">
          <h3>↩️ مرتجع بيع — دور على الفاتورة الأصلية</h3>
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <input autoFocus placeholder="🔍 رقم الفاتورة أو اسم العميل..." value={q} onChange={(e) => setQ(e.target.value)} />
            {found.length > 0 && (
              <ul className="picker-list">
                {found.map((i) => (
                  <li key={i.id} onMouseDown={() => pick(i)}>
                    <span className="p-name">فاتورة {num(i.number, ar)} — {i.customer?.name}</span>
                    <span className="p-meta">{fmtDate(i.date, ar)} — {num(i.totals?.net || 0, ar)} ج</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>↩️ مرتجع من فاتورة {num(source.number, ar)} — {source.customer?.name}</h3>
            <button className="btn-sm" style={{ marginRight: 'auto' }} onClick={() => setSource(null)}>تغيير الفاتورة</button>
          </div>
          <table className="pos-grid">
            <thead>
              <tr>
                <th>الكود</th><th>الصنف</th><th>الكمية المباعة</th><th>اترجع قبل كده</th>
                <th style={{ width: 100 }}>كمية المرتجع</th><th>السعر</th><th>قيمة المرتجع</th>
              </tr>
            </thead>
            <tbody>
              {retItems.map((it) => (
                <tr key={it.code}>
                  <td className="num" style={{ textAlign: 'center' }}>{it.code}</td>
                  <td style={{ padding: '6px 8px' }}>{it.name}</td>
                  <td style={{ textAlign: 'center' }}>{num(it.qty, ar)}</td>
                  <td style={{ textAlign: 'center' }} className="muted">{num(it.qty - it.max, ar)}</td>
                  <td>
                    <input className="num" type="number" min="0" max={it.max} step="any"
                      value={retQty[it.code] || ''}
                      onChange={(e) => setRetQty({ ...retQty, [it.code]: Math.min(Number(e.target.value) || 0, it.max) })}
                      disabled={it.max <= 0} placeholder={it.max <= 0 ? 'اترجع كله' : `حتى ${it.max}`} />
                  </td>
                  <td style={{ textAlign: 'center' }}>{num(it.price, ar)}</td>
                  <td className="total-cell">{num(it.retTotal, ar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid cols-2" style={{ marginTop: 12, alignItems: 'end' }}>
            <label className="field">
              <span>سبب المرتجع (اختياري)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="عيب صناعة / تغيير رأي..." />
            </label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
              <b style={{ fontSize: 18 }} className="red-text">قيمة المرتجع: {num(retTotal, ar)} {settings.currency}</b>
              <button className="btn-accent" onClick={save} disabled={retTotal <= 0}>↩️ تسجيل وطباعة المرتجع</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
