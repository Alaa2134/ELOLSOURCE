'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listCustomers, saveCustomer, deleteCustomer, listInvoices, getSettings, bulkImportCustomers } from '@/lib/db';
import { num } from '@/lib/format';
import { waMeLink } from '@/lib/wa';
import { parsePdfCustomers } from '@/lib/pdfImport';
import { dangerBox } from '@/lib/ui';

const empty = { name: '', phone: '', address: '', notes: '', creditLimit: '', priceType: 'نقدي' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState('');
  const [showCount, setShowCount] = useState(120); // عرض تدريجي عشان الصفحة متتقلش مع عملاء كتير
  const [pdfRows, setPdfRows] = useState(null); // معاينة عملاء الـ PDF قبل الإضافة
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState('');
  const pdfRef = useRef(null);

  async function onPdfFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMsg('');
    setProgress({ done: 0, total: 1, label: 'بنقرا صفحات الملف' });
    try {
      const rows = await parsePdfCustomers(f, {
        onProgress: (page, total) => setProgress({ done: page, total, label: 'بنقرا صفحات الملف' }),
      });
      setProgress(null);
      if (!rows.length) setMsg('❌ معرفتش أطلع عملاء من الملف — لازم يكون فيه أسماء وأرقام تليفون واضحة');
      else setPdfRows(rows.map((r) => ({ ...r, checked: true })));
    } catch (err) {
      setProgress(null);
      setMsg('❌ فشل قراءة الملف: ' + err.message);
    }
  }

  async function importPdfRows() {
    const rows = pdfRows.filter((r) => r.checked && r.name);
    setPdfRows(null);
    setProgress({ done: 0, total: rows.length, label: 'بنستورد العملاء' });
    const { added, updated } = await bulkImportCustomers(rows, (done, total) =>
      setProgress({ done, total, label: 'بنستورد العملاء' })
    );
    setProgress(null);
    setMsg(`✅ خلصنا: ${added} عميل جديد اتضاف — ${updated} عميل موجود اتحدّث (من غير تكرار)`);
    reload();
  }

  function reload() {
    setCustomers(listCustomers());
    setInvoices(listInvoices());
    setSettings(getSettings());
  }
  useEffect(reload, []);

  // إحصائيات كل العملاء في لفة واحدة على الفواتير (بدل لفة لكل عميل — كانت بتهنّج الصفحة)
  const statsByName = useMemo(() => {
    const m = new Map();
    for (const i of invoices) {
      const n = i.customer?.name;
      if (!n) continue;
      const s = m.get(n) || { count: 0, total: 0, debt: 0 };
      s.count++;
      s.total += i.totals?.net || 0;
      s.debt += Math.max(0, i.totals?.remaining || 0);
      m.set(n, s);
    }
    return m;
  }, [invoices]);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  function statsFor(c) {
    return statsByName.get(c.name) || { count: 0, total: 0, debt: 0 };
  }

  const filtered = customers.filter((c) => !q || c.name.includes(q) || (c.phone || '').includes(q));
  const visibleCustomers = filtered.slice(0, showCount);

  function submit(e) {
    e.preventDefault();
    if (!form.name) return;
    saveCustomer({ ...form, creditLimit: Number(form.creditLimit) || 0 });
    setForm(empty);
    reload();
  }

  return (
    <div>
      <div className="card">
        <h3>{form.id ? '✏️ تعديل عميل' : '➕ إضافة عميل جديد'}</h3>
        <form onSubmit={submit} className="grid cols-4" style={{ alignItems: 'end' }}>
          <label className="field"><span>الاسم</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>الهاتف (واتساب)</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" placeholder="01xxxxxxxxx" /></label>
          <label className="field"><span>العنوان</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <label className="field"><span>نوع العميل</span>
            <select value={form.priceType || 'نقدي'} onChange={(e) => setForm({ ...form, priceType: e.target.value })}>
              <option value="نقدي">عميل نقدي (سعر البيع)</option>
              <option value="تاجر جملة">تاجر جملة (السعر المبدائي)</option>
            </select></label>
          <label className="field"><span>حد الائتمان (أقصى مديونية — 0 = بدون حد)</span>
            <input type="number" min="0" step="any" value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-green">💾 حفظ</button>
            {form.id && <button type="button" onClick={() => setForm(empty)}>إلغاء</button>}
          </div>
        </form>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-accent" onClick={() => pdfRef.current?.click()}>📄 استيراد عملاء من PDF</button>
          <input ref={pdfRef} type="file" accept=".pdf" hidden onChange={onPdfFile} />
          <span className="muted" style={{ fontSize: 12 }}>الملف لازم يكون فيه أسماء وأرقام تليفون (بيقرأ الاسم + الموبايل + العنوان)</span>
          {msg && <b>{msg}</b>}
        </div>

        {progress && (
          <div style={{ marginTop: 12, background: '#fff8f2', border: '1px solid var(--accent)', padding: 14, borderRadius: 8 }}>
            <b>⏳ {progress.label}: تم {num(progress.done, ar)} من أصل {num(progress.total, ar)}</b>
            <div style={{ background: '#eee', borderRadius: 6, height: 14, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ background: 'var(--accent)', height: '100%', transition: 'width .2s', width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}

        {pdfRows && (
          <div style={{ marginTop: 12, background: '#fff8f2', border: '1px solid var(--accent)', padding: 12, borderRadius: 8 }}>
            <h3 style={{ marginBottom: 8 }}>📄 معاينة عملاء الـ PDF ({num(pdfRows.length, ar)}) — راجع وعدّل قبل الإضافة</h3>
            <p className="muted" style={{ marginBottom: 8, fontSize: 13 }}>🔁 العميل الموجود قبل كده (بالتليفون أو الاسم) هيتحدّث بس — مش هيتكرر.</p>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th></th><th>الاسم</th><th>التليفون</th><th>العنوان</th></tr></thead>
                <tbody>
                  {pdfRows.map((r, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={r.checked}
                        onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, checked: e.target.checked } : x))} /></td>
                      <td><input value={r.name} onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} /></td>
                      <td><input dir="ltr" style={{ width: 120 }} value={r.phone} onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, phone: e.target.value } : x))} /></td>
                      <td><input value={r.address} onChange={(e) => setPdfRows(pdfRows.map((x, xi) => xi === i ? { ...x, address: e.target.value } : x))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-green" onClick={importPdfRows}>✅ إضافة المحدد ({num(pdfRows.filter((r) => r.checked).length, ar)})</button>
              <button className="btn-red" onClick={() => setPdfRows(null)}>إلغاء</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{num(filtered.length, ar)} عميل</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الفواتير</th><th>إجمالي التعامل</th><th>مديونية</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {visibleCustomers.map((c) => {
                const st = statsFor(c);
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td dir="ltr">{c.phone || '—'}</td>
                    <td>{c.address || '—'}</td>
                    <td>{num(st.count, ar)}</td>
                    <td>{num(st.total, ar)} {settings.currency}</td>
                    <td>{st.debt > 0 ? <span className="badge red">{num(st.debt, ar)}</span> : <span className="badge green">لا يوجد</span>}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <a className="btn btn-sm" href={`/statement?name=${encodeURIComponent(c.name)}`}>📄 كشف</a>
                      {st.debt > 0 && (
                        <a className="btn btn-sm btn-accent" href={`/payments?name=${encodeURIComponent(c.name)}`}>💵 تحصيل</a>
                      )}
                      {c.phone && (
                        <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer"
                          href={waMeLink(c.phone, `أهلاً ${c.name} 🌹 معك ${settings.companyName}`)}>💬</a>
                      )}
                      <button className="btn-sm btn-primary" onClick={() => setForm({ ...empty, ...c })}>✏️</button>
                      <button className="btn-sm btn-red" onClick={async () => { if (await dangerBox(`حذف العميل "${c.name}"؟`)) { deleteCustomer(c.id); reload(); } }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={7} className="muted">لا يوجد عملاء</td></tr>}
            </tbody>
          </table>
        </div>
        {filtered.length > showCount && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button className="btn-primary" onClick={() => setShowCount((c) => c + 120)}>
              ⬇️ عرض المزيد ({num(filtered.length - showCount, ar)} عميل كمان)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
