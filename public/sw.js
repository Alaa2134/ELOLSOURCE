// Service Worker لنظام كاشير السقا — شغل بدون إنترنت
// استراتيجية: الشبكة أولاً وحفظ نسخة، ولو النت قاطع نرجع للنسخة المحفوظة
const CACHE = 'saqqa-pos-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // الخطوط: من الكاش فوراً بعد أول مرة — تحميل أسرع بكتير
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return; // مانتدخلش في Supabase أو بوابة الواتساب

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        if (e.request.mode === 'navigate') {
          const shell = (await cache.match('/pos')) || (await cache.match('/'));
          if (shell) return shell;
        }
        return new Response('غير متصل بالإنترنت', { status: 503 });
      }
    })
  );
});
