'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { resolveLogin } from '@/lib/db';

const ROLE_HOME = { admin: '/', accountant: '/accountant', cashier: '/pos' };

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  function submit(e) {
    e.preventDefault();
    const u = resolveLogin(pin);
    if (u) {
      sessionStorage.setItem('saqqa_authed', '1');
      sessionStorage.setItem('saqqa_role', u.role);
      sessionStorage.setItem('saqqa_cashier_name', u.name); // اسم اللي داخل — بيتسجل على الفاتورة
      router.replace(ROLE_HOME[u.role] || '/pos');
    } else {
      setErr('كلمة السر غير صحيحة');
      setPin('');
    }
  }

  return (
    <div className="login-bg">
      <div className="pinbox card">
        <img src="/logo.jpg" alt="ALSAKA" className="login-logo" />
        <h2 style={{ color: 'var(--brand)', marginBottom: 4 }}>السقا للأدوات المنزلية</h2>
        <p className="muted" style={{ marginBottom: 16 }}>أدخل كلمة السر — كاشير أو محاسب أو أدمن</p>
        <form onSubmit={submit}>
          <input
            type="password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            dir="ltr"
          />
          {err && <p className="red-text" style={{ marginTop: 8 }}>{err}</p>}
          <button className="btn-accent" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
            🔓 دخول
          </button>
        </form>
        <a href="/inquiry" className="muted" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
          📱 استعلام عن الأسعار من الموبايل ←
        </a>
      </div>
    </div>
  );
}
