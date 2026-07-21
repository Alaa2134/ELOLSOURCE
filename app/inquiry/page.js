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
} from '@/lib/db';
import { num } from '@/lib/format';
import BarcodeScanner from '@/components/BarcodeScanner';

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
      setAuthed(sessionStorage.getItem('saqqa_inquiry') === '1');
      setInApp(sessionStorage.getItem('saqqa_authed') === '1'); // موظف داخل البرنامج
      setLoading(false);
      // وبعدين نحدّث من السحابة ورا الكواليس لو متاحة (من غير ما نعلّق الصفحة)
      if (cloudEnabled()) {
        try {
          const [s, list] = await Promise.all([fetchSettingsCloud(), fetchProductsCloud()]);
          if (!alive) return;
          if (s) setSettings((prev) => ({ ...prev, ...s }));
          if (list && list.length) setProducts(list);
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, []);

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
        <p className="muted" style={{ margin: '8px 2px', fontSize: 13 }}>
          {q
            ? `${num(allFiltered.length, ar)} نتيجة`
            : `إجمالي الأصناف: ${num(allFiltered.length, ar)} — معروض ${num(filtered.length, ar)}، ابحث توصل لأي صنف فوراً`}
          {!cloudEnabled() && ' · 💾 بيانات الجهاز المحلي'}
        </p>
        {filtered.map((p) => (
          <div className="inquiry-item" key={p.id}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {p.image && <img src={p.image} alt="" className="thumb" style={{ width: 46, height: 46 }} />}
              <div>
                <div className="i-name">{p.name}</div>
                <div className="i-code">كود {ar ? num(p.code, ar) : p.code}</div>
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="i-price">{num(p.price, ar)} <small>{settings.currency}</small></div>
              {settings.perms?.showStockInquiry && (
                <span className={`badge ${(Number(p.stock) || 0) > 0 ? 'green' : 'red'}`}>
                  {(Number(p.stock) || 0) > 0 ? `متوفر ${num(p.stock, ar)}` : 'نافد'}
                </span>
              )}
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
    </div>
  );
}
