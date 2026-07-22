'use client';
// فواتير المشتريات من الموردين: بتزود المخزون وبتحدث التكلفة تلقائياً
import { useEffect, useMemo, useState } from 'react';
import {
  listProducts,
  findProduct,
  listSuppliers,
  listAllSuppliers,
  saveSupplier,
  deleteSupplier,
  renameSupplier,
  setSupplierPhone as saveSupplierPhone,
  listPurchases,
  savePurchase,
  nextPurchaseNumber,
  supplierDebt,
  getSettings,
  getOrder,
  setOrderStatus,
} from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';
import { dangerBox } from '@/lib/ui';
import { useDraft, clearDraft } from '@/lib/useDraft';

const emptyRow = () => ({ code: '', name: '', qty: 1, cost: '' });
const DRAFT_KEY = 'saqqa_purchase_draft';

export default function PurchasesPage() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]); // كل الموردين من الأصناف + جدول الموردين
  const [purchases, setPurchases] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [paid, setPaid] = useState('');
  const [toast, setToast] = useState('');
  const [fromOrder, setFromOrder] = useState(null); // بنحوّل طلب بضاعة لفاتورة شراء
  const [supEdits, setSupEdits] = useState({}); // تعديل اسم/هاتف المورد {id:{name,phone}}
  const [newSup, setNewSup] = useState({ name: '', phone: '' }); // إضافة مورد جديد يدوي

  function reload() {
    setSettings(getSettings());
    setProducts(listProducts());
    setSuppliers(listSuppliers());
    setAllSuppliers(listAllSuppliers());
    setPurchases(listPurchases());
  }
  useEffect(reload, []);

  // لو جايين من صفحة طلب البضاعة (?order=) بنملأ الفاتورة بأصناف الطلب — يتبقى تكتب أسعار الشراء بس
  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (!orderId) return;
    const o = getOrder(orderId);
    if (!o) return;
    setFromOrder(o);
    setSupplierName(o.supplier?.name || '');
    setSupplierPhone(o.supplier?.phone || '');
    setRows([
      ...(o.items || []).map((it) => ({ code: it.code, name: it.name, qty: it.qty, cost: '' })),
      emptyRow(),
    ]);
  }, []);

  const subtotal = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.cost) || 0), 0),
    [rows]
  );

  // حفظ مسودة فاتورة الشراء تلقائياً — بترجع لو النور قطع أو البرنامج اتقفل
  // (بنتجاهل الاسترجاع لو جايين نحوّل طلب بضاعة من ?order=)
  const convertingOrder = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('order');
  useDraft(DRAFT_KEY, { rows, supplierName, supplierPhone, paid }, {
    enabled: !convertingOrder,
    hasContent: (d) => d.rows?.some((r) => r.code || r.name) || d.supplierName,
    onRestore: (d) => {
      if (convertingOrder) return;
      if (d.rows?.length) setRows(d.rows);
      if (d.supplierName) setSupplierName(d.supplierName);
      if (d.supplierPhone) setSupplierPhone(d.supplierPhone);
      if (d.paid !== undefined) setPaid(d.paid);
      showToast('🔄 رجّعنا فاتورة الشراء اللي كنت بتكتبها — كمّل من حيث وقفت');
    },
  });

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const paidNum = paid === '' ? subtotal : Number(paid) || 0;

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  }

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
    if (p) updateRow(i, { code: p.code, name: p.name, cost: p.cost || p.price });
  }

  function save() {
    const items = rows
      .filter((r) => (r.code || r.name) && Number(r.qty) > 0)
      .map((r) => ({
        code: r.code || r.name.slice(0, 8),
        name: r.name,
        qty: Number(r.qty) || 0,
        cost: Number(r.cost) || 0,
        total: (Number(r.qty) || 0) * (Number(r.cost) || 0),
      }));
    if (!items.length) { showToast('⚠️ أضف صنف واحد على الأقل'); return; }
    if (!supplierName) { showToast('⚠️ اكتب اسم المورد'); return; }
    const p = savePurchase({
      number: nextPurchaseNumber(),
      date: todayISO(),
      supplier: { name: supplierName, phone: supplierPhone },
      items,
      totals: { net: subtotal, paid: paidNum, remaining: subtotal - paidNum },
      orderId: fromOrder?.id || undefined,
    });
    if (fromOrder) {
      setOrderStatus(fromOrder.id, 'اتحول لفاتورة شراء');
      setFromOrder(null);
    }
    setRows([emptyRow()]);
    setPaid('');
    clearDraft(DRAFT_KEY); // اتحفظت رسمي — المسودة خلصت
    reload();
    showToast(`✅ تم حفظ فاتورة الشراء ${p.number} — المخزون والتكلفة اتحدثوا`);
  }

  // ---- إدارة الموردين: تعديل الاسم والهاتف ----
  function supVal(s, field) {
    return supEdits[s.id]?.[field] ?? s[field] ?? '';
  }
  function editSup(id, patch) {
    setSupEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }
  function saveSupEdit(s) {
    const name = (supVal(s, 'name') || '').trim();
    const phone = (supVal(s, 'phone') || '').trim();
    if (!name) { showToast('⚠️ اسم المورد مايصحش يبقى فاضي'); return; }
    let moved = 0;
    if (name !== s.name) {
      // غيّرنا الاسم — بنحدّث كل أصناف المورد كمان
      moved = renameSupplier(s.name, name, phone);
    } else {
      // الاسم زي ما هو — بنحدّث الهاتف بس
      saveSupplierPhone(name, phone);
    }
    setSupEdits((p) => { const n = { ...p }; delete n[s.id]; return n; });
    reload();
    showToast(moved ? `✅ اتحفظ المورد: ${name} — و${moved} صنف اتنقلوا للاسم الجديد` : `✅ اتحفظ المورد: ${name}`);
  }
  async function removeSup(s) {
    if (s.count > 0) {
      showToast(`⚠️ المورد "${s.name}" مربوط بـ ${num(s.count, ar)} صنف — غيّر مورد الأصناف الأول قبل ما تمسحه`);
      return;
    }
    const debt = supplierDebt(s.name);
    const msg = debt > 0
      ? `المورد "${s.name}" عليك له ${num(debt, ar)} ${settings.currency}. متأكد تمسحه من القايمة؟ (مش هيمسح فواتير الشراء)`
      : `تمسح المورد "${s.name}" من القايمة؟`;
    if (!(await dangerBox({ title: 'حذف مورد', message: msg }))) return;
    if (s.hasRecord) deleteSupplier(s.id);
    reload();
    showToast(`🗑️ اتمسح المورد: ${s.name}`);
  }
  function addSup() {
    const name = newSup.name.trim();
    if (!name) { showToast('⚠️ اكتب اسم المورد'); return; }
    if (allSuppliers.some((s) => s.name === name)) { showToast('⚠️ المورد ده موجود بالفعل'); return; }
    saveSupplier({ name, phone: newSup.phone.trim() });
    setNewSup({ name: '', phone: '' });
    reload();
    showToast(`✅ اتضاف المورد: ${name}`);
  }

  // مديونياتنا للموردين
  const supplierDebts = suppliers
    .map((s) => ({ ...s, debt: supplierDebt(s.name) }))
    .filter((s) => s.debt > 0);

  return (
    <div>
      <div className="card">
        <h3>📥 فاتورة شراء جديدة</h3>
        {fromOrder && (
          <div className="debt-alert" style={{ marginBottom: 10 }}>
            📋 بتحوّل <b>طلب البضاعة رقم {num(fromOrder.number, settings.arabicDigits)}</b> من {fromOrder.supplier?.name} لفاتورة شراء —
            الأصناف والكميات اتملت تلقائياً، اكتب أسعار الشراء بس واحفظ.
          </div>
        )}
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>المورد</span>
            <input list="sup-list" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="اسم المورد..." />
            <datalist id="sup-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </label>
          <label className="field">
            <span>هاتف المورد</span>
            <input dir="ltr" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
          </label>
          <label className="field">
            <span>المدفوع (فاضي = كله نقدي)</span>
            <input type="number" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={String(subtotal)} />
          </label>
        </div>
        {supplierName && supplierDebt(supplierName) > 0 && (
          <div className="debt-alert" style={{ marginBottom: 10 }}>
            💰 عليك للمورد ده: <b>{num(supplierDebt(supplierName), ar)} {settings.currency}</b>
          </div>
        )}
        <table className="pos-grid">
          <thead>
            <tr>
              <th style={{ width: 90 }}>الكود</th>
              <th>اسم الصنف (لو جديد هيتضاف تلقائياً)</th>
              <th style={{ width: 80 }}>الكمية</th>
              <th style={{ width: 100 }}>سعر الشراء (المبدئي)</th>
              <th style={{ width: 100 }}>الإجمالي</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="num" value={r.code}
                  onChange={(e) => updateRow(i, { code: e.target.value })}
                  onBlur={(e) => e.target.value && !r.name && lookupCode(i, e.target.value)} /></td>
                <td><input list="prod-names" value={r.name}
                  onChange={(e) => {
                    const p = products.find((x) => x.name === e.target.value);
                    updateRow(i, p ? { code: p.code, name: p.name, cost: p.cost || p.price } : { name: e.target.value });
                  }} /></td>
                <td><input className="num" type="number" min="0" step="any" value={r.qty} onChange={(e) => updateRow(i, { qty: e.target.value })} /></td>
                <td><input className="num" type="number" min="0" step="any" value={r.cost} onChange={(e) => updateRow(i, { cost: e.target.value })} /></td>
                <td className="total-cell">{num((Number(r.qty) || 0) * (Number(r.cost) || 0), ar)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button className="btn-sm btn-red" tabIndex={-1}
                    onClick={() => setRows((p) => p.filter((_, x) => x !== i).length ? p.filter((_, x) => x !== i) : [emptyRow()])}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="prod-names">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
          <button className="btn-green" onClick={save}>💾 حفظ فاتورة الشراء</button>
          <b>الإجمالي: {num(subtotal, ar)} {settings.currency}</b>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>📜 آخر المشتريات</h3>
          <table className="tbl">
            <thead><tr><th>رقم</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المتبقي علينا</th></tr></thead>
            <tbody>
              {purchases.slice(0, 12).map((p) => (
                <tr key={p.id}>
                  <td><b>{num(p.number, ar)}</b></td>
                  <td>{fmtDate(p.date, ar)}</td>
                  <td>{p.supplier?.name}</td>
                  <td>{num(p.totals?.net || 0, ar)}</td>
                  <td>{(p.totals?.remaining || 0) > 0 ? <span className="red-text">{num(p.totals.remaining, ar)}</span> : '—'}</td>
                </tr>
              ))}
              {!purchases.length && <tr><td colSpan={5} className="muted">لا توجد مشتريات بعد</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>🏭 مديونياتنا للموردين</h3>
          <table className="tbl">
            <thead><tr><th>المورد</th><th>الهاتف</th><th>عليك له</th></tr></thead>
            <tbody>
              {supplierDebts.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b></td>
                  <td dir="ltr">{s.phone || '—'}</td>
                  <td><span className="badge red">{num(s.debt, ar)} {settings.currency}</span></td>
                </tr>
              ))}
              {!supplierDebts.length && <tr><td colSpan={3} className="muted">مفيش مديونيات لموردين ✅</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>🧾 أسماء الموردين — تعديل الاسم والهاتف ({num(allSuppliers.length, ar)})</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          دي كل أسماء الموردين اللي على أصنافك. عدّل الاسم أو الهاتف والتعديل بيتحفظ لوحده —
          لو غيّرت الاسم، كل أصناف المورد بتتنقل للاسم الجديد تلقائياً.
        </p>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '42%' }}>اسم المورد</th>
              <th style={{ width: '26%' }}>الهاتف</th>
              <th style={{ width: 70 }}>أصنافه</th>
              <th style={{ width: 80 }}>عليك له</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {allSuppliers.map((s) => {
              const dirty = !!supEdits[s.id];
              const debt = supplierDebt(s.name);
              return (
                <tr key={s.id}>
                  <td><input value={supVal(s, 'name')} onChange={(e) => editSup(s.id, { name: e.target.value })} onBlur={() => dirty && saveSupEdit(s)} /></td>
                  <td><input dir="ltr" value={supVal(s, 'phone')} onChange={(e) => editSup(s.id, { phone: e.target.value })} onBlur={() => dirty && saveSupEdit(s)} placeholder="—" /></td>
                  <td>{s.count > 0 ? <span className="badge blue">{num(s.count, ar)}</span> : <span className="muted">—</span>}</td>
                  <td>{debt > 0 ? <span className="badge red">{num(debt, ar)}</span> : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn-sm btn-red" title={s.count > 0 ? 'مربوط بأصناف — مينفعش يتمسح' : 'حذف'} onClick={() => removeSup(s)}>🗑️</button>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td><input value={newSup.name} onChange={(e) => setNewSup((p) => ({ ...p, name: e.target.value }))} placeholder="+ مورد جديد..." /></td>
              <td><input dir="ltr" value={newSup.phone} onChange={(e) => setNewSup((p) => ({ ...p, phone: e.target.value }))} placeholder="الهاتف" /></td>
              <td>—</td>
              <td>—</td>
              <td style={{ textAlign: 'center' }}><button className="btn-sm btn-green" onClick={addSup}>➕ إضافة</button></td>
            </tr>
            {!allSuppliers.length && <tr><td colSpan={5} className="muted">لا يوجد موردين بعد — أضف واحد أو احفظ فاتورة شراء</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
