'use client';
// استعلام الأسعار من الموبايل (آيفون/أندرويد) — محمي بكلمة سر خاصة
import { useEffect, useMemo, useState } from 'react';
import {
  listProducts,
  getSettings,
  fetchProductsCloud,
  fetchSettingsCloud,
  cloudEnabled,
  seedIfEmpty,
} from '@/lib/db';
import { num } from '@/lib/format';

export default function InquiryPage() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      seedIfEmpty();
      let s = null;
      let list = null;
      if (cloudEnabled()) {
        s = await fetchSettingsCloud();
        list = await fetchProductsCloud();
      }
      setSettings({ ...getSettings(), ...(s || {}) });
      setProducts(list && list.length ? list : listProducts());
      setAuthed(sessionStorage.getItem('saqqa_inquiry') === '1');
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return products.slice(0, 30);
    const t = q.trim();
    return products.filter((p) => p.name.includes(t) || String(p.code).includes(t)).slice(0, 50);
  }, [q, products]);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>جاري التحميل...</p>;

  const ar = settings.arabicDigits;

  function login(e) {
    e.preventDefault();
    if (pass === (settings.inquiryPassword || '1111')) {
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
        <button
          className="btn-sm"
          style={{ marginRight: 'auto' }}
          onClick={() => { sessionStorage.removeItem('saqqa_inquiry'); setAuthed(false); }}
        >🔒</button>
      </div>
      <div className="inquiry-body">
        <input
          className="inquiry-search"
          placeholder="🔍 اكتب اسم الصنف أو الكود..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <p className="muted" style={{ margin: '8px 2px', fontSize: 13 }}>
          {num(filtered.length, ar)} صنف {!cloudEnabled() && '· 💾 بيانات الجهاز المحلي'}
        </p>
        {filtered.map((p) => (
          <div className="inquiry-item" key={p.id}>
            <div>
              <div className="i-name">{p.name}</div>
              <div className="i-code">كود {ar ? num(p.code, ar) : p.code}</div>
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
      </div>
    </div>
  );
}
