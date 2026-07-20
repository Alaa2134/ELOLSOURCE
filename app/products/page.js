'use client';
import { useEffect, useRef, useState } from 'react';
import { listProducts, saveProduct, deleteProduct, getSettings, cleanProductName } from '@/lib/db';
import { num } from '@/lib/format';
import { parsePdfProducts } from '@/lib/pdfImport';

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
  const [q, setQ] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [pdfRows, setPdfRows] = useState(null); // معاينة منتجات الـ PDF قبل الإضافة
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showCount, setShowCount] = useState(150);
  const pdfRef = useRef(null);

  function reload() {
    setProducts(listProducts());
    setSettings(getSettings());
  }
  useEffect(reload, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const allFiltered = products.filter(
    (p) => !q || p.name.includes(q) || String(p.code).includes(q) || String(p.barcode || '').includes(q)
  );
  // تخفيف وتسريع: مع آلاف الأصناف بنعرض أول شريحة بس والباقي بزرار "عرض المزيد"
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
  function doImport() {
    let updated = 0;
    let added = 0;
    const fresh = listProducts();
    for (const line of importText.split('\n')) {
      const parts = line.split(/\t|,/).map((x) => x.trim());
      if (parts.length < 3 || !parts[0] || !parts[1]) continue;
      const existing = findExisting(fresh, parts[0], parts[1]);
      if (existing) {
        saveProduct({
          ...existing,
          price: Number(parts[2]) || existing.price,
          cost: Number(parts[3]) || existing.cost || 0,
          stock: parts[4] !== undefined && parts[4] !== '' ? Number(parts[4]) || 0 : existing.stock || 0,
        });
        updated++;
      } else {
        const row = saveProduct({
          code: parts[0],
          name: cleanProductName(parts[1]),
          price: Number(parts[2]) || 0,
          cost: Number(parts[3]) || 0,
          stock: Number(parts[4]) || 0,
          barcode: '',
          category: 'أدوات منزلية',
        });
        fresh.push(row);
        added++;
      }
    }
    setMsg(`✅ ${added} صنف جديد — ${updated} اتحدث (من غير تكرار)`);
    setImportText('');
    setShowImport(false);
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
      const rows = await parsePdfProducts(f, { knownSuppliers });
      if (!rows.length) {
        setMsg('❌ معرفتش أطلع منتجات من الملف ده — جرب ملف فيه جدول أصناف واضح');
      } else {
        setPdfRows(rows.map((r) => ({ ...r, checked: true })));
      }
    } catch (err) {
      setMsg('❌ فشل قراءة الـ PDF: ' + err.message);
    }
    setPdfBusy(false);
  }

  // البحث عن صنف موجود: بالكود الأول، ولو مفيش كود بنطابق بالاسم (بعد توحيد المسافات والرموز)
  function findExisting(list, code, name) {
    const c = String(code || '').trim();
    if (c) {
      const byCode = list.find((p) => String(p.code).trim() === c);
      if (byCode) return byCode;
    }
    const n = cleanProductName(name).trim();
    if (!n) return null;
    return list.find((p) => cleanProductName(p.name).trim() === n) || null;
  }

  // الاستيراد مش بيكرر أبداً: الموجود بيتحدث سعره — الجديد بس هو اللي بيتضاف
  function importPdfRows() {
    let updated = 0;
    let added = 0;
    let fresh = listProducts(); // أحدث نسخة (مش الحالة القديمة)
    let nextCode = fresh.reduce((m, p) => Math.max(m, Number(p.code) || 0), 0) + 1;
    for (const r of pdfRows) {
      if (!r.checked || !r.name) continue;
      const existing = findExisting(fresh, r.code, r.name);
      if (existing) {
        // موجود قبل كده → تحديث السعر بس (الاسم والمخزون والتكلفة زي ما هما)
        saveProduct({ ...existing, price: Number(r.price) || existing.price });
        updated++;
      } else {
        const code = String(r.code || '').trim() || String(nextCode++);
        const row = saveProduct({
          code,
          name: cleanProductName(r.name),
          price: Number(r.price) || 0,
          cost: 0,
          stock: 0,
          barcode: '',
          category: r.supplier || 'أدوات منزلية',
        });
        fresh.push(row);
        added++;
      }
    }
    setPdfRows(null);
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
          <label className="field"><span>الحد الأدنى للبيع (سعر البيع)</span>
            <input type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label className="field"><span>السعر المبدئي (التكلفة)</span>
            <input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
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
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو الكود أو الباركود" value={q} onChange={(e) => { setQ(e.target.value); setShowCount(150); }} />
          <span className="muted">{num(allFiltered.length, ar)} صنف{allFiltered.length > filtered.length ? ` (معروض ${num(filtered.length, ar)})` : ''}</span>
          <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-accent" onClick={() => pdfRef.current?.click()} disabled={pdfBusy}>
              {pdfBusy ? '⏳ جاري التحليل...' : '📄 استيراد من PDF'}
            </button>
            <input ref={pdfRef} type="file" accept=".pdf" hidden onChange={onPdfFile} />
            <button onClick={() => setShowImport(!showImport)}>📥 استيراد من إكسل</button>
            <button onClick={exportCsv}>📤 تصدير CSV</button>
          </div>
        </div>

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
              <tr><th></th><th>الكود</th><th>اسم الصنف</th><th>الحد الأدنى للبيع</th><th>جملة</th><th>السعر المبدئي</th><th>المخزون</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.image ? <img src={p.image} alt="" className="thumb" /> : <span className="muted">—</span>}</td>
                  <td><b>{p.code}</b></td>
                  <td>{p.name}{p.packQty > 0 ? <small className="muted"> ({p.packName || 'عبوة'} {p.packQty})</small> : ''}</td>
                  <td>{num(p.price, ar)}</td>
                  <td>{(p.priceWholesale || 0) > 0 ? num(p.priceWholesale, ar) : <span className="muted">—</span>}</td>
                  <td className="muted">{num(p.cost || 0, ar)}</td>
                  <td>
                    <span className={`badge ${(Number(p.stock) || 0) <= (settings.lowStock || 5) ? 'red' : 'green'}`}>
                      {num(p.stock || 0, ar)}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-sm btn-primary" onClick={() => setForm({ ...empty, ...p })}>✏️</button>
                    <button
                      className="btn-sm btn-red"
                      onClick={() => { if (confirm(`حذف "${p.name}"؟`)) { deleteProduct(p.id); reload(); } }}
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
    </div>
  );
}
