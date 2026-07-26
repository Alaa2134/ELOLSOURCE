'use client';
// استعلام الأسعار من الموبايل (آيفون/أندرويد) — محمي بكلمة سر خاصة
// بياخد أسعاره ومنتجاته من نفس صفحة الأصناف والمخزون (محلي + سحابة)
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listProducts,
  getSettings,
  fetchProductsCloud,
  fetchSettingsCloud,
  cloudEnabled,
  seedIfEmpty,
  cloudConfigFromHash,
  getRole,
  saveProductsLocal,
  pricesSyncedAt,
  listCustomers,
  sendRepOrder,
  flushRepOrders,
  listPendingRepOrders,
} from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';
import BarcodeScanner from '@/components/BarcodeScanner';
import ImageZoom from '@/components/ImageZoom';

const ROLE_HOME = { admin: '/', cashier: '/pos', accountant: '/accountant' };
// توحيد النص للبحث: بيشيل المسافات والنجمة عشان "6 1" أو "61" يلاقوا "6*1"
const normSearch = (s) => String(s || '').replace(/[\s*]/g, '');

export default function InquiryPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showCount, setShowCount] = useState(30);
  const [inApp, setInApp] = useState(false); // مفتوحة من جوه البرنامج؟ (نعرض زر رجوع)
  const [zoom, setZoom] = useState(null); // الصنف المفتوح بصورته
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState(null); // آخر تحديث للأسعار
  const [refreshing, setRefreshing] = useState(false);
  // ===== أخذ الطلبات: العميل + السلة =====
  const [customers, setCustomers] = useState([]);
  const [cust, setCust] = useState(null);      // { name, phone, priceType }
  const [pickCust, setPickCust] = useState(false); // نافذة اختيار العميل
  const [custQ, setCustQ] = useState('');
  const [cart, setCart] = useState({});        // code -> qty
  const [showCart, setShowCart] = useState(false);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);      // رسالة بعد الإرسال
  const [pending, setPending] = useState(0);   // طلبات مستنية النت

  // زر الرجوع للبرنامج (بيظهر بس لما تكون مفتوحة من جوه البرنامج مش من موبايل العميل)
  function backToApp() {
    const r = getRole();
    router.push(ROLE_HOME[r] || '/pos');
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      cloudConfigFromHash(); // مسح QR الأدمن بيظبط الموبايل على السحابة تلقائياً
      try { await seedIfEmpty(); } catch {}
      // نعرض المحلي فوراً (مفيش انتظار) — والعميل يقدر يبحث على طول
      if (!alive) return;
      setSettings(getSettings());
      setProducts(listProducts());
      setCustomers(listCustomers());
      setPending(listPendingRepOrders().length);
      setAuthed(sessionStorage.getItem('saqqa_inquiry') === '1');
      setInApp(sessionStorage.getItem('saqqa_authed') === '1'); // موظف داخل البرنامج
      setLoading(false);
      setSyncedAt(pricesSyncedAt());
      // وبعدين نحدّث من السحابة ورا الكواليس لو متاحة (من غير ما نعلّق الصفحة)
      if (cloudEnabled()) await pullPrices(alive);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تسخين الكاش: بنبعت للـ service worker كل ملف الصفحة حمّلته فعلاً
  // عشان أول فتحة من غير نت تلاقي الصفحة وملفاتها كاملة مش الصفحة لوحدها
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.ready.then((reg) => {
        const urls = [
          ...[...document.querySelectorAll('script[src]')].map((el) => el.src),
          ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((el) => el.href),
        ].filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: 'warm', urls: [...new Set(urls)] });
      }).catch(() => {});
    }, 2500); // بعد ما الصفحة تخلص تحميل
    return () => clearTimeout(t);
  }, []);

  // أول ما النت يرجع، الطلبات المستنية بتتبعت لوحدها
  useEffect(() => {
    if (!online) return;
    (async () => {
      const n = await flushRepOrders();
      const left = listPendingRepOrders().length;
      setPending(left);
      if (n > 0) setSent(`📤 اتبعت ${n} طلب كانوا مستنيين النت`);
    })();
  }, [online]);

  // السعر حسب نوع العميل: تاجر جملة = سعر البيع · غيره = سعر النقدي
  function priceOf(p, c = cust) {
    if (c?.priceType === 'تاجر جملة') return Number(p.price) || 0;
    return Number(p.priceRetail) > 0 ? Number(p.priceRetail) : (Number(p.price) || 0);
  }

  const cartRows = useMemo(() => {
    const out = [];
    for (const [code, qty] of Object.entries(cart)) {
      const p = products.find((x) => String(x.code) === String(code));
      if (p && qty > 0) out.push({ p, qty, line: qty * priceOf(p) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, products, cust]);
  const cartCount = cartRows.reduce((n, r) => n + r.qty, 0);
  const cartTotal = cartRows.reduce((n, r) => n + r.line, 0);

  function addToCart(p, delta = 1) {
    setCart((prev) => {
      const next = { ...prev };
      const q = (next[p.code] || 0) + delta;
      if (q <= 0) delete next[p.code];
      else next[p.code] = q;
      return next;
    });
  }
  function setQty(p, q) {
    const n = Math.max(0, Number(q) || 0);
    setCart((prev) => {
      const next = { ...prev };
      if (n === 0) delete next[p.code];
      else next[p.code] = n;
      return next;
    });
  }

  async function submitOrder() {
    if (!cartRows.length) return;
    if (!cust?.name) { setPickCust(true); return; }
    setSending(true);
    const order = {
      trader: { name: cust.name, phone: cust.phone || '' },
      source: 'مندوب',
      rep: (localStorage.getItem('saqqa_rep_name') || '').trim(),
      notes: notes.trim(),
      items: cartRows.map((r) => ({
        code: r.p.code, name: r.p.name, qty: r.qty, price: priceOf(r.p), total: r.line,
      })),
      total: Math.round(cartTotal * 100) / 100,
    };
    const res = await sendRepOrder(order);
    setSending(false);
    setCart({});
    setNotes('');
    setShowCart(false);
    setPending(listPendingRepOrders().length);
    setSent(res.sent
      ? `✅ الطلب راح للكاشير — ${cust.name}`
      : `📥 اتحفظ على الموبايل وهيتبعت أول ما النت يرجع — ${cust.name}`);
    setTimeout(() => setSent(null), 6000);
  }

  // متابعة حالة النت — المندوب لازم يعرف إنه شغال بأسعار متخزنة
  useEffect(() => {
    const set = () => setOnline(navigator.onLine);
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, []);

  // سحب أحدث أسعار وحفظها على الجهاز — من غير الحفظ ده الأوفلاين بيرجع لأسعار قديمة
  async function pullPrices(alive = true) {
    setRefreshing(true);
    try {
      const [st, list] = await Promise.all([fetchSettingsCloud(), fetchProductsCloud()]);
      if (!alive) return;
      if (st) setSettings((prev) => ({ ...prev, ...st }));
      if (list && list.length) {
        setProducts(list);
        saveProductsLocal(list);
        setSyncedAt(pricesSyncedAt());
      }
    } catch {}
    if (alive) setRefreshing(false);
  }

  const allFiltered = useMemo(() => {
    if (!q.trim()) return products;
    const t = q.trim();
    // بحث ذكي: كل كلمة في اللي كتبته لازم تكون موجودة في الاسم أو الكود
    // (مش لازم متجاورين) — وبيتجاهل المسافات والنجمة عشان "6 1" يلاقي "6*1"
    const words = t.split(/\s+/).map(normSearch).filter(Boolean);
    return products.filter((p) => {
      const hay = normSearch(p.name) + ' ' + String(p.code);
      if (p.name.includes(t) || String(p.code).includes(t)) return true;
      return words.every((w) => hay.includes(w));
    });
  }, [q, products]);
  const filtered = allFiltered.slice(0, showCount);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>جاري التحميل...</p>;

  const ar = settings.arabicDigits;

  function login(e) {
    e.preventDefault();
    if (pass === (settings.inquiryPassword || '261179')) {
      sessionStorage.setItem('saqqa_inquiry', '1');
      setAuthed(true);
    } else {
      setErr('كلمة السر غير صحيحة');
      setPass('');
    }
  }

  if (!authed) {
    return (
      <div className="inquiry-bg">
        <div className="pinbox card">
          <img src="/logo.jpg" alt="ALSAKA" className="login-logo" />
          <h2 style={{ color: 'var(--brand)', marginBottom: 4 }}>{settings.companyName}</h2>
          <p className="muted" style={{ marginBottom: 16 }}>📱 استعلام الأسعار — أدخل كلمة السر</p>
          <form onSubmit={login}>
            <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••" dir="ltr" />
            {err && <p className="red-text" style={{ marginTop: 8 }}>{err}</p>}
            <button className="btn-accent" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>دخول</button>
          </form>
          {inApp && (
            <button className="btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={backToApp}>
              ⬅ رجوع للبرنامج
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="inquiry-bg">
      <div className="inquiry-head">
        <img src="/logo.jpg" alt="ALSAKA" />
        <div>
          <h2>{settings.companyName}</h2>
          <small>استعلام الأسعار</small>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
          {inApp && (
            <button className="btn-sm btn-accent" onClick={backToApp}>⬅ رجوع للبرنامج</button>
          )}
          <button
            className="btn-sm"
            onClick={() => { sessionStorage.removeItem('saqqa_inquiry'); setAuthed(false); }}
          >🔒</button>
        </div>
      </div>
      <div className="inquiry-body">
        {/* العميل اللي المندوب واقف عنده — السعر بيتظبط على نوعه */}
        <button className={`rep-cust ${cust ? 'on' : ''}`} onClick={() => setPickCust(true)}>
          {cust ? (
            <>
              <b>👤 {cust.name}</b>
              <small>{cust.priceType === 'تاجر جملة' ? 'تاجر جملة' : 'عميل نقدي'}{cust.phone ? ` · ${cust.phone}` : ''}</small>
            </>
          ) : (
            <b>👤 اختار العميل اللي انت عنده</b>
          )}
          <span className="rep-cust-x">{cust ? 'غيّر' : '▼'}</span>
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="inquiry-search"
            style={{ flex: 1 }}
            placeholder="🔍 اكتب اسم الصنف أو الكود..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setShowCount(30); }}
            autoFocus
          />
          <button className="btn-accent" style={{ borderRadius: 12, fontSize: 22, padding: '0 16px' }}
            title="مسح الباركود بالكاميرا" onClick={() => setScanning(true)}>
            📷
          </button>
        </div>
        {scanning && (
          <BarcodeScanner
            onScan={(code) => {
              // نبحث بالباركود أو الكود ونعرض النتيجة فوراً
              const p = products.find((x) => String(x.barcode || '') === code || String(x.code) === code);
              setQ(p ? String(p.code) : code);
            }}
            onClose={() => setScanning(false)}
          />
        )}
        <div className="inq-status">
          <span className="muted">
            {q ? `${num(allFiltered.length, ar)} نتيجة` : `${num(allFiltered.length, ar)} صنف`}
          </span>
          {!online && <span className="badge orange">📴 من غير نت — الأسعار المتخزنة</span>}
          {syncedAt && (
            <span className="muted" style={{ fontSize: 12 }}>
              آخر تحديث: {fmtDate(syncedAt, ar)} {fmtTime(syncedAt, ar)}
            </span>
          )}
          {cloudEnabled() && (
            <button className="btn-sm" disabled={refreshing || !online} onClick={() => pullPrices(true)}>
              {refreshing ? '⏳' : '🔄'} حدّث الأسعار
            </button>
          )}
        </div>
        {filtered.map((p) => (
          <div className="inquiry-item" key={p.id} onClick={() => setZoom(p)} role="button" tabIndex={0}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {p.image
                ? <img src={p.image} alt="" className="thumb" style={{ width: 46, height: 46 }} />
                : <span className="i-nophoto">📷</span>}
              <div>
                <div className="i-name">{p.name}</div>
                <div className="i-code">كود {ar ? num(p.code, ar) : p.code}</div>
              </div>
            </div>
            <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <div className="i-price">{num(priceOf(p), ar)} <small>{settings.currency}</small></div>
                {settings.perms?.showStockInquiry && (
                  <span className={`badge ${(Number(p.stock) || 0) > 0 ? 'green' : 'red'}`}>
                    {(Number(p.stock) || 0) > 0 ? `متوفر ${num(p.stock, ar)}` : 'نافد'}
                  </span>
                )}
              </div>
              {/* + بيضيف الصنف للطلب — الدوسة مبتفتحش الصورة */}
              <button
                className={`i-add ${cart[p.code] ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); addToCart(p); }}
                aria-label={`ضيف ${p.name} للطلب`}
              >
                {cart[p.code] ? num(cart[p.code], ar) : '+'}
              </button>
            </div>
          </div>
        ))}
        {!filtered.length && <p className="muted" style={{ textAlign: 'center', padding: 30 }}>مفيش نتائج 🔍</p>}
        {allFiltered.length > filtered.length && (
          <button className="btn-accent" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={() => setShowCount(showCount + 100)}>
            ⬇️ عرض المزيد ({num(allFiltered.length - filtered.length, ar)} صنف كمان)
          </button>
        )}
      </div>

      {/* شريط السلة الثابت تحت */}
      {cartRows.length > 0 && !showCart && (
        <button className="cart-bar" onClick={() => setShowCart(true)}>
          <span className="cart-n">🛒 {num(cartCount, ar)}</span>
          <b>{num(cartTotal, ar)} {settings.currency}</b>
          <span className="cart-go">راجع الطلب ←</span>
        </button>
      )}

      {sent && <div className="rep-toast">{sent}</div>}
      {pending > 0 && !sent && (
        <div className="rep-toast warn">📥 {num(pending, ar)} طلب مستني النت</div>
      )}

      {/* اختيار العميل */}
      {pickCust && (() => {
        const t = custQ.trim();
        const list = t
          ? customers.filter((c) => c.name.includes(t) || (c.phone || '').includes(t)).slice(0, 40)
          : customers.slice(0, 40);
        return (
          <div className="sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPickCust(false); }}>
            <div className="sheet">
              <div className="sheet-head">
                <b>👤 مين العميل؟</b>
                <button onClick={() => setPickCust(false)}>✕</button>
              </div>
              <input
                className="inquiry-search" autoFocus
                placeholder="دوّر بالاسم أو التليفون..."
                value={custQ} onChange={(e) => setCustQ(e.target.value)}
              />
              <div className="sheet-list">
                {list.map((c) => (
                  <button key={c.id} className="sheet-row" onClick={() => { setCust(c); setPickCust(false); setCustQ(''); }}>
                    <span><b>{c.name}</b><small dir="ltr">{c.phone || 'بدون تليفون'}</small></span>
                    <span className={`badge ${c.priceType === 'تاجر جملة' ? 'green' : 'orange'}`}>
                      {c.priceType === 'تاجر جملة' ? 'جملة' : 'نقدي'}
                    </span>
                  </button>
                ))}
                {!list.length && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>مفيش عميل بالاسم ده</p>}
              </div>
              {t && !customers.some((c) => c.name === t) && (
                <button
                  className="btn-accent sheet-new"
                  onClick={() => { setCust({ name: t, phone: '', priceType: 'عميل نقدي' }); setPickCust(false); setCustQ(''); }}
                >
                  ➕ عميل جديد باسم «{t}»
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* مراجعة الطلب قبل الإرسال */}
      {showCart && (
        <div className="sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCart(false); }}>
          <div className="sheet">
            <div className="sheet-head">
              <b>🛒 الطلب {cust ? `— ${cust.name}` : ''}</b>
              <button onClick={() => setShowCart(false)}>✕</button>
            </div>
            <div className="sheet-list">
              {cartRows.map((r) => (
                <div key={r.p.code} className="cart-row">
                  <div className="cart-name">
                    <b>{r.p.name}</b>
                    <small>{num(priceOf(r.p), ar)} {settings.currency} × {num(r.qty, ar)} = <b>{num(r.line, ar)}</b></small>
                  </div>
                  <div className="qty-box">
                    <button onClick={() => addToCart(r.p, -1)}>−</button>
                    <input
                      type="number" inputMode="numeric" min="0" value={r.qty}
                      onChange={(e) => setQty(r.p, e.target.value)}
                    />
                    <button onClick={() => addToCart(r.p, +1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <input
              className="inquiry-search" placeholder="ملاحظات للكاشير (اختياري)..."
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
            <div className="sheet-total">
              <span>الإجمالي</span>
              <b>{num(cartTotal, ar)} {settings.currency}</b>
            </div>
            {!cust && <p className="red-text" style={{ padding: '0 4px 8px' }}>اختار العميل الأول</p>}
            <button className="btn-accent sheet-new" disabled={sending} onClick={submitOrder}>
              {sending ? '⏳ بيتبعت...' : online ? '📤 ابعت الطلب للكاشير' : '📥 احفظ الطلب (هيتبعت لما النت يرجع)'}
            </button>
            <button className="sheet-clear" onClick={() => { setCart({}); setShowCart(false); }}>🗑️ فضّي الطلب</button>
          </div>
        </div>
      )}

      {zoom && (
        <ImageZoom src={zoom.image} alt={zoom.name} onClose={() => setZoom(null)}>
          <div className="zoom-info">
            <b>{zoom.name}</b>
            <div className="zoom-meta">
              <span>كود {ar ? num(zoom.code, ar) : zoom.code}</span>
              <span className="zoom-price">{num(priceOf(zoom), ar)} {settings.currency}</span>
              {Number(zoom.packQty) > 0 && (
                <span>{zoom.packName || 'عبوة'} = {num(zoom.packQty, ar)} قطعة</span>
              )}
              {settings.perms?.showStockInquiry && (
                <span className={`badge ${(Number(zoom.stock) || 0) > 0 ? 'green' : 'red'}`}>
                  {(Number(zoom.stock) || 0) > 0 ? `متوفر ${num(zoom.stock, ar)}` : 'نافد'}
                </span>
              )}
              <button className="zoom-add" onClick={() => addToCart(zoom)}>
                ➕ ضيفه للطلب{cart[zoom.code] ? ` (${num(cart[zoom.code], ar)})` : ''}
              </button>
            </div>
          </div>
        </ImageZoom>
      )}
    </div>
  );
}
