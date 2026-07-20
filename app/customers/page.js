'use client';
import { useEffect, useMemo, useState } from 'react';
import { listCustomers, saveCustomer, deleteCustomer, listInvoices, getSettings } from '@/lib/db';
import { num } from '@/lib/format';
import { waMeLink } from '@/lib/wa';

const empty = { name: '', phone: '', address: '', notes: '', creditLimit: '', priceType: 'قطاعي' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState('');
  const [showCount, setShowCount] = useState(120); // عرض تدريجي عشان الصفحة متتقلش مع عملاء كتير

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
          <label className="field"><span>نوع السعر</span>
            <select value={form.priceType || 'قطاعي'} onChange={(e) => setForm({ ...form, priceType: e.target.value })}>
              <option value="قطاعي">عادي (الحد الأدنى للبيع)</option>
              <option>جملة</option>
              <option>موزع</option>
            </select></label>
          <label className="field"><span>حد الائتمان (أقصى مديونية — 0 = بدون حد)</span>
            <input type="number" min="0" step="any" value={form.creditLimit}
              onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-green">💾 حفظ</button>
            {form.id && <button type="button" onClick={() => setForm(empty)}>إلغاء</button>}
          </div>
        </form>
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
                      <button className="btn-sm btn-red" onClick={() => { if (confirm(`حذف "${c.name}"؟`)) { deleteCustomer(c.id); reload(); } }}>🗑️</button>
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
