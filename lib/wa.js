// إرسال رسائل واتساب: عبر بوابة الواتساب (Baileys) أو رابط wa.me الآمن 100%
import { normalizePhone, fmtMoney } from './format';
import { cloudLinkHash } from './db';

export function buildMessage(template, ctx) {
  return (template || '')
    .replaceAll('{name}', ctx.name || 'عميلنا العزيز')
    .replaceAll('{number}', String(ctx.number ?? ''))
    .replaceAll('{total}', fmtMoney(ctx.total ?? 0))
    .replaceAll('{currency}', ctx.currency || 'ج.م')
    .replaceAll('{link}', ctx.link || '')
    .replaceAll('{company}', ctx.company || 'السقا للأدوات المنزلية')
    .trim();
}

export function invoiceLink(settings, invoiceId) {
  const base =
    settings.publicBaseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  // لو السحابة متظبطة من جوه البرنامج، بنضمّن الإعداد في الرابط
  // عشان الفاتورة تفتح من موبايل العميل مباشرة
  return `${base}/inv/${invoiceId}${cloudLinkHash()}`;
}

// رابط wa.me — بيفتح واتساب العادي على الجهاز، مفيش أي خطر حظر
export function waMeLink(phone, message) {
  const p = normalizePhone(phone);
  if (!p) return '';
  return `https://wa.me/${p}?text=${encodeURIComponent(message || '')}`;
}

async function gatewayFetch(cfg, path, options = {}) {
  const url = (cfg.gatewayUrl || '').replace(/\/$/, '') + path;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Gateway error ${res.status}`);
  return res.json();
}

export async function gatewayStatus(cfg) {
  if (!cfg.gatewayUrl) return { available: false };
  try {
    const data = await gatewayFetch(cfg, '/status');
    return { available: true, ...data };
  } catch {
    return { available: false };
  }
}

export async function gatewayQr(cfg) {
  return gatewayFetch(cfg, '/qr');
}

// الإرسال بيتحط في طابور على البوابة وبيتبعت بتأخير عشوائي (حماية من الحظر)
export async function gatewaySend(cfg, phone, message) {
  const p = normalizePhone(phone);
  if (!p) throw new Error('رقم الهاتف غير صحيح');
  return gatewayFetch(cfg, '/send', {
    method: 'POST',
    body: JSON.stringify({ phone: p, message }),
  });
}

export async function gatewayLogout(cfg) {
  return gatewayFetch(cfg, '/logout', { method: 'POST' });
}
