'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSettings, seedIfEmpty, syncPull, cloudEnabled, flushPending } from '@/lib/db';
import { fmtDate } from '@/lib/format';

const NAV = [
  { href: '/pos', label: '🧾 فاتورة بيع', title: 'فاتورة بيع' },
  { href: '/', label: '📊 لوحة التحكم', title: 'لوحة التحكم' },
  { href: '/invoices', label: '📁 الفواتير', title: 'الفواتير' },
  { href: '/products', label: '📦 الأصناف والمخزون', title: 'الأصناف والمخزون' },
  { href: '/customers', label: '👥 العملاء', title: 'العملاء' },
  { href: '/reports', label: '📈 التقارير', title: 'التقارير' },
  { href: '/whatsapp', label: '💬 واتساب', title: 'واتساب' },
  { href: '/settings', label: '⚙️ الإعدادات', title: 'الإعدادات' },
];

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState(false);

  // صفحات بدون قائمة جانبية (عرض عام / طباعة / دخول)
  const bare =
    pathname.startsWith('/inv/') || pathname.startsWith('/print/') || pathname === '/login';

  useEffect(() => {
    seedIfEmpty();
    setCloud(cloudEnabled());
    if (!bare) {
      const authed = sessionStorage.getItem('saqqa_authed') === '1';
      if (!authed) {
        router.replace('/login');
        return;
      }
    }
    setReady(true);
    syncPull();
    const t = setInterval(() => flushPending(), 30000);
    return () => clearInterval(t);
  }, [pathname, bare, router]);

  if (bare) return <>{children}</>;
  if (!ready) return null;

  const current = NAV.find((n) => n.href === pathname);
  const s = getSettings();

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="logo">
          <div className="logo-circle">{s.logoText || 'A'}</div>
          <div>
            <h1>{s.companyName}</h1>
            <small>نظام الكاشير المتكامل</small>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="foot">
          {cloud ? '☁️ متصل بالتخزين السحابي' : '💾 تخزين محلي (فعّل السحابة من الإعدادات)'}
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <div className="title">{current ? current.title : s.companyName}</div>
          <div className="meta">
            <span>📅 {fmtDate(new Date().toISOString(), s.arabicDigits)}</span>
            <button
              className="btn-sm"
              onClick={() => {
                sessionStorage.removeItem('saqqa_authed');
                router.replace('/login');
              }}
            >
              🔒 خروج
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
