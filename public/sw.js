// Service Worker لنظام كاشير السقا — شغل كامل بدون إنترنت
// استراتيجية: الملفات الثابتة (chunks/صور/خطوط) من الكاش أولاً (أسرع + مضمونة أوف لاين)
// الصفحات: الشبكة أولاً وحفظ نسخة، ولو النت قاطع نرجع للنسخة المحفوظة
const CACHE = 'saqqa-pos-v5';

// كل صفحات البرنامج بتتخزّن مقدماً أول تشغيل أونلاين — عشان تشتغل أوف لاين حتى لو معدّتش عليها
const ROUTES = [
  '/', '/pos', '/login', '/invoices', '/products', '/customers', '/payments',
  '/reps', '/expenses', '/returns', '/purchases', '/order', '/statement',
  '/stocktake', '/dayclose', '/audit', '/barcodes', '/reports', '/whatsapp',
  '/settings', '/admin', '/accountant', '/inquiry', '/item', '/quotes',
  '/logo.jpg', '/icon-192.png', '/icon-512.png', '/manifest.json', '/rep-manifest.json',
];

// صفحة المندوب: بتتفتح من الكاش على طول (أسرع + شغالة من غير نت)
// والتحديث بيتسحب ورا الكواليس ويستنى لفتحة الشعب الجاية
const REP_ROUTES = ['/inquiry'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // نخزّن كل صفحة لوحدها — لو صفحة فشلت منوقفش الباقي
      Promise.all(ROUTES.map((u) => cache.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.host === 'fonts.googleapis.com' ||
  url.host === 'fonts.gstatic.com' ||
  /\.(js|css|png|jpg|jpeg|svg|woff2?|ico)$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // الملفات الثابتة (بأسماء فيها hash فمبتتغيّرش): من الكاش أولاً — أسرع ومضمونة أوف لاين
  if (isStatic(url)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        try {
          const res = await fetch(e.request);
          if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return; // مانتدخلش في Supabase أو بوابة الواتساب

  // صفحة المندوب: الكاش الأول عشان تفتح فوراً حتى والنت ضعيف، والتحديث ورا الكواليس
  if (REP_ROUTES.includes(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(url.pathname);
        const net = fetch(e.request)
          .then((res) => { if (res.ok) cache.put(url.pathname, res.clone()); return res; })
          .catch(() => null);
        return hit || (await net) || new Response('غير متصل بالإنترنت', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
    );
    return;
  }

  // الصفحات: الشبكة أولاً (عشان أحدث نسخة) ولو النت قاطع نرجع للمخزّن
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        const hit = await cache.match(e.request) || await cache.match(url.pathname);
        if (hit) return hit;
        if (e.request.mode === 'navigate') {
          // أي صفحة اتفتحت أوف لاين ومش متخزّنة → نرجّع أقرب صفحة مخزّنة
          const shell = (await cache.match('/pos')) || (await cache.match('/')) || (await cache.match('/login'))
            || (await cache.match('/inquiry'));
          if (shell) return shell;
        }
        return new Response('غير متصل بالإنترنت', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })
  );
});

// الصفحة بتبعت لنا لستة الملفات اللي حمّلتها فعلاً (chunks وخطوط) عشان نخزّنها
// — من غير كده أول فتحة أوف لاين بتلاقي الصفحة متخزنة بس ملفاتها لأ
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'warm' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(e.data.urls.map((u) => cache.match(u).then((hit) => (hit ? null : cache.add(u).catch(() => {})))))
    )
  );
});
