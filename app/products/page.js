'use client';
import { useEffect, useRef, useState } from 'react';
import { listProducts, saveProduct, deleteProduct, getSettings } from '@/lib/db';
import { num } from '@/lib/format';
import { parsePdfProducts } from '@/lib/pdfImport';

const empty = { code: '', name: '', price: '', cost: '', stock: '', barcode: '', category: 'أدوات منزلية' };

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
  const pdfRef = useRef(null);

  function reload() {
    setProducts(listProducts());
    setSettings(getSettings());
  }
  useEffect(reload, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const filtered = products.filter(
    (p) => !q || p.name.includes(q) || String(p.code).includes(q) || String(p.barcode || '').includes(q)
  );

  function submit(e) {
    e.preventDefault();
    if (!form.code || !form.name) { setMsg('⚠️ الكود والاسم مطلوبين'); return; }
    saveProduct({
      ...form,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
    });
    setForm(empty);
    setMsg('✅ تم الحفظ');
    reload();
  }

  // استيراد: كل سطر "كود , اسم , سعر , تكلفة , مخزون" — يقبل الفاصلة أو Tab (لصق من إكسل)
  function doImport() {
    let count = 0;
    for (const line of importText.split('\n')) {
      const parts = line.split(/\t|,/).map((x) => x.trim());
      if (parts.length < 3 || !parts[0] || !parts[1]) continue;
      const existing = products.find((p) => String(p.code) === parts[0]);
      saveProduct({
        ...(existing || {}),
        code: parts[0],
        name: parts[1],
        price: Number(parts[2]) || 0,
        cost: Number(parts[3]) || existing?.cost || 0,
        stock: Number(parts[4]) || existing?.stock || 0,
      });
      count++;
    }
    setMsg(`✅ تم استيراد ${count} صنف`);
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
      const rows = await parsePdfProducts(f);
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

  function importPdfRows() {
    let count = 0;
    for (const r of pdfRows) {
      if (!r.checked || !r.name) continue;
      const existing = products.find((p) => String(p.code) === String(r.code));
      saveProduct({
        ...(existing || {}),
        code: r.code || r.name.slice(0, 10),
        name: r.name,
        price: Number(r.price) || 0,
        cost: existing?.cost || 0,
        stock: existing?.stock || 0,
      });
      count++;
    }
    setPdfRows(null);
    setMsg(`✅ تم استيراد ${count} صنف من الـ PDF`);
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
          <label className="field"><span>سعر البيع</span>
            <input type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label className="field"><span>سعر التكلفة</span>
            <input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
          <label className="field"><span>المخزون</span>
            <input type="number" step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></label>
          <label className="field"><span>باركود (اختياري)</span>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} dir="ltr" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-green">💾 حفظ</button>
            {form.id && <button type="button" onClick={() => setForm(empty)}>إلغاء</button>}
          </div>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو الكود أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{num(filtered.length, ar)} صنف</span>
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
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr><th></th><th>الكود</th><th>الاسم</th><th>السعر</th></tr>
                </thead>
                <tbody>
                  {pdfRows.map((r, i) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-green" onClick={importPdfRows}>
                ✅ إضافة المحدد ({pdfRows.filter((r) => r.checked).length})
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
              <tr><th>الكود</th><th>اسم الصنف</th><th>سعر البيع</th><th>التكلفة</th><th>المخزون</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.code}</b></td>
                  <td>{p.name}</td>
                  <td>{num(p.price, ar)}</td>
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
      </div>
    </div>
  );
}
