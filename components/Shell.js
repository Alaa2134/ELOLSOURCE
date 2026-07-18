'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSettings, seedIfEmpty, syncPull, cloudEnabled, flushPending, getRole } from '@/lib/db';
import { fmtDate } from '@/lib/format';

const NAV = [
  { href: '/pos', label: '🧾 فاتورة بيع', title: 'فاتورة بيع' },
  { href: '/', label: '📊 لوحة التحكم', title: 'لوحة التحكم', admin: true },
  { href: '/payments', label: '💵 سند قبض', title: 'سند قبض' },
  { href: '/invoices', label: '📁 الفواتير', title: 'الفواتير' },
  { href: '/statement', label: '📄 كشف حساب', title: 'كشف حساب عميل' },
  { href: '/products', label: '📦 الأصناف والمخزون', title: 'الأصناف والمخزون' },
  { href: '/customers', label: '👥 العملاء', title: 'العملاء' },
  { href: '/barcodes', label: '🏷️ استيكر باركود', title: 'استيكر باركود' },
  { href: '/dayclose', label: '🧮 إقفال يومية', title: 'إقفال يومية' },
  { href: '/inquiry', label: '📱 استعلام أسعار', title: 'استعلام أسعار' },
  { href: '/reports', label: '📈 التقارير', title: 'التقارير', admin: true, perm: 'cashierReports' },
  { href: '/audit', label: '📜 سجل العمليات', title: 'سجل العمليات', admin: true, strict: true },
  { href: '/whatsapp', label: '💬 واتساب', title: 'واتساب', admin: true, perm: 'cashierWhatsapp' },
  { href: '/settings', label: '⚙️ الإعدادات', title: 'الإعدادات', admin: true },
  { href: '/admin', label: '👑 لوحة الأدمن', title: 'لوحة الأدمن', admin: true, strict: true },
];

// صفحات للأدمن فقط (الكاشير بيتحول لشاشة البيع) — perm بتسمح للكاشير لو الأدمن فعّلها
const ADMIN_PAGES = {
  '/': null,
  '/reports': 'cashierReports',
  '/whatsapp': 'cashierWhatsapp',
  '/settings': null,
  '/admin': null,
  '/audit': null,
};

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [role, setRole] = useState('');

  // صفحات بدون قائمة جانبية (عرض عام / طباعة / دخول / استعلام)
  const bare =
    pathname.startsWith('/inv/') ||
    pathname.startsWith('/print/') ||
    pathname === '/login' ||
    pathname === '/inquiry';

  useEffect(() => {
    seedIfEmpty();
    setCloud(cloudEnabled());
    if (!bare) {
      const authed = sessionStorage.getItem('saqqa_authed') === '1';
      if (!authed) {
        router.replace('/login');
        return;
      }
      const r = getRole();
      setRole(r);
      // حماية صفحات الأدمن
      if (r !== 'admin' && pathname in ADMIN_PAGES) {
        const perm = ADMIN_PAGES[pathname];
        const allowed = perm && getSettings().perms?.[perm];
        if (!allowed) {
          router.replace('/pos');
          return;
        }
      }
    }
    setReady(true);
    syncPull();
    // تسجيل الـ Service Worker (تطبيق PWA + شغل بدون إنترنت)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const t = setInterval(() => flushPending(), 30000);
    return () => clearInterval(t);
  }, [pathname, bare, router]);

  if (bare) return <>{children}</>;
  if (!ready) return null;

  const current = NAV.find((n) => n.href === pathname);
  const s = getSettings();
  const visibleNav = NAV.filter((n) => {
    if (!n.admin) return true;
    if (role === 'admin') return true;
    if (n.strict) return false;
    return n.perm && s.perms?.[n.perm];
  });

  return (
    <div className="shell">
      <aside className="sidebar no-print">
        <div className="logo">
          <img src="/logo.jpg" alt="ALSAKA" className="logo-img" />
          <div>
            <h1>{s.companyName}</h1>
            <small>{role === 'admin' ? '👑 أدمن' : '💼 كاشير'} — نظام الكاشير</small>
          </div>
        </div>
        <nav>
          {visibleNav.map((n) => (
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
                sessionStorage.removeItem('saqqa_role');
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
