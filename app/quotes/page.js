'use client';
// 📝 عروض الأسعار (Quotations): تعمل عرض سعر لعميل وتبعتهوله، ويتحوّل لفاتورة بضغطة
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listProducts, findProduct, listCustomers, getSettings,
  listQuotes, saveQuote, nextQuoteNumber, setQuoteStatus, deleteQuote,
} from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';
import { waMeLink } from '@/lib/wa';
import { dangerBox } from '@/lib/ui';
import ProductPicker from '@/components/ProductPicker';
import { useDraft, clearDraft } from '@/lib/useDraft';

const emptyRow = () => ({ code: '', name: '', qty: 1, price: '' });
const DRAFT_KEY = 'saqqa_quote_draft';

export default function QuotesPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState('');

  function reload() {
    setSettings(getSettings());
    setProducts(listProducts());
    setCustomers(listCustomers());
    setQuotes(listQuotes());
  }
  useEffect(reload, []);

  useDraft(DRAFT_KEY, { rows, custName, custPhone, notes }, {
    hasContent: (d) => d.rows?.some((r) => r.code || r.name) || d.custName,
    onRestore: (d) => {
      if (d.rows?.length) setRows(d.rows);
      if (d.custName) setCustName(d.custName);
      if (d.custPhone) setCustPhone(d.custPhone);
      if (d.notes) setNotes(d.notes);
      showToast('🔄 رجّعنا عرض السعر اللي كنت بتكتبه');
    },
  });

  // السعر حسب نوع العميل: تاجر جملة = سعر البيع · غير كده = سعر النقدي (وإلا سعر البيع)
  function priceFor(p) {
    const c = customers.find((x) => x.name === custName);
    if (c?.priceType === 'تاجر جملة') return Number(p.price) || 0;
    return Number(p.priceRetail) > 0 ? Number(p.priceRetail) : (Number(p.price) || 0);
  }

  const subtotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0), [rows]);
  if (!settings) return null;
  const ar = settings.arabicDigits;
  const cur = settings.currency;

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 3500); }

  function updateRow(i, patch) {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.code || last.name) next.push(emptyRow());
      return next;
    });
  }
  function lookupCode(i, code) {
    const p = findProduct(code);
    if (p) updateRow(i, { code: p.code, name: p.name, price: priceFor(p) });
  }

  function collectItems() {
    return rows.filter((r) => (r.code || r.name) && Number(r.qty) > 0)
      .map((r) => ({ code: r.code || '', name: r.name, qty: Number(r.qty) || 0, price: Number(r.price) || 0, total: (Number(r.qty) || 0) * (Number(r.price) || 0) }));
  }
  function save() {
    const items = collectItems();
    if (!items.length) { showToast('⚠️ أضف صنف واحد على الأقل'); return; }
    if (!custName.trim()) { showToast('⚠️ اكتب اسم العميل'); return; }
    const q = saveQuote({
      number: nextQuoteNumber(), date: todayISO(),
      customer: { name: custName.trim(), phone: custPhone.trim() },
      items, notes: notes.trim(), total: subtotal, status: 'مفتوح',
    });
    setRows([emptyRow()]); setCustName(''); setCustPhone(''); setNotes('');
    clearDraft(DRAFT_KEY);
    reload();
    showToast(`✅ اتحفظ عرض السعر رقم ${q.number}`);
  }

  function quoteText(q) {
    const lines = (q.items || []).map((it) => `• ${it.name} × ${num(it.qty)} = ${num(it.total)} ${cur}`);
    return `📝 عرض سعر رقم ${q.number} — ${settings.companyName}\nالعميل: ${q.customer?.name}\n${fmtDate(q.date)}\n━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━\nالإجمالي: ${num(q.total)} ${cur}\n${q.notes || ''}`;
  }
  function convert(q) {
    setQuoteStatus(q.id, 'اتحول لفاتورة');
    sessionStorage.setItem('saqqa_quote_conv', JSON.stringify(q));
    router.push('/pos?quote=' + q.id);
  }

  const itemsCount = rows.filter((r) => r.code || r.name).length;

  return (
    <div>
      <div className="card">
        <h3>📝 عرض سعر جديد <small className="muted">— بيتبعت للعميل ويتحوّل لفاتورة بضغطة</small></h3>
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <label className="field"><span>العميل</span>
            <input list="q-cust" value={custName} onChange={(e) => {
              setCustName(e.target.value);
              const c = customers.find((x) => x.name === e.target.value);
              if (c?.phone) setCustPhone(c.phone);
            }} placeholder="اسم العميل..." />
            <datalist id="q-cust">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </label>
          <label className="field"><span>تليفون العميل</span>
            <input dir="ltr" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="01xxxxxxxxx" /></label>
          <label className="field"><span>ملاحظات (سريان العرض مثلاً)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="العرض ساري ٧ أيام..." /></label>
        </div>
        <table className="pos-grid">
          <thead><tr><th style={{ width: 90 }}>الكود</th><th>الصنف</th><th style={{ width: 80 }}>الكمية</th><th style={{ width: 100 }}>السعر</th><th style={{ width: 100 }}>الإجمالي</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="num" value={r.code} onChange={(e) => updateRow(i, { code: e.target.value })}
                  onBlur={(e) => e.target.value && !r.name && lookupCode(i, e.target.value)} /></td>
                <td><ProductPicker value={r.name} products={products} arabicDigits={ar} sortMode={settings.suggestSort}
                  onType={(v) => updateRow(i, { name: v })}
                  onSelect={(p) => updateRow(i, { code: p.code, name: p.name, price: priceFor(p) })} /></td>
                <td><input className="num" type="number" min="0" step="any" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} /></td>
                <td><input className="num" type="number" min="0" step="any" value={r.price} onChange={(e) => updateRow(i, { price: e.target.value })} /></td>
                <td className="total-cell">{num((Number(r.qty) || 0) * (Number(r.price) || 0), ar)}</td>
                <td style={{ textAlign: 'center' }}><button className="btn-sm btn-red" tabIndex={-1}
                  onClick={() => setRows((p) => p.filter((_, x) => x !== i).length ? p.filter((_, x) => x !== i) : [emptyRow()])}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-green" onClick={save}>💾 حفظ العرض</button>
          {itemsCount > 0 && <span className="badge">{num(itemsCount, ar)} صنف</span>}
          <b style={{ marginRight: 'auto' }}>الإجمالي: {num(subtotal, ar)} {cur}</b>
        </div>
      </div>

      <div className="card">
        <h3>📜 عروض الأسعار السابقة</h3>
        <table className="tbl">
          <thead><tr><th>رقم</th><th>التاريخ</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th style={{ width: 300 }}></th></tr></thead>
          <tbody>
            {quotes.slice(0, 20).map((q) => (
              <tr key={q.id}>
                <td><b>{num(q.number, ar)}</b></td>
                <td>{fmtDate(q.date, ar)}</td>
                <td>{q.customer?.name}</td>
                <td>{num(q.items?.length || 0, ar)}</td>
                <td><b>{num(q.total, ar)}</b></td>
                <td>{q.status === 'اتحول لفاتورة' ? <span className="badge green">✅ اتحول لفاتورة</span> : <span className="badge">{q.status || 'مفتوح'}</span>}</td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {q.status !== 'اتحول لفاتورة' && <button className="btn-sm btn-primary" onClick={() => convert(q)}>🧾 حوّله لفاتورة</button>}
                  {q.customer?.phone && <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={waMeLink(q.customer.phone, quoteText(q))}>💬 واتساب</a>}
                  <button className="btn-sm" onClick={() => { navigator.clipboard?.writeText(quoteText(q)); showToast('📋 اتنسخ العرض'); }}>📋 نسخ</button>
                  <button className="btn-sm btn-red" onClick={async () => { if (await dangerBox(`حذف عرض السعر رقم ${q.number}؟`)) { deleteQuote(q.id); reload(); } }}>🗑️</button>
                </td>
              </tr>
            ))}
            {!quotes.length && <tr><td colSpan={7} className="muted">مفيش عروض أسعار بعد — اعمل أول عرض من فوق ⬆</td></tr>}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
