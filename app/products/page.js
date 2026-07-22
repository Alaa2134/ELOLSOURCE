'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listProducts,
  saveProduct,
  deleteProduct,
  getSettings,
  cleanProductName,
  nameMatchKey,
  bulkImportProducts,
  deleteProductsBulk,
  getRole,
  listInvoices,
  listPurchases,
} from '@/lib/db';
import { num, fmtDate } from '@/lib/format';
import { parsePdfProducts } from '@/lib/pdfImport';
import { confirmBox, dangerBox, promptBox } from '@/lib/ui';

const empty = {
  code: '', name: '', price: '', cost: '', stock: '', barcode: '', category: 'أدوات منزلية',
  priceWholesale: '', priceDistributor: '', packName: '', packQty: '', packPrice: '', image: '',
};

// ضغط صورة الصنف لحجم صغير قبل التخزين
function resizeImage(file, maxSize = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(empty);
  const [qInput, setQInput] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || ''; // بحث سريع بيجيب هنا بالكود
  });
  const [q, setQ] = useState(qInput); // النسخة المؤجّلة اللي بيتم البحث بيها (أسرع مع آلاف الأصناف)
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [pdfRows, setPdfRows] = useState(null); // معاينة منتجات الـ PDF قبل الإضافة
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showCount, setShowCount] = useState(150);
  const [progress, setProgress] = useState(null); // { done, total, label } — عداد الاستيراد
  const [selected, setSelected] = useState(() => new Set()); // الأصناف المحددة للمسح
  const [histProduct, setHistProduct] = useState(null); // حركة الصنف المفتوحة
  const [editCell, setEditCell] = useState(null); // { id, field } — تعديل سريع بالضغط المزدوج
  const [editVal, setEditVal] = useState('');
  const pdfRef = useRef(null);

  // تعديل سريع: ضغطتين على أي خانة بتفتحها للتعديل على طول (سعر أو نص أو مخزون)
  function startEdit(p, field, type = 'num') {
    setEditCell({ id: p.id, field, type });
    setEditVal(String(p[field] ?? ''));
  }
  function commitEdit(p) {
    if (!editCell) return;
    const { field, type } = editCell;
    if (type === 'text') {
      const v = editVal.trim();
      // الكود والاسم مايصحش يبقوا فاضيين
      if ((field === 'code' || field === 'name') && !v) { setEditCell(null); return; }
      if (v !== String(p[field] ?? '')) { saveProduct({ ...p, [field]: v }); reload(); }
    } else {
      const v = Number(editVal);
      if (!Number.isNaN(v) && v !== Number(p[field] || 0)) { saveProduct({ ...p, [field]: v }); reload(); }
    }
    setEditCell(null);
  }
  // خانة قابلة للتعديل بالضغط المزدوج — رقم أو نص
  function EditCell({ p, field, type = 'num', className, inputStyle, children }) {
    const editing = editCell && editCell.id === p.id && editCell.field === field;
    if (editing) {
      return (
        <td>
          <input
            className={type === 'num' ? 'num' : undefined}
            type={type === 'num' ? 'number' : 'text'}
            step={type === 'num' ? 'any' : undefined}
            autoFocus
            style={inputStyle || (type === 'num' ? { width: 80 } : { width: 160 })}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={() => commitEdit(p)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(p); }
              if (e.key === 'Escape') setEditCell(null);
            }}
          />
        </td>
      );
    }
    return (
      <td
        className={className}
        title="دوس مرتين للتعديل"
        style={{ cursor: 'pointer' }}
        onDoubleClick={() => startEdit(p, field, type)}
      >
        {children}
        <span className="edit-hint">✎</span>
      </td>
    );
  }
  // خانة سعر — نفس EditCell بس بتعرض السعر متنسّق (والجملة تبان — لو صفر)
  function PriceCell({ p, field, className }) {
    return (
      <EditCell p={p} field={field} type="num" className={className}>
        {field === 'priceWholesale' && !(Number(p[field]) > 0)
          ? <span className="muted">—</span>
          : num(p[field] || 0, ar)}
      </EditCell>
    );
  }

  // حركة الصنف: كل بيع وشراء للصنف ده بالتاريخ (اشتريته بكام واتباع بكام وامتى)
  function movementsOf(code) {
    const out = [];
    for (const inv of listInvoices()) {
      for (const it of inv.items || []) {
        if (String(it.code) !== String(code)) continue;
        out.push({
          date: inv.date, kind: inv.type === 'مرتجع' ? 'مرتجع' : 'بيع',
          qty: Number(it.qty) || 0, price: Number(it.price) || 0,
          ref: `فاتورة ${inv.number}`, who: inv.customer?.name || inv.cashier || '',
        });
      }
    }
    for (const pur of listPurchases()) {
      for (const it of pur.items || []) {
        if (String(it.code) !== String(code)) continue;
        out.push({
          date: pur.date, kind: 'شراء',
          qty: Number(it.qty) || 0, price: Number(it.cost) || 0,
          ref: `شراء ${pur.number}`, who: pur.supplier?.name || '',
        });
      }
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function reload() {
    setProducts(listProducts());
    setSettings(getSettings());
  }
  useEffect(reload, []);

  // بحث مؤجّل: مع آلاف الأصناف مابنعملش فلترة وإعادة رسم مع كل حرف — بنستنى ربع ثانية
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setShowCount(150); }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  // الفلترة متحفوظة (memo) فمابتتكررش مع كل رسم للصفحة
  const allFiltered = useMemo(
    () => products.filter(
      (p) =>
        !q ||
        p.name.includes(q) ||
        String(p.code).includes(q) ||
        String(p.barcode || '').includes(q) ||
        String(p.category || '').includes(q) // البحث باسم المورد كمان
    ),
    [products, q]
  );

  if (!settings) return null;
  const ar = settings.arabicDigits;

  // بنعرض أول شريحة بس والباقي بزرار "عرض المزيد"
  const filtered = allFiltered.slice(0, showCount);

  function submit(e) {
    e.preventDefault();
    if (!form.code || !form.name) { setMsg('⚠️ الكود والاسم مطلوبين'); return; }
    saveProduct({
      ...form,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      priceWholesale: Number(form.priceWholesale) || 0,
      priceDistributor: Number(form.priceDistributor) || 0,
      packQty: Number(form.packQty) || 0,
      packPrice: Number(form.packPrice) || 0,
    });
    setForm(empty);
    setMsg('✅ تم الحفظ');
    reload();
  }

  async function onImage(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = await resizeImage(f);
      setForm({ ...form, image: data });
    } catch {
      setMsg('❌ تعذر قراءة الصورة');
    }
  }

  // استيراد: كل سطر "كود , اسم , سعر , تكلفة , مخزون" — يقبل الفاصلة أو Tab (لصق من إكسل)
  // الموجود (بالكود أو الاسم) بيتحدث سعره — مفيش تكرار أبداً
  async function doImport() {
    const rows = [];
    for (const line of importText.split('\n')) {
      const parts = line.split(/\t|,/).map((x) => x.trim());
      if (parts.length < 3 || !parts[0] || !parts[1]) continue;
      rows.push({ code: parts[0], name: parts[1], price: parts[2], cost: parts[3], stock: parts[4] });
    }
    setImportText('');
    setShowImport(false);
    setProgress({ done: 0, total: rows.length, label: 'بنستورد الأصناف' });
    const { added, updated } = await bulkImportProducts(rows, (done, total) =>
      setProgress({ done, total, label: 'بنستورد الأصناف' })
    );
    setProgress(null);
    setMsg(`✅ ${added} صنف جديد — ${updated} اتحدث (من غير تكرار)`);
    reload();
  }

  // تحديد/إلغاء تحديد صنف
  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // تحديد الكل (كل نتايج البحث الحالية — مش المعروض بس) أو إلغاء التحديد
  function toggleSelectAll(list) {
    setSelected((prev) => {
      if (prev.size === list.length && list.length) return new Set();
      return new Set(list.map((p) => p.id));
    });
  }

  // مسح المحدد (للأدمن بكلمة سر) — ولو المحدد كل الأصناف بيتعامل كحذف الكل من كل الأجهزة
  async function deleteSelected() {
    if (!selected.size) { setMsg('⚠️ حدد أصناف الأول (علّم على المربعات في الجدول)'); return; }
    if (getRole() !== 'admin') { setMsg('⛔ المسح للأدمن بس'); return; }
    if (!(await dangerBox({ title: 'مسح الأصناف المحددة', message: `مسح ${selected.size} صنف محدد نهائياً من البرنامج والسحابة؟`, confirmText: 'امسح' }))) return;
    const pass = await promptBox({ title: 'تأكيد الأدمن', icon: '🔐', message: 'اكتب كلمة سر الأدمن للتأكيد:', password: true, placeholder: '••••' });
    if (pass !== settings.adminPassword) { setMsg('⛔ كلمة السر غير صحيحة — مفيش حاجة اتمسحت'); return; }
    setProgress({ done: 0, total: 1, label: 'بنمسح الأصناف المحددة' });
    const n = await deleteProductsBulk([...selected]);
    setProgress(null);
    setSelected(new Set());
    setMsg(`🗑️ تم مسح ${n} صنف`);
    reload();
  }

  async function onPdfFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPdfBusy(true);
    setMsg('');
    try {
      // بنبعت أسماء الموردين المعروفة عشان لو مكتوبة جنب اسم الصنف في الملف متتلزقش في الاسم
      const knownSuppliers = [...new Set(products.map((p) => p.category).filter(Boolean))];
      const rows = await parsePdfProducts(f, {
        knownSuppliers,
        onProgress: (page, total) => setProgress({ done: page, total, label: 'بنقرا صفحات الملف' }),
      });
      setProgress(null);
      if (!rows.length) {
        setMsg('❌ معرفتش أطلع منتجات من الملف ده — جرب ملف فيه جدول أصناف واضح');
      } else {
        setPdfRows(rows.map((r) => ({ ...r, checked: true })));
      }
    } catch (err) {
      setProgress(null);
      setMsg('❌ فشل قراءة الـ PDF: ' + err.message);
    }
    setPdfBusy(false);
  }

  // البحث عن صنف موجود: بالكود الأول، ولو مفيش كود بنطابق بالاسم (متجاهلين فروق المسافات)
  function findExisting(list, code, name) {
    const c = String(code || '').trim();
    if (c) {
      const byCode = list.find((p) => String(p.code).trim() === c);
      if (byCode) return byCode;
    }
    const n = nameMatchKey(name);
    if (!n) return null;
    return list.find((p) => nameMatchKey(p.name) === n) || null;
  }

  // الاستيراد مش بيكرر أبداً: الموجود بيتحدث سعره — الجديد بس هو اللي بيتضاف
  async function importPdfRows() {
    const rows = pdfRows.filter((r) => r.checked && r.name);
    setPdfRows(null);
    setProgress({ done: 0, total: rows.length, label: 'بنستورد الأصناف' });
    const { added, updated } = await bulkImportProducts(rows, (done, total) =>
      setProgress({ done, total, label: 'بنستورد الأصناف' })
    );
    setProgress(null);
    setMsg(`✅ خلصنا: ${added} صنف جديد اتضاف — ${updated} صنف موجود اتحدث سعره (من غير أي تكرار)`);
    reload();
  }

  function exportCsv() {
    const rows = [['code', 'name', 'price', 'cost', 'stock', 'barcode']];
    for (const p of products) rows.push([p.code, p.name, p.price, p.cost || 0, p.stock || 0, p.barcode || '']);
    const csv = '﻿' + rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'saqqa-products.csv';
    a.click();
  }

  return (
    <div>
      <div className="card">
        <h3>{form.id ? '✏️ تعديل صنف' : '➕ إضافة صنف جديد'}</h3>
        <form onSubmit={submit} className="grid cols-4" style={{ alignItems: 'end' }}>
          <label className="field"><span>رقم الصنف (الكود)</span>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label className="field" style={{ gridColumn: 'span 2' }}><span>اسم الصنف</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>السعر المبدئي (التكلفة)</span>
            <input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
          <label className="field"><span>سعر البيع</span>
            <input type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label className="field"><span>المورد</span>
            <input list="suppliers-dl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="اسم المورد..." />
            <datalist id="suppliers-dl">
              {[...new Set(products.map((p) => p.category).filter(Boolean))].map((s) => <option key={s} value={s} />)}
            </datalist></label>
          <label className="field"><span>المخزون</span>
            <input type="number" step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
          <label className="field"><span>باركود (اختياري)</span>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} dir="ltr" /></label>
          <label className="field"><span>سعر الجملة</span>
            <input type="number" step="any" value={form.priceWholesale} onChange={(e) => setForm({ ...form, priceWholesale: e.target.value })} /></label>
          <label className="field"><span>سعر الموزعين</span>
            <input type="number" step="any" value={form.priceDistributor} onChange={(e) => setForm({ ...form, priceDistributor: e.target.value })} /></label>
          <label className="field"><span>اسم العبوة (كرتونة/دستة)</span>
            <input value={form.packName} onChange={(e) => setForm({ ...form, packName: e.target.value })} placeholder="كرتونة" /></label>
          <label className="field"><span>قطع في العبوة</span>
            <input type="number" step="any" value={form.packQty} onChange={(e) => setForm({ ...form, packQty: e.target.value })} placeholder="12" /></label>
          <label className="field"><span>سعر العبوة</span>
            <input type="number" step="any" value={form.packPrice} onChange={(e) => setForm({ ...form, packPrice: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="btn" style={{ cursor: 'pointer' }}>
              📷 {form.image ? 'تغيير الصورة' : 'صورة الصنف'}
              <input type="file" accept="image/*" hidden onChange={onImage} />
            </label>
            {form.image && (
              <>
                <img src={form.image} alt="" className="thumb" />
                <button type="button" className="btn-sm btn-red" onClick={() => setForm({ ...form, image: '' })}>✕</button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-green">💾 حفظ</button>
            {form.id && <button type="button" onClick={() => setForm(empty)}>إلغاء</button>}
          </div>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو الكود أو الباركود" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <span className="muted">{num(allFiltered.length, ar)} صنف{allFiltered.length > filtered.length ? ` (معروض ${num(filtered.length, ar)})` : ''}</span>
          <span className="badge blue" title="اضغط ضغطتين على أي خانة في الجدول (الكود/الاسم/المورد/الأسعار/المخزون) عشان تعدلها على طول">✎ دوس مرتين على أي خانة تعدّلها</span>
          <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-accent" onClick={() => pdfRef.current?.click()} disabled={pdfBusy}>
              {pdfBusy ? '⏳ جاري التحليل...' : '📄 استيراد من PDF'}
            </button>
            <input ref={pdfRef} type="file" accept=".pdf" hidden onChange={onPdfFile} />
            <button onClick={() => setShowImport(!showImport)}>📥 استيراد من إكسل</button>
            <button onClick={exportCsv}>📤 تصدير CSV</button>
            <button title="تحديد كل نتايج البحث الحالية" onClick={() => toggleSelectAll(allFiltered)}>
              {selected.size === allFiltered.length && allFiltered.length ? '⬜ إلغاء التحديد' : '☑️ تحديد الكل'}
            </button>
            <button className="btn-red" title="مسح الأصناف المعلَّم عليها (للأدمن)" onClick={deleteSelected}>
              🗑️ مسح المحدد{selected.size ? ` (${num(selected.size, settings?.arabicDigits)})` : ''}
            </button>
          </div>
        </div>

        {progress && (
          <div style={{ marginBottom: 12, background: '#fff8f2', border: '1px solid var(--accent)', padding: 14, borderRadius: 8 }}>
            <b>⏳ {progress.label}: تم {num(progress.done, settings.arabicDigits)} من أصل {num(progress.total, settings.arabicDigits)}</b>
            <div style={{ background: '#eee', borderRadius: 6, height: 14, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                background: 'var(--accent)', height: '100%', transition: 'width .2s',
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }} />
            </div>
          </div>
        )}

        {pdfRows && (
          <div style={{ marginBottom: 12, background: '#fff8f2', border: '1px solid var(--accent)', padding: 12, borderRadius: 8 }}>
            <h3 style={{ marginBottom: 8 }}>📄 معاينة منتجات الـ PDF ({pdfRows.length}) — راجع وعدّل قبل الإضافة</h3>
            <p className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
              🔁 الصنف الموجود قبل كده هيتحدث <b>سعره بس</b> — مش هيتضاف مكرر أبداً.
            </p>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr><th></th><th>الكود</th><th>الاسم</th><th>السعر</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {pdfRows.map((r, i) => {
                    const ex = findExisting(products, r.code, r.name);
                    return (
                    <tr key={i}>
                      <td>
                        <input type="checkbox" style={{ width: 'auto' }} checked={r.checked}
                          onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, checked: e.target.checked } : x))} />
                      </td>
                      <td><input style={{ width: 90 }} value={r.code}
                        onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, code: e.target.value } : x))} /></td>
                      <td><input value={r.name}
                        onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /></td>
                      <td><input style={{ width: 90 }} type="number" step="any" value={r.price}
                        onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, price: e.target.value } : x))} /></td>
                      <td>
                        {ex
                          ? <span className="badge orange" title={`السعر الحالي: ${ex.price}`}>🔁 موجود — هيتحدث سعره</span>
                          : <span className="badge green">✅ جديد</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-green" onClick={importPdfRows}>
                ✅ تنفيذ ({pdfRows.filter((r) => r.checked).length})
              </button>
              <button className="btn-red" onClick={() => setPdfRows(null)}>إلغاء</button>
            </div>
          </div>
        )}

        {showImport && (
          <div style={{ marginBottom: 12, background: '#f7f9fb', padding: 12, borderRadius: 8 }}>
            <p className="muted" style={{ marginBottom: 6 }}>
              الصق من إكسل مباشرة (أعمدة: كود، اسم، سعر، تكلفة، مخزون) — سطر لكل صنف:
            </p>
            <textarea rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'787\tرول مذهب\t200\t150\t20'} />
            <button className="btn-green" style={{ marginTop: 8 }} onClick={doImport}>تنفيذ الاستيراد</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th
                  title="تحديد الكل"
                  style={{ cursor: 'pointer', textAlign: 'center' }}
                  onClick={() => toggleSelectAll(allFiltered)}
                >
                  <input
                    type="checkbox"
                    readOnly
                    style={{ pointerEvents: 'none' }}
                    checked={allFiltered.length > 0 && selected.size === allFiltered.length}
                  />
                </th>
                <th></th><th>الكود</th><th>اسم الصنف</th><th>المورد</th><th>السعر المبدئي</th><th>جملة</th><th>سعر البيع</th><th>المخزون</th><th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={selected.has(p.id) ? { background: '#fff3ec' } : undefined}>
                  <td
                    style={{ cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => toggleSelect(p.id)}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      style={{ pointerEvents: 'none' }}
                      checked={selected.has(p.id)}
                    />
                  </td>
                  <td>{p.image ? <img src={p.image} alt="" className="thumb" /> : <span className="muted">—</span>}</td>
                  <EditCell p={p} field="code" type="text" inputStyle={{ width: 80 }}><b>{p.code}</b></EditCell>
                  <EditCell p={p} field="name" type="text" inputStyle={{ width: 220 }}>
                    {p.name}{p.packQty > 0 ? <small className="muted"> ({p.packName || 'عبوة'} {p.packQty})</small> : ''}
                  </EditCell>
                  <EditCell p={p} field="category" type="text">
                    {p.category && p.category !== 'أدوات منزلية' ? <span className="badge blue">{p.category}</span> : <span className="muted">—</span>}
                  </EditCell>
                  <PriceCell p={p} field="cost" className="muted" />
                  <PriceCell p={p} field="priceWholesale" />
                  <PriceCell p={p} field="price" />
                  <EditCell p={p} field="stock" type="num">
                    <span className={`badge ${(Number(p.stock) || 0) <= (settings.lowStock || 5) ? 'red' : 'green'}`}>
                      {num(p.stock || 0, ar)}
                    </span>
                  </EditCell>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-sm" title="حركة الصنف (بيع وشراء)" onClick={() => setHistProduct(p)}>📊</button>
                    <button className="btn-sm btn-primary" onClick={() => setForm({ ...empty, ...p })}>✏️</button>
                    <button
                      className="btn-sm btn-red"
                      onClick={async () => { if (await dangerBox(`حذف الصنف "${p.name}"؟`)) { deleteProduct(p.id); reload(); } }}
                    >🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allFiltered.length > filtered.length && (
          <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => setShowCount(showCount + 300)}>
            ⬇️ عرض المزيد ({num(allFiltered.length - filtered.length, ar)} صنف كمان) — أو اكتب في البحث توصله أسرع
          </button>
        )}
      </div>

      {histProduct && (() => {
        const mv = movementsOf(histProduct.code);
        const sold = mv.filter((m) => m.kind === 'بيع').reduce((s, m) => s + m.qty, 0);
        const bought = mv.filter((m) => m.kind === 'شراء').reduce((s, m) => s + m.qty, 0);
        return (
          <div className="dlg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setHistProduct(null); }}>
            <div className="dlg-box" style={{ maxWidth: 620, textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ color: 'var(--brand)', margin: 0 }}>📊 حركة الصنف: {histProduct.name}</h3>
                <button className="btn-sm" onClick={() => setHistProduct(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="badge blue">كود {histProduct.code}</span>
                <span className="badge green">اتباع: {num(sold, ar)}</span>
                <span className="badge orange">اتشرى: {num(bought, ar)}</span>
                <span className="badge red">المخزون: {num(histProduct.stock || 0, ar)}</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>التاريخ</th><th>الحركة</th><th>الكمية</th><th>السعر</th><th>الطرف</th></tr></thead>
                  <tbody>
                    {mv.map((m, i) => (
                      <tr key={i}>
                        <td>{fmtDate(m.date, ar)}</td>
                        <td>
                          <span className={`badge ${m.kind === 'شراء' ? 'orange' : m.kind === 'مرتجع' ? 'red' : 'green'}`}>{m.kind}</span>
                        </td>
                        <td><b>{num(m.qty, ar)}</b></td>
                        <td>{num(m.price, ar)}</td>
                        <td>{m.who || '—'}</td>
                      </tr>
                    ))}
                    {!mv.length && <tr><td colSpan={5} className="muted">مفيش حركة على الصنف ده لسه</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
