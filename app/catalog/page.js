'use client';
// كتالوج أونلاين عام للعملاء: يتفرجوا على الأصناف ويبعتوا طلبهم واتساب
import { useEffect, useMemo, useState } from 'react';
import {
  listProducts,
  getSettings,
  fetchProductsCloud,
  fetchSettingsCloud,
  cloudEnabled,
  cloudConfigFromHash,
  seedIfEmpty,
} from '@/lib/db';
import { num, normalizePhone } from '@/lib/format';

export default function CatalogPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({}); // code -> qty
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      cloudConfigFromHash();
      await seedIfEmpty();
      let s = null;
      let list = null;
      if (cloudEnabled()) {
        s = await fetchSettingsCloud();
        list = await fetchProductsCloud();
      }
      setSettings({ ...getSettings(), ...(s || {}) });
      setProducts((list && list.length ? list : listProducts()).filter((p) => !p.hidden));
      setLoading(false);
    })();
  }, []);

  const [showCount, setShowCount] = useState(60);
  const allFiltered = useMemo(() => {
    if (!q.trim()) return products;
    return products.filter((p) => p.name.includes(q.trim()) || String(p.code).includes(q.trim()));
  }, [q, products]);
  const filtered = allFiltered.slice(0, showCount);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>جاري التحميل...</p>;

  const ar = settings.arabicDigits;
  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([code, qty]) => ({ p: products.find((x) => String(x.code) === code), qty }))
    .filter((x) => x.p);
  const cartTotal = cartItems.reduce((s, x) => s + x.qty * (Number(x.p.price) || 0), 0);

  // رقم استقبال الطلبات: أول رقم في تليفونات الشركة
  const orderPhone = normalizePhone((settings.phones.match(/01[0-9]{9}/) || [''])[0]);

  function orderLink() {
    const lines = cartItems.map((x) => `• ${x.p.name} × ${x.qty} = ${num(x.qty * x.p.price)} ج`);
    const msg = `🛒 طلب جديد من الكتالوج:\n${lines.join('\n')}\n━━━━━━━━\nالإجمالي التقريبي: ${num(cartTotal)} ${settings.currency}\n\nالاسم: \nالعنوان: `;
    return `https://wa.me/${orderPhone}?text=${encodeURIComponent(msg)}`;
  }

  function setQty(code, qty) {
    setCart({ ...cart, [code]: Math.max(0, qty) });
  }

  return (
    <div className="inquiry-bg" style={{ paddingBottom: 90 }}>
      <div className="inquiry-head">
        <img src="/logo.jpg" alt="ALSAKA" />
        <div>
          <h2>{settings.companyName}</h2>
          <small>الكتالوج — اطلب على الواتساب 🛒</small>
        </div>
      </div>
      <div className="inquiry-body">
        <input className="inquiry-search" placeholder="🔍 دور على اللي محتاجه..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="catalog-grid">
          {filtered.map((p) => {
            const qty = cart[String(p.code)] || 0;
            return (
              <div className="catalog-item" key={p.id}>
                {p.image
                  ? <img src={p.image} alt={p.name} className="cat-img" />
                  : <div className="cat-img cat-noimg">🧺</div>}
                <div className="cat-name">{p.name}</div>
                <div className="cat-price">{num(p.price, ar)} <small>{settings.currency}</small></div>
                {qty === 0 ? (
                  <button className="btn-accent btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setQty(String(p.code), 1)}>➕ أضف للطلب</button>
                ) : (
                  <div className="cat-qty">
                    <button className="btn-sm" onClick={() => setQty(String(p.code), qty - 1)}>−</button>
                    <b>{num(qty, ar)}</b>
                    <button className="btn-sm" onClick={() => setQty(String(p.code), qty + 1)}>+</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!filtered.length && <p style={{ textAlign: 'center', padding: 30, color: '#b8c6d8' }}>مفيش نتائج 🔍</p>}
        {allFiltered.length > filtered.length && (
          <button className="btn-accent" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            onClick={() => setShowCount(showCount + 100)}>
            ⬇️ عرض المزيد ({allFiltered.length - filtered.length} صنف كمان)
          </button>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="cart-bar">
          <div>
            🛒 {num(cartItems.length, ar)} صنف — <b>{num(cartTotal, ar)} {settings.currency}</b>
          </div>
          <a className="btn btn-green" href={orderLink()} target="_blank" rel="noreferrer">
            💬 إرسال الطلب واتساب
          </a>
        </div>
      )}
    </div>
  );
}
