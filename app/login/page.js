'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getSettings } from '@/lib/db';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  function submit(e) {
    e.preventDefault();
    const s = getSettings();
    if (pin === (s.pin || '1234')) {
      sessionStorage.setItem('saqqa_authed', '1');
      router.replace('/pos');
    } else {
      setErr('الرقم السري غير صحيح');
      setPin('');
    }
  }

  return (
    <div className="pinbox card">
      <div className="logo-circle" style={{ margin: '0 auto 12px', width: 64, height: 64, fontSize: 34 }}>
        A
      </div>
      <h2 style={{ color: 'var(--brand)', marginBottom: 4 }}>السقا للأدوات المنزلية</h2>
      <p className="muted" style={{ marginBottom: 16 }}>أدخل الرقم السري للدخول (الافتراضي 1234)</p>
      <form onSubmit={submit}>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
        />
        {err && <p className="red-text" style={{ marginTop: 8 }}>{err}</p>}
        <button className="btn-accent" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
          دخول
        </button>
      </form>
    </div>
  );
}
