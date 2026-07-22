'use client';
// طلب بضاعة من مورد: بتختار الأصناف من منتجاتك وبتبعت الطلب للمورد بدون أي أسعار
// ولما البضاعة توصل بتحول الطلب لفاتورة شراء بضغطة واحدة
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listProducts,
  findProduct,
  listSuppliers,
  listOrders,
  saveOrder,
  nextOrderNumber,
  deleteOrder,
  getSettings,
} from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';
import { waMeLink, buildOrderText } from '@/lib/wa';
import ProductPicker from '@/components/ProductPicker';
import { dangerBox } from '@/lib/ui';
import { useDraft, clearDraft } from '@/lib/useDraft';

const DRAFT_KEY = 'saqqa_order_draft';

const emptyRow = () => ({ code: '', name: '', qty: 1, note: '' });
const MAX_AUTO = 60; // حد أقصى للنواقص المضافة تلقائياً في المرة الواحدة

export default function OrderPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState('');

  function reload() {
    setSettings(getSettings());
    setProducts(listProducts());
    setSuppliers(listSuppliers());
    setOrders(listOrders());
  }
  useEffect(reload, []);

  // جايين من صفحة النواقص (?supplier=X&low=1) — نختار المورد ونجيب نواقصه تلقائياً
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sup = p.get('supplier');
    if (!sup || !products.length) return;
    setSupplierName(sup);
    const sp = suppliers.find((x) => x.name === sup);
    if (sp?.phone) setSupplierPhone(sp.phone);
    if (p.get('low') === '1') setTimeout(() => addLowStock(sup), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // الموردين المقترحين: المسجلين + أسماء الموردين اللي جايه من ملف الأصناف (خانة القسم)
  const supplierNames = useMemo(() => {
    const set = new Set(suppliers.map((s) => s.name));
    for (const p of products) if (p.category && p.category !== 'أدوات منزلية') set.add(p.category);
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [suppliers, products]);

  // حفظ مسودة الطلب تلقائياً واسترجاعها لو النور قطع أو البرنامج اتقفل
  useDraft(DRAFT_KEY, { rows, supplierName, supplierPhone, notes }, {
    hasContent: (d) => d.rows?.some((r) => r.code || r.name) || d.supplierName,
    onRestore: (d) => {
      if (d.rows?.length) setRows(d.rows);
      if (d.supplierName) setSupplierName(d.supplierName);
      if (d.supplierPhone) setSupplierPhone(d.supplierPhone);
      if (d.notes) setNotes(d.notes);
      showToast('🔄 رجّعنا الطلب اللي كنت بتكتبه — كمّل من حيث وقفت');
    },
  });

  if (!settings) return null;
  const ar = settings.arabicDigits;

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 4000);
  }

  function updateRow(i, patch) {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
      const last = next[next.length - 1];
      if (last.code || last.name) next.push(emptyRow());
      return next;
    });
  }

  function removeRow(i) {
    setRows((prev) => {
      const next = prev.filter((_, x) => x !== i);
      return next.length ? next : [emptyRow()];
    });
  }

  function lookupCode(i, code) {
    const p = findProduct(code);
    if (p) updateRow(i, { code: p.code, name: p.name });
  }

  function pickSupplierPhone(name) {
    const sp = suppliers.find((s) => s.name === name);
    if (sp?.phone) setSupplierPhone(sp.phone);
  }

  // النواقص تلقائياً: أصناف المورد ده اللي مخزونها وصل لحد النواقص أو أقل
  function addLowStock(supName = supplierName) {
    if (!supName) { showToast('⚠️ اختار المورد الأول عشان نجيب نواقصه'); return; }
    const limit = Number(settings.lowStock) || 5;
    const existing = new Set(rows.map((r) => String(r.code)).filter(Boolean));
    const candidates = products.filter(
      (p) => p.category === supName && (Number(p.stock) || 0) <= limit && !existing.has(String(p.code))
    );
    if (!candidates.length) {
      showToast(`مفيش نواقص للمورد "${supName}" (أصناف مخزونها ≤ ${limit})`);
      return;
    }
    const take = candidates.slice(0, MAX_AUTO);
    setRows((prev) => {
      const filled = prev.filter((r) => r.code || r.name);
      return [
        ...filled,
        ...take.map((p) => ({ code: p.code, name: p.name, qty: 1, note: '' })),
        emptyRow(),
      ];
    });
    showToast(
      take.length < candidates.length
        ? `➕ اتضاف ${take.length} صنف من نواقص "${supName}" (في ${candidates.length - take.length} كمان — دوس تاني بعد ما تراجع)`
        : `➕ اتضاف ${take.length} صنف من نواقص "${supName}" — راجع الكميات`
    );
  }

  function collectItems() {
    return rows
      .filter((r) => (r.code || r.name) && Number(r.qty) > 0)
      .map((r) => ({ code: r.code || '', name: r.name, qty: Number(r.qty) || 0, note: r.note || '' }));
  }

  function save(thenPrint) {
    const items = collectItems();
    if (!items.length) { showToast('⚠️ أضف صنف واحد على الأقل'); return; }
    if (!supplierName) { showToast('⚠️ اكتب اسم المورد'); return; }
    const o = saveOrder({
      number: nextOrderNumber(),
      date: todayISO(),
      supplier: { name: supplierName, phone: supplierPhone },
      items,
      notes,
      status: 'جديد',
    });
    setRows([emptyRow()]);
    setNotes('');
    clearDraft(DRAFT_KEY); // اتحفظ رسمي — المسودة خلصت
    reload();
    if (thenPrint) {
      router.push(`/order/print/${o.id}`);
    } else {
      showToast(`✅ اتحفظ طلب البضاعة رقم ${o.number}`);
    }
  }

  const itemsCount = rows.filter((r) => r.code || r.name).length;

  return (
    <div>
      <div className="card">
        <h3>📋 طلب بضاعة جديد من مورد <small className="muted">— الطلب بيطلع من غير أي أسعار</small></h3>
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>المورد</span>
            <input
              list="ord-sup-list"
              value={supplierName}
              onChange={(e) => { setSupplierName(e.target.value); pickSupplierPhone(e.target.value); }}
              placeholder="اسم المورد..."
            />
            <datalist id="ord-sup-list">{supplierNames.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="field">
            <span>واتساب المورد (عشان نبعتله الطلب)</span>
            <input dir="ltr" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="01xxxxxxxxx" />
          </label>
          <label className="field">
            <span>ملاحظات على الطلب</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: التسليم يوم الخميس..." />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={addLowStock} title="بيضيف أصناف المورد اللي مخزونها قليل تلقائياً">
            ➕ ضيف النواقص تلقائياً
          </button>
          {itemsCount > 0 && <span className="badge">{num(itemsCount, ar)} صنف في الطلب</span>}
        </div>

        <table className="pos-grid">
          <thead>
            <tr>
              <th style={{ width: 100 }}>الكود</th>
              <th>اسم الصنف</th>
              <th style={{ width: 90 }}>الكمية</th>
              <th style={{ width: 180 }}>ملاحظات</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input className="num" value={r.code}
                    onChange={(e) => updateRow(i, { code: e.target.value })}
                    onBlur={(e) => e.target.value && !r.name && lookupCode(i, e.target.value)} />
                </td>
                <td>
                  <ProductPicker
                    value={r.name}
                    products={products}
                    arabicDigits={ar}
                    sortMode={settings.suggestSort}
                    onType={(v) => updateRow(i, { name: v })}
                    onSelect={(p) => updateRow(i, { code: p.code, name: p.name })}
                  />
                </td>
                <td><input className="num" type="number" min="0" step="any" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} /></td>
                <td><input value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} /></td>
                <td style={{ textAlign: 'center' }}>
                  <button className="btn-sm btn-red" tabIndex={-1} onClick={() => removeRow(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-accent" onClick={() => save(true)}>🖨️ حفظ ومعاينة الطلب للطباعة والإرسال</button>
          <button className="btn-green" onClick={() => save(false)}>💾 حفظ بس</button>
        </div>
      </div>

      <div className="card">
        <h3>📜 الطلبات السابقة</h3>
        <table className="tbl">
          <thead>
            <tr><th>رقم</th><th>التاريخ</th><th>المورد</th><th>الأصناف</th><th>الحالة</th><th style={{ width: 320 }}></th></tr>
          </thead>
          <tbody>
            {orders.slice(0, 15).map((o) => (
              <tr key={o.id}>
                <td><b>{num(o.number, ar)}</b></td>
                <td>{fmtDate(o.date, ar)}</td>
                <td>{o.supplier?.name}</td>
                <td>{num(o.items?.length || 0, ar)}</td>
                <td>
                  {o.status === 'اتحول لفاتورة شراء'
                    ? <span className="badge green">✅ {o.status}</span>
                    : <span className="badge">{o.status || 'جديد'}</span>}
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-sm" onClick={() => router.push(`/order/print/${o.id}`)}>🖨️ عرض وطباعة</button>
                  {o.supplier?.phone && (
                    <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer"
                      href={waMeLink(o.supplier.phone, buildOrderText(o, settings))}>💬 واتساب</a>
                  )}
                  {o.status !== 'اتحول لفاتورة شراء' && (
                    <button className="btn-sm btn-primary" title="لما البضاعة توصل حولها لفاتورة شراء بالأسعار"
                      onClick={() => router.push(`/purchases?order=${o.id}`)}>📥 وصلت — حوّلها شراء</button>
                  )}
                  <button className="btn-sm btn-red" onClick={async () => {
                    if (await dangerBox(`حذف طلب البضاعة رقم ${o.number}؟`)) { deleteOrder(o.id); reload(); }
                  }}>✕</button>
                </td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan={6} className="muted">مفيش طلبات بضاعة بعد — اعمل أول طلب من فوق ⬆</td></tr>}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
