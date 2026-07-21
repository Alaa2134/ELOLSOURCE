'use client';
// النواقص: الأصناف اللي مخزونها قرب يخلص — مجمّعة بالمورد، وبضغطة تحوّلها طلب بضاعة
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listProducts, getSettings } from '@/lib/db';
import { num } from '@/lib/format';

export default function LowStockPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setProducts(listProducts());
  }, []);

  const limit = Number(settings?.lowStock) || 5;
  const low = useMemo(
    () => products
      .filter((p) => (Number(p.stock) || 0) <= limit)
      .filter((p) => !q || p.name.includes(q) || String(p.code).includes(q) || String(p.category || '').includes(q))
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0)),
    [products, limit, q]
  );

  // تجميع بالمورد
  const bySupplier = useMemo(() => {
    const m = new Map();
    for (const p of low) {
      const sup = p.category && p.category !== 'أدوات منزلية' ? p.category : 'بدون مورد';
      if (!m.has(sup)) m.set(sup, []);
      m.get(sup).push(p);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [low]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const nafed = low.filter((p) => (Number(p.stock) || 0) <= 0).length;

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <div className="stat red">
          <div className="label">📉 أصناف ناقصة</div>
          <div className="value">{num(low.length, ar)}</div>
          <div className="sub">مخزونها ≤ {num(limit, ar)}</div>
        </div>
        <div className="stat">
          <div className="label">🚫 نافد تماماً</div>
          <div className="value">{num(nafed, ar)}</div>
          <div className="sub">مخزون صفر</div>
        </div>
        <div className="stat orange">
          <div className="label">🏭 موردين مطلوب منهم</div>
          <div className="value">{num(bySupplier.filter(([s]) => s !== 'بدون مورد').length, ar)}</div>
          <div className="sub">اطلب النواقص بضغطة</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث بالاسم أو الكود أو المورد" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{num(low.length, ar)} صنف ناقص</span>
        </div>

        {bySupplier.map(([sup, items]) => (
          <div key={sup} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>🏭 {sup} <span className="badge red">{num(items.length, ar)} ناقص</span></h3>
              {sup !== 'بدون مورد' && (
                <button className="btn-accent btn-sm" onClick={() => router.push(`/order?supplier=${encodeURIComponent(sup)}&low=1`)}>
                  🧾 اطلب النواقص من {sup}
                </button>
              )}
            </div>
            <table className="tbl">
              <thead><tr><th>الكود</th><th>الصنف</th><th>المخزون</th><th>سعر البيع</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.code}</b></td>
                    <td>{p.name}</td>
                    <td>
                      <span className={`badge ${(Number(p.stock) || 0) <= 0 ? 'red' : 'orange'}`}>
                        {(Number(p.stock) || 0) <= 0 ? 'نافد' : num(p.stock, ar)}
                      </span>
                    </td>
                    <td>{num(p.price, ar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!low.length && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>المخزون كله تمام ✅ مفيش نواقص</p>}
      </div>
    </div>
  );
}
