'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  getSettings,
  saveSettings,
  seedIfEmpty,
  syncPull,
  cloudEnabled,
  flushPending,
  getRole,
  listInvoices,
  listProducts,
  getSupabase,
  runDailyBackup,
  ensureFullPush,
} from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { maybeSendDailyReport, maybeSendDebtReminders } from '@/lib/wa';
import GlobalSearch from '@/components/GlobalSearch';

// roles: مين يشوف الصفحة — perm: صلاحية بتسمح للكاشير لو الأدمن فعّلها
const NAV = [
  { href: '/accountant', label: '🧮 لوحة المحاسب', title: 'برنامج المحاسب', roles: ['admin', 'accountant'] },
  { href: '/pos', label: '🧾 فاتورة بيع', title: 'فاتورة بيع', roles: ['admin', 'cashier'] },
  { href: '/', label: '📊 لوحة التحكم', title: 'لوحة التحكم', roles: ['admin', 'accountant'] },
  { href: '/insights', label: '🧠 مركز الذكاء', title: 'نصايح تزوّد مكسبك', roles: ['admin', 'accountant'] },
  { href: '/payments', label: '💵 سند قبض', title: 'سند قبض', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/reps', label: '🛵 تحصيل المندوبين', title: 'تحصيل المندوبين', roles: ['admin', 'accountant'] },
  { href: '/debts', label: '📕 متابعة الآجل', title: 'متابعة الآجل والمديونيات', roles: ['admin', 'accountant'] },
  { href: '/expenses', label: '💸 المصاريف اليومية', title: 'المصاريف اليومية', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/invoices', label: '📁 الفواتير', title: 'الفواتير', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/returns', label: '↩️ مرتجع بيع', title: 'مرتجع بيع', roles: ['admin', 'cashier'] },
  { href: '/purchases', label: '📥 المشتريات والموردين', title: 'المشتريات والموردين', roles: ['admin', 'accountant'] },
  { href: '/order', label: '📋 طلب بضاعة من مورد', title: 'طلب بضاعة من مورد', roles: ['admin', 'accountant'] },
  { href: '/statement', label: '📄 كشف حساب', title: 'كشف حساب عميل', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/products', label: '📦 الأصناف والمخزون', title: 'الأصناف والمخزون', roles: ['admin', 'cashier'] },
  { href: '/lowstock', label: '📉 النواقص', title: 'النواقص', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/customers', label: '👥 العملاء', title: 'العملاء', roles: ['admin', 'cashier'] },
  { href: '/barcodes', label: '🏷️ استيكر باركود', title: 'استيكر باركود', roles: ['admin', 'cashier'] },
  { href: '/stocktake', label: '📋 جرد المخزون', title: 'جرد المخزون', roles: ['admin', 'cashier'] },
  { href: '/dayclose', label: '🧮 إقفال يومية', title: 'إقفال يومية', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/inquiry', label: '📱 استعلام أسعار', title: 'استعلام أسعار', roles: ['admin', 'cashier', 'accountant'] },
  { href: '/reports', label: '📈 التقارير', title: 'التقارير', roles: ['admin', 'accountant'], perm: 'cashierReports' },
  { href: '/audit', label: '📜 سجل العمليات', title: 'سجل العمليات', roles: ['admin', 'accountant'] },
  { href: '/whatsapp', label: '💬 واتساب', title: 'واتساب', roles: ['admin'], perm: 'cashierWhatsapp' },
  { href: '/settings', label: '⚙️ الإعدادات', title: 'الإعدادات', roles: ['admin'] },
  { href: '/admin', label: '👑 لوحة الأدمن', title: 'لوحة الأدمن', roles: ['admin'] },
];

const ROLE_HOME = { admin: '/', cashier: '/pos', accountant: '/accountant' };
const ROLE_LABEL = { admin: '👑 أدمن — نظام الكاشير', cashier: '💼 كاشير — نظام الكاشير', accountant: '🧮 برنامج المحاسب' };

function canSee(item, role, perms) {
  if (item.roles.includes(role)) return true;
  if (role === 'cashier' && item.perm && perms?.[item.perm]) return true;
  return false;
}

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [role, setRole] = useState('');
  const [locked, setLocked] = useState(false);
  const [lockPass, setLockPass] = useState('');
  const [lockErr, setLockErr] = useState('');
  const [printers, setPrinters] = useState([]);
  const [printerName, setPrinterName] = useState('');
  const [invQ, setInvQ] = useState(''); // بحث سريع برقم الفاتورة
  const [lowCount, setLowCount] = useState(0); // عدد الأصناف الناقصة (بادج القايمة)
  const lastBeat = useRef(Date.now());

  const bare =
    pathname.startsWith('/inv/') ||
    pathname.startsWith('/print/') ||
    pathname.startsWith('/order/print/') ||
    pathname === '/login' ||
    pathname === '/inquiry' ||
    pathname === '/catalog';

  // فحص الصلاحيات فقط — خفيف، بيتنفذ مع كل تنقل
  useEffect(() => {
    setCloud(cloudEnabled());
    if (!bare) {
      const authed = sessionStorage.getItem('saqqa_authed') === '1';
      if (!authed) {
        router.replace('/login');
        return;
      }
      const r = getRole();
      setRole(r);
      const item = NAV.find((n) => n.href === pathname);
      if (item && !canSee(item, r, getSettings().perms)) {
        router.replace(ROLE_HOME[r] || '/pos');
        return;
      }
      // عدد النواقص للبادج (خفيف — بيتحسب مع كل تنقل عشان يفضل محدّث)
      try {
        const st = getSettings();
        const limit = Number(st.lowStock) || 5;
        setLowCount(listProducts().filter((p) => (Number(p.stock) || 0) <= limit).length);
      } catch {}
    }
    setReady(true);
  }, [pathname, bare, router]);

  // التهيئة الثقيلة (تحميل الأصناف + المزامنة) مرة واحدة بس عند فتح البرنامج — مش مع كل تنقل
  useEffect(() => {
    if (bare) return;
    (async () => {
      await seedIfEmpty();
      syncPull();
      ensureFullPush();
    })();
    runDailyBackup();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const t = setInterval(() => {
      flushPending();
      syncPull(); // مزامنة دورية احتياطية (الأساسي هو Realtime)
      maybeSendDailyReport();
      maybeSendDebtReminders();
    }, 90000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث تلقائي: كل ما ننزل نسخة جديدة البرنامج بياخدها لوحده من غير ريفريش يدوي
  // (بيتأجل لو المستخدم في نص فاتورة عشان شغله ميتقطعش)
  useEffect(() => {
    if (bare) return;
    let current = '';
    let pendingReload = false;
    const getV = () => fetch('/version.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
    getV().then((v) => { current = v; });
    const safeToReload = () => {
      try {
        const d = JSON.parse(localStorage.getItem('saqqa_pos_draft') || 'null');
        const busy = d && d.rows && d.rows.some((r) => r.code || r.name);
        return !busy || pathname !== '/pos';
      } catch { return true; }
    };
    const t = setInterval(async () => {
      const v = await getV();
      if (v && current && v !== current) {
        if (safeToReload()) window.location.reload();
        else pendingReload = true;
      }
    }, 10 * 60 * 1000);
    const onVis = () => {
      if (pendingReload && document.visibilityState === 'visible' && safeToReload()) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bare]);

  // مزامنة لحظية Realtime من Supabase — أي تعديل من جهاز تاني بيوصل فوراً
  // بتأخير بسيط (debounce) عشان لو جالنا كذا تعديل ورا بعض منعملش سحب متكرر يتقّل الجهاز
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || bare) return;
    let timer = null;
    const ch = sb
      .channel('saqqa-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => syncPull(), 4000);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(ch);
    };
  }, [bare]);

  // قفل البرنامج عند السكون (Sleep) أو ترك الجهاز — بيطلب كلمة السر تاني
  useEffect(() => {
    if (bare) return;
    lastBeat.current = Date.now();
    const beat = setInterval(() => {
      if (Date.now() - lastBeat.current > 90000) setLocked(true); // الجهاز كان نايم
      lastBeat.current = Date.now();
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBeat.current > 60000) {
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(beat);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [bare]);

  // قائمة الطابعات (متاحة في نسخة الديسكتوب EXE — في المتصفح بيظهر خيار النافذة الافتراضية)
  useEffect(() => {
    setPrinterName(getSettings().printerName || '');
    if (typeof window !== 'undefined' && window.electronAPI?.getPrinters) {
      window.electronAPI.getPrinters().then(setPrinters).catch(() => {});
    }
  }, []);

  if (bare) return <>{children}</>;
  if (!ready) return null;

  const current = NAV.find((n) => n.href === pathname);
  const s = getSettings();
  const visibleNav = NAV.filter((n) => canSee(n, role, s.perms));

  function unlock(e) {
    e.preventDefault();
    const st = getSettings();
    const ok =
      lockPass === st.adminPassword ||
      (role === 'cashier' && lockPass === st.pin) ||
      (role === 'accountant' && lockPass === st.accountantPassword) ||
      (role === 'admin' && lockPass === st.adminPassword);
    if (ok) {
      setLocked(false);
      setLockPass('');
      setLockErr('');
    } else {
      setLockErr('كلمة السر غير صحيحة');
      setLockPass('');
    }
  }

  return (
    <div className="shell">
      {locked && (
        <div className="lock-overlay">
          <div className="pinbox card">
            <img src="/logo.jpg" alt="ALSAKA" className="login-logo" />
            <h2 style={{ color: 'var(--brand)', marginBottom: 4 }}>{s.companyName}</h2>
            <p className="muted" style={{ marginBottom: 16 }}>🔒 البرنامج مقفول — أدخل كلمة السر للمتابعة</p>
            <form onSubmit={unlock}>
              <input type="password" autoFocus value={lockPass} onChange={(e) => setLockPass(e.target.value)} placeholder="••••" dir="ltr" />
              {lockErr && <p className="red-text" style={{ marginTop: 8 }}>{lockErr}</p>}
              <button className="btn-accent" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>فتح</button>
            </form>
          </div>
        </div>
      )}

      <aside className="sidebar no-print">
        <div className="logo">
          <img src="/logo.jpg" alt="ALSAKA" className="logo-img" />
          <div>
            <h1>{s.companyName}</h1>
            <small>{ROLE_LABEL[role] || ''}</small>
            {typeof window !== 'undefined' && sessionStorage.getItem('saqqa_cashier_name') && (
              <small style={{ display: 'block', color: 'var(--accent)', fontWeight: 700 }}>
                👤 {sessionStorage.getItem('saqqa_cashier_name')}
              </small>
            )}
          </div>
        </div>
        <nav>
          {visibleNav.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''}>
              <span>{n.label}</span>
              {n.href === '/lowstock' && lowCount > 0 && (
                <span className="nav-badge">{lowCount}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="foot">
          {cloud ? '☁️ متزامن لحظياً مع السحابة' : '💾 تخزين محلي (فعّل السحابة من الإعدادات)'}
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <div className="title">{current ? current.title : s.companyName}</div>
          <div className="meta">
            <GlobalSearch />
            <select
              className="printer-select"
              title="اختيار الطابعة"
              value={printerName}
              onChange={(e) => {
                setPrinterName(e.target.value);
                saveSettings({ printerName: e.target.value });
              }}
            >
              <option value="">🖨️ الطابعة الافتراضية</option>
              {printers.map((p) => <option key={p} value={p}>🖨️ {p}</option>)}
            </select>
            <span>📅 {fmtDate(new Date().toISOString(), s.arabicDigits)}</span>
            <button
              className="btn-sm"
              onClick={() => {
                sessionStorage.removeItem('saqqa_authed');
                sessionStorage.removeItem('saqqa_role');
                sessionStorage.removeItem('saqqa_cashier_name');
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
