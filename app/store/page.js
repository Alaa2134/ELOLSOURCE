'use client';
// 🛒 متجر التجار أونلاين — مربوط بمخزون المحل: التاجر يتصفّح، يختار الكميات، ويبعت طلبه
// الطلب بيتخزن في السحابة ويوصل للمحل في صفحة "طلبات المتجر" لحظياً
import { useEffect, useMemo, useState } from 'react';
import {
  listProducts, getSettings, fetchProductsCloud, fetchSettingsCloud,
  cloudEnabled, cloudConfigFromHash, seedIfEmpty, submitStoreOrder,
} from '@/lib/db';
import { num, normalizePhone } from '@/lib/format';

export default function StorePage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({}); // code -> qty
  const [showCount, setShowCount] = useState(60);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // رقم/تأكيد الطلب بعد الإرسال
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      cloudConfigFromHash();
      await seedIfEmpty();
      let s = null, list = null;
      if (cloudEnabled()) {
        s = await fetchSettingsCloud();
        list = await fetchProductsCloud();
      }
      setSettings({ ...getSettings(), ...(s || {}) });
      setProducts((list && list.length ? list : listProducts()).filter((p) => !p.hidden));
      setLoading(false);
    })();
  }, []);

  const allFiltered = useMemo(() => {
    if (!q.trim()) return products;
    const s = q.trim();
    return products.filter((p) => p.name.includes(s) || String(p.code).includes(s) || String(p.category || '').includes(s));
  }, [q, products]);
  const filtered = allFiltered.slice(0, showCount);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>جاري تحميل المتجر...</p>;
  const ar = settings.arabicDigits;
  const cur = settings.currency;

  // المتجر لتجار الجملة → سعر البيع
  const priceOf = (p) => (Number(p.price) || 0);

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([code, qty]) => ({ p: products.find((x) => String(x.code) === code), qty }))
    .filter((x) => x.p);
  const cartTotal = cartItems.reduce((s, x) => s + x.qty * priceOf(x.p), 0);
  const cartCount = cartItems.reduce((s, x) => s + x.qty, 0);

  const setQty = (code, v) => setCart((c) => ({ ...c, [code]: Math.max(0, Number(v) || 0) }));
  const add = (code) => setCart((c) => ({ ...c, [code]: (Number(c[code]) || 0) + 1 }));

  const shopPhone = normalizePhone((String(settings.phones || '').match(/01[0-9]{9}/) || [''])[0]);
  function waLink(orderNo) {
    const lines = cartItems.map((x) => `• ${x.p.name} × ${x.qty} = ${num(x.qty * priceOf(x.p))} ${cur}`);
    const msg = `🛒 طلب تاجر رقم ${orderNo || ''}\nالاسم: ${name}\nتليفون: ${phone}\n${notes ? 'ملاحظات: ' + notes + '\n' : ''}━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━\nالإجمالي: ${num(cartTotal)} ${cur}`;
    return shopPhone ? `https://wa.me/${shopPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  async function send() {
    setErr('');
    if (!cartItems.length) { setErr('اختار أصناف الأول'); return; }
    if (!name.trim() || !phone.trim()) { setErr('اكتب اسمك ورقم تليفونك'); return; }
    setSending(true);
    try {
      const order = {
        trader: { name: name.trim(), phone: phone.trim() },
        notes: notes.trim(),
        items: cartItems.map((x) => ({ code: x.p.code, name: x.p.name, qty: x.qty, price: priceOf(x.p), total: x.qty * priceOf(x.p) })),
        total: cartTotal,
      };
      const saved = await submitStoreOrder(order);
      setDone(saved);
    } catch (e) {
      setErr(e.message || 'حصلت مشكلة — جرب تبعت الطلب واتساب');
    }
    setSending(false);
  }

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
        <div className="card">
          <div style={{ fontSize: 54 }}>✅</div>
          <h2 style={{ color: 'var(--green)' }}>وصل طلبك للمحل!</h2>
          <p>شكراً {done.trader?.name} 🌹 — استلمنا طلبك ({num(done.items?.length || 0, ar)} صنف بإجمالي {num(done.total, ar)} {cur}) وهنتواصل معاك قريب.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-green" target="_blank" rel="noreferrer" href={waLink()}>💬 ابعت نسخة واتساب للمحل</a>
            <button onClick={() => { setDone(null); setCart({}); setName(''); setPhone(''); setNotes(''); }}>🛒 اعمل طلب جديد</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: cartCount ? 90 : 20 }}>
      <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <h2 style={{ color: 'var(--brand)', margin: 0 }}>🛒 متجر {settings.companyName} — أسعار الجملة للتجار</h2>
        <input style={{ marginTop: 10 }} placeholder="🔍 دوّر على صنف بالاسم أو الكود..." value={q} onChange={(e) => { setQ(e.target.value); setShowCount(60); }} />
      </div>

      <div className="store-grid">
        {filtered.map((p) => {
          const price = priceOf(p);
          const inCart = Number(cart[p.code]) || 0;
          return (
            <div key={p.id} className="store-card">
              {p.image ? <img src={p.image} alt="" className="store-img" /> : <div className="store-img store-noimg">📦</div>}
              <div className="store-name" title={p.name}>{p.name}</div>
              <div className="store-price">{num(price, ar)} <small>{cur}</small></div>
              {inCart > 0 ? (
                <div className="store-qty">
                  <button onClick={() => setQty(p.code, inCart - 1)}>−</button>
                  <input type="number" min="0" value={inCart} onChange={(e) => setQty(p.code, e.target.value)} />
                  <button onClick={() => add(p.code)}>+</button>
                </div>
              ) : (
                <button className="btn-accent store-add" onClick={() => add(p.code)}>➕ أضف للطلب</button>
              )}
            </div>
          );
        })}
      </div>
      {allFiltered.length > filtered.length && (
        <div style={{ textAlign: 'center', margin: 16 }}>
          <button className="btn-primary" onClick={() => setShowCount(showCount + 120)}>⬇️ عرض المزيد</button>
        </div>
      )}
      {!filtered.length && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>مفيش أصناف بالبحث ده</p>}

      {cartCount > 0 && (
        <div className="store-cartbar">
          <details>
            <summary>
              🛒 <b>{num(cartCount, ar)}</b> قطعة · الإجمالي <b>{num(cartTotal, ar)} {cur}</b> — راجع وابعت الطلب
            </summary>
            <div style={{ marginTop: 10 }}>
              {cartItems.map((x) => (
                <div key={x.p.code} className="store-cartrow">
                  <span>{x.p.name}</span>
                  <span>{num(x.qty, ar)} × {num(priceOf(x.p), ar)} = <b>{num(x.qty * priceOf(x.p), ar)}</b></span>
                  <button className="btn-sm btn-red" onClick={() => setQty(x.p.code, 0)}>✕</button>
                </div>
              ))}
              <div className="grid cols-3" style={{ gap: 8, marginTop: 10 }}>
                <input placeholder="اسمك / اسم المحل *" value={name} onChange={(e) => setName(e.target.value)} />
                <input dir="ltr" placeholder="رقم تليفونك *" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {err && <p className="red-text" style={{ marginTop: 8 }}>⚠️ {err}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn-green" disabled={sending} onClick={send}>{sending ? '⏳ بنبعت...' : '✅ ابعت الطلب للمحل'}</button>
                <a className="btn" target="_blank" rel="noreferrer" href={waLink()}>💬 أو ابعته واتساب</a>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
