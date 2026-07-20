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

// نص طلب البضاعة اللي بيتبعت للمورد واتساب — أصناف وكميات بس، من غير أي أسعار
export function buildOrderText(order, settings) {
  const lines = [
    `📋 *طلب بضاعة رقم ${order.number}* — ${settings.companyName}`,
    `التاريخ: ${new Date(order.date || Date.now()).toLocaleDateString('ar-EG')}`,
    '',
  ];
  (order.items || []).forEach((it, i) => {
    lines.push(`${i + 1}) ${it.name} — الكمية: ${it.qty}${it.note ? ` (${it.note})` : ''}`);
  });
  lines.push('', `إجمالي الأصناف: ${(order.items || []).length}`);
  if (order.notes) lines.push(`ملاحظات: ${order.notes}`);
  lines.push('', 'وشكراً لتعاونكم 🙏');
  return lines.join('\n');
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

// ============ إشعارات وتقارير الأدمن التلقائية ============
import {
  getSettings,
  listInvoices,
  listPayments,
  listExpenses,
  listCustomers,
  customerDebt,
} from './db';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// إشعار فوري للأدمن على واتسابه (فاتورة كبيرة، حذف فاتورة، عجز يومية...)
export async function notifyAdmin(text) {
  try {
    const s = getSettings();
    if (!s.alerts?.enabled || !s.alerts?.adminPhone || !s.wa?.gatewayUrl) return;
    await gatewaySend(s.wa, s.alerts.adminPhone, `🔔 ${s.companyName}\n${text}`);
  } catch {
    // مش هنوقف الشغل عشان إشعار
  }
}

export function buildDailyReportText(s) {
  const today = dayKey(new Date().toISOString());
  const invs = listInvoices().filter((i) => dayKey(i.date) === today);
  const sales = invs.filter((i) => i.type !== 'مرتجع');
  const returns = invs.filter((i) => i.type === 'مرتجع');
  const pays = listPayments().filter((p) => dayKey(p.date) === today);
  const exps = listExpenses().filter((x) => dayKey(x.date) === today);
  const totalSales = sales.reduce((x, i) => x + (i.totals?.net || 0), 0);
  const totalReturns = returns.reduce((x, i) => x + (i.totals?.net || 0), 0);
  const collectedInv = sales.reduce((x, i) => x + (i.totals?.paid || 0), 0);
  const collectedPay = pays.reduce((x, p) => x + (Number(p.amount) || 0), 0);
  const totalExp = exps.reduce((x, e) => x + (Number(e.amount) || 0), 0);
  const outWithReps = listInvoices()
    .filter((i) => i.rep && (i.totals?.remaining || 0) > 0)
    .reduce((x, i) => x + i.totals.remaining, 0);
  const totalDebt = listInvoices()
    .filter((i) => i.type !== 'مرتجع')
    .reduce((x, i) => x + Math.max(0, i.totals?.remaining || 0), 0);
  const c = s.currency;
  return (
    `📊 تقرير يوم ${today} — ${s.companyName}\n` +
    `━━━━━━━━━━━━━━\n` +
    `🧾 المبيعات: ${fmtMoney(totalSales)} ${c} (${sales.length} فاتورة)\n` +
    (totalReturns ? `↩️ المرتجعات: ${fmtMoney(totalReturns)} ${c}\n` : '') +
    `💵 المحصل من الفواتير: ${fmtMoney(collectedInv)} ${c}\n` +
    `💵 المحصل من السندات: ${fmtMoney(collectedPay)} ${c}\n` +
    `💸 المصاريف: ${fmtMoney(totalExp)} ${c}\n` +
    `🧮 صافي الدرج المتوقع: ${fmtMoney(collectedInv + collectedPay - totalExp)} ${c}\n` +
    `🛵 فلوس برة مع المندوبين: ${fmtMoney(outWithReps)} ${c}\n` +
    `📕 إجمالي مديونيات العملاء: ${fmtMoney(totalDebt)} ${c}`
  );
}

// بيتنادوا كل دقيقة من الشاشة الرئيسية — بيبعتوا مرة واحدة بس في معادهم
export async function maybeSendDailyReport() {
  try {
    const s = getSettings();
    const cfg = s.dailyReport || {};
    if (!cfg.enabled || !s.alerts?.adminPhone || !s.wa?.gatewayUrl) return;
    const now = new Date();
    if (now.getHours() < (Number(cfg.hour) || 21)) return;
    const marker = 'saqqa_daily_report_sent';
    if (localStorage.getItem(marker) === now.toDateString()) return;
    const st = await gatewayStatus(s.wa);
    if (!st.available || !st.connected) return;
    await gatewaySend(s.wa, s.alerts.adminPhone, buildDailyReportText(s));
    localStorage.setItem(marker, now.toDateString());
  } catch {}
}

export async function maybeSendDebtReminders() {
  try {
    const s = getSettings();
    const cfg = s.debtReminder || {};
    if (!cfg.enabled || !s.wa?.gatewayUrl) return;
    const now = new Date();
    if (now.getDay() !== Number(cfg.weekday)) return;
    if (now.getHours() < 11) return; // مش بدري الصبح
    const marker = 'saqqa_debt_reminder_sent';
    if (localStorage.getItem(marker) === now.toDateString()) return;
    const st = await gatewayStatus(s.wa);
    if (!st.available || !st.connected) return;
    localStorage.setItem(marker, now.toDateString()); // قبل الإرسال عشان مايتكررش
    for (const c of listCustomers()) {
      if (!c.phone) continue;
      const debt = customerDebt(c.name);
      if (debt <= 0) continue;
      const msg = buildMessage(cfg.template, {
        name: c.name,
        total: debt,
        currency: s.currency,
        company: s.companyName,
      }).replaceAll('{debt}', fmtMoney(debt));
      await gatewaySend(s.wa, c.phone, msg); // بتدخل طابور البوابة بالتأخير الآمن
    }
  } catch {}
}
