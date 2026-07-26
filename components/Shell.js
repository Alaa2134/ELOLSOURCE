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
  fetchStoreOrders,
} from '@/lib/db';
import { fmtDate } from '@/lib/format';
import { maybeSendDailyReport, maybeSendDebtReminders } from '@/lib/wa';
import GlobalSearch from '@/components/GlobalSearch';

// roles: مين يشوف الصفحة — perm: صلاحية بتسمح للكاشير لو الأدمن فعّلها
// group: القسم في القايمة الجانبية (عشان الـ27 صفحة تبقى مرتبة مش كومة واحدة)
const NAV = [
  // — البيع اليومي —
  { href: '/pos', label: '🧾 فاتورة بيع', title: 'فاتورة بيع', roles: ['admin', 'cashier'], group: 'الشغل اليومي' },
  { href: '/payments', label: '💵 سند قبض', title: 'سند قبض', roles: ['admin', 'cashier', 'accountant'], group: 'الشغل اليومي' },
  { href: '/returns', label: '↩️ مرتجع بيع', title: 'مرتجع بيع', roles: ['admin', 'cashier'], group: 'الشغل اليومي' },
  { href: '/expenses', label: '💸 المصاريف', title: 'المصاريف اليومية', roles: ['admin', 'cashier', 'accountant'], group: 'الشغل اليومي' },
  { href: '/dayclose', label: '🧮 إقفال يومية', title: 'إقفال يومية والخزنة', roles: ['admin', 'cashier', 'accountant'], group: 'الشغل اليومي' },
  { href: '/store-orders', label: '📥 طلبات المتجر', title: 'طلبات التجار من المتجر أونلاين', roles: ['admin', 'cashier', 'accountant'], group: 'الشغل اليومي' },

  // — المخزون —
  { href: '/products', label: '📦 الأصناف والمخزون', title: 'الأصناف والمخزون', roles: ['admin', 'cashier'], group: 'المخزون' },
  { href: '/lowstock', label: '📉 النواقص', title: 'النواقص', roles: ['admin', 'cashier', 'accountant'], group: 'المخزون' },
  { href: '/purchases', label: '📥 المشتريات والموردين', title: 'المشتريات والموردين', roles: ['admin', 'accountant'], group: 'المخزون' },
  { href: '/order', label: '📋 طلب بضاعة', title: 'طلب بضاعة من مورد', roles: ['admin', 'accountant'], group: 'المخزون' },
  { href: '/stocktake', label: '📋 جرد المخزون', title: 'جرد المخزون', roles: ['admin', 'cashier'], group: 'المخزون' },
  { href: '/barcodes', label: '🏷️ استيكر باركود', title: 'استيكر باركود', roles: ['admin', 'cashier'], group: 'المخزون' },

  // — العملاء —
  { href: '/customers', label: '👥 العملاء', title: 'العملاء', roles: ['admin', 'cashier'], group: 'العملاء' },
  { href: '/debts', label: '📕 متابعة الآجل', title: 'متابعة الآجل والمديونيات', roles: ['admin', 'accountant'], group: 'العملاء' },
  { href: '/reps', label: '🛵 تحصيل المندوبين', title: 'تحصيل المندوبين', roles: ['admin', 'accountant'], group: 'العملاء' },
  { href: '/statement', label: '📄 كشف حساب', title: 'كشف حساب عميل', roles: ['admin', 'cashier', 'accountant'], group: 'العملاء' },
  { href: '/quotes', label: '📝 عروض أسعار', title: 'عروض أسعار للعملاء', roles: ['admin', 'cashier', 'accountant'], group: 'العملاء' },
  { href: '/invoices', label: '📁 الفواتير', title: 'الفواتير', roles: ['admin', 'cashier', 'accountant'], group: 'العملاء' },

  // — التقارير —
  { href: '/', label: '📊 لوحة التحكم', title: 'لوحة التحكم', roles: ['admin', 'accountant'], group: 'التقارير' },
  { href: '/insights', label: '🧠 مركز الذكاء', title: 'نصايح تزوّد مكسبك', roles: ['admin', 'accountant'], group: 'التقارير' },
  { href: '/reports', label: '📈 التقارير', title: 'التقارير', roles: ['admin', 'accountant'], perm: 'cashierReports', group: 'التقارير' },
  { href: '/pnl', label: '📗 أرباح وخسائر', title: 'كشف الأرباح والخسائر الشهري', roles: ['admin', 'accountant'], group: 'التقارير' },
  { href: '/accountant', label: '🧮 لوحة المحاسب', title: 'برنامج المحاسب', roles: ['admin', 'accountant'], group: 'التقارير' },
  { href: '/pricelist', label: '📃 قائمة أسعار', title: 'قائمة أسعار الجملة للطباعة والواتساب', roles: ['admin', 'accountant'], group: 'التقارير' },

  // — أدوات —
  { href: '/inquiry', label: '📱 استعلام أسعار', title: 'استعلام أسعار', roles: ['admin', 'cashier', 'accountant'], group: 'إعدادات وأدوات' },
  { href: '/whatsapp', label: '💬 واتساب', title: 'واتساب', roles: ['admin'], perm: 'cashierWhatsapp', group: 'إعدادات وأدوات' },
  { href: '/audit', label: '📜 سجل العمليات', title: 'سجل العمليات', roles: ['admin', 'accountant'], group: 'إعدادات وأدوات' },
  { href: '/settings', label: '⚙️ الإعدادات', title: 'الإعدادات', roles: ['admin'], group: 'إعدادات وأدوات' },
  { href: '/admin', label: '👑 لوحة الأدمن', title: 'لوحة الأدمن', roles: ['admin'], group: 'إعدادات وأدوات' },
];
const NAV_GROUPS = ['الشغل اليومي', 'المخزون', 'العملاء', 'التقارير', 'إعدادات وأدوات'];

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
  const [menuOpen, setMenuOpen] = useState(false); // درج القايمة على الموبايل
  const [storeNew, setStoreNew] = useState(0); // عدد طلبات المتجر الجديدة (بادج + صوت)
  const prevStoreNew = useRef(-1);
  const lastBeat = useRef(Date.now());

  const bare =
    pathname.startsWith('/inv/') ||
    pathname.startsWith('/print/') ||
    pathname.startsWith('/order/print/') ||
    pathname === '/login' ||
    pathname === '/inquiry' ||
    pathname === '/catalog' ||
    pathname === '/store';

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

  // صوت تنبيه قصير لطلب متجر جديد
  function orderBeep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [880, 1180].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
        o.start(t0); o.stop(t0 + 0.17);
      });
    } catch {}
  }

  // متابعة طلبات المتجر الجديدة: بادج + صوت لما يجي طلب جديد
  async function refreshStoreOrders() {
    if (!cloudEnabled()) return;
    try {
      const orders = await fetchStoreOrders();
      const nw = orders.filter((o) => !o.status || o.status === 'جديد').length;
      setStoreNew(nw);
      if (prevStoreNew.current >= 0 && nw > prevStoreNew.current) orderBeep(); // طلب جديد وصل
      prevStoreNew.current = nw;
    } catch {}
  }

  // التهيئة الثقيلة (تحميل الأصناف + المزامنة) مرة واحدة بس عند فتح البرنامج — مش مع كل تنقل
  useEffect(() => {
    if (bare) return;
    (async () => {
      await seedIfEmpty();
      syncPull();
      ensureFullPush();
    })();
    runDailyBackup();
    refreshStoreOrders();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const t = setInterval(() => {
      flushPending();
      syncPull(); // مزامنة دورية احتياطية (الأساسي هو Realtime)
      maybeSendDailyReport();
      maybeSendDebtReminders();
      refreshStoreOrders();
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
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        clearTimeout(timer);
        timer = setTimeout(() => syncPull(), 4000);
        if (payload?.table === 'store_orders') refreshStoreOrders(); // طلب متجر جديد → بادج + صوت فوراً
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

      {/* خلفية سودا لما القايمة تكون مفتوحة على الموبايل — الضغط عليها بيقفلها */}
      {menuOpen && <div className="menu-backdrop no-print" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar no-print${menuOpen ? ' open' : ''}`}>
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
          {NAV_GROUPS.map((g) => {
            const items = visibleNav.filter((n) => n.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="nav-group">{g}</div>
                {items.map((n) => (
                  <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''} onClick={() => setMenuOpen(false)}>
                    <span>{n.label}</span>
                    {n.href === '/lowstock' && lowCount > 0 && (
                      <span className="nav-badge">{lowCount}</span>
                    )}
                    {n.href === '/store-orders' && storeNew > 0 && (
                      <span className="nav-badge">{storeNew}</span>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="foot">
          {cloud ? '☁️ متزامن لحظياً مع السحابة' : '💾 تخزين محلي (فعّل السحابة من الإعدادات)'}
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="menu-btn" title="القايمة" onClick={() => setMenuOpen(true)}>☰</button>
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
