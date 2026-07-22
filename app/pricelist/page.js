'use client';
// 📃 قائمة أسعار للتجار — بأسعار البيع، مجمّعة بالمورد، جاهزة للطباعة/PDF وتتبعت واتساب
import { useEffect, useMemo, useState } from 'react';
import { listProducts, getSettings } from '@/lib/db';
import { num } from '@/lib/format';

export default function PriceListPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [withStock, setWithStock] = useState(false); // بس اللي فيه مخزون

  useEffect(() => { setProducts(listProducts()); setSettings(getSettings()); }, []);

  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter((c) => c && c !== 'أدوات منزلية'))].sort((a, b) => a.localeCompare(b, 'ar')), [products]);

  const groups = useMemo(() => {
    const s = q.trim();
    const list = products.filter((p) =>
      (Number(p.price) > 0) &&
      (!cat || p.category === cat) &&
      (!withStock || (Number(p.stock) || 0) > 0) &&
      (!s || p.name.includes(s) || String(p.code).includes(s))
    );
    const m = new Map();
    for (const p of list) {
      const g = p.category && p.category !== 'أدوات منزلية' ? p.category : 'متنوع';
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(p);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [products, q, cat, withStock]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const total = groups.reduce((s, [, arr]) => s + arr.length, 0);

  return (
    <div>
      <div className="card no-print">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <input style={{ maxWidth: 260 }} placeholder="🔍 بحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="field"><span>المورد</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">كل الموردين</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={withStock} onChange={(e) => setWithStock(e.target.checked)} />
            المتوفر بس
          </label>
          <span className="muted">{num(total, ar)} صنف</span>
          <button className="btn-primary" style={{ marginRight: 'auto' }} onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          💡 اطبعها أو احفظها PDF وابعتها لتجارك واتساب — الأسعار دي أسعار البيع (تاجر الجملة).
        </p>
      </div>

      <div className="card pricelist-print">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <h2 style={{ color: 'var(--brand)', margin: 0 }}>{settings.companyName}</h2>
          <div className="muted">قائمة أسعار الجملة — {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          {settings.phones && <div style={{ fontSize: 13 }}>{settings.phones}</div>}
        </div>
        {groups.map(([g, arr]) => (
          <div key={g} style={{ marginBottom: 16, breakInside: 'avoid' }}>
            <div style={{ background: 'var(--brand)', color: '#fff', padding: '6px 12px', borderRadius: 6, fontWeight: 700 }}>🏭 {g} <span style={{ opacity: .8, fontSize: 13 }}>({num(arr.length, ar)})</span></div>
            <table className="tbl" style={{ marginTop: 4 }}>
              <thead><tr><th style={{ width: 70 }}>الكود</th><th>الصنف</th><th style={{ width: 110 }}>السعر</th></tr></thead>
              <tbody>
                {arr.map((p) => (
                  <tr key={p.id}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td><b>{num(p.price, ar)} {settings.currency}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!groups.length && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>مفيش أصناف بالفلتر ده</p>}
      </div>
    </div>
  );
}
