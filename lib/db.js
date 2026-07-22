// طبقة البيانات: تخزين محلي فوري (يشتغل بدون إنترنت) + مزامنة سحابية مع Supabase عند توفرها
import { createClient } from '@supabase/supabase-js';
import { uid, todayISO } from './format';
import { CLOUD_DEFAULT, hasCloudDefault } from './cloudDefault';

const KEYS = {
  products: 'saqqa_products',
  customers: 'saqqa_customers',
  invoices: 'saqqa_invoices',
  payments: 'saqqa_payments',
  expenses: 'saqqa_expenses',
  suppliers: 'saqqa_suppliers',
  purchases: 'saqqa_purchases',
  stocktakes: 'saqqa_stocktakes',
  daycloses: 'saqqa_daycloses',
  audit: 'saqqa_audit',
  settings: 'saqqa_settings',
  pending: 'saqqa_pending_sync',
};

let sb = null;

// إعداد السحابة من جوه البرنامج (صفحة الإعدادات) — من غير متغيرات بيئة ولا Redeploy
export function getCloudConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('saqqa_sb_conf');
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.url && c.key ? c : null;
  } catch {
    return null;
  }
}

export function setCloudConfig(url, key) {
  if (typeof window === 'undefined') return;
  if (url && key) localStorage.setItem('saqqa_sb_conf', JSON.stringify({ url: url.trim(), key: key.trim() }));
  else localStorage.removeItem('saqqa_sb_conf');
  localStorage.removeItem('saqqa_full_push_done'); // إعداد جديد = رفعة شاملة جديدة
  sb = null; // إعادة إنشاء الاتصال بالبيانات الجديدة
  _anonAuthTried = false; // إعداد جديد = نسجّل دخول مجهول للاتصال الجديد
}

export function getSupabase() {
  if (sb) return sb;
  // الأولوية: env vars في Vercel ← الإعداد المدمج في الموقع ← إعداد الجهاز (المتصفح)
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || CLOUD_DEFAULT.url;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || CLOUD_DEFAULT.key;
  if (!url || !key) {
    const c = getCloudConfig();
    if (c) {
      url = c.url;
      key = c.key;
    }
  }
  if (url && key) {
    sb = createClient(url, key);
    ensureAnonAuth(sb); // كل جهاز بيسجّل دخول مجهول تلقائياً — عشان نقدر نشدّد حماية السحابة
  }
  return sb;
}

// تسجيل دخول مجهول (Anonymous) تلقائي وصامت — من غير أي شاشة لوجين.
// بيدّي كل جهاز جلسة (JWT) فنقدر نخلي سياسات السحابة تسمح للمسجّلين بس،
// وبكده المفتاح العام لوحده (من غير جلسة) مايبقاش كافي لقراءة/كتابة البيانات.
let _anonAuthTried = false;
function ensureAnonAuth(client) {
  if (_anonAuthTried || typeof window === 'undefined') return;
  _anonAuthTried = true;
  try {
    client.auth.getSession().then(({ data }) => {
      if (!data?.session) client.auth.signInAnonymously().catch(() => {});
    }).catch(() => {});
  } catch {}
}

// هل السحابة متاحة لكل زوار الموقع (مدمجة/env) — يبقى مش محتاجين نحط الإعداد في الروابط
export function cloudBuiltIn() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL || hasCloudDefault());
}

// إعداد السحابة مضمّن في رابط (QR الأدمن / روابط الفواتير) — بيظبط الجهاز الجديد تلقائياً
export function cloudConfigFromHash() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  if (!hash.startsWith('#c=')) return false;
  const clearHash = () => history.replaceState(null, '', window.location.pathname + window.location.search);
  // 🔒 أمان: لو الموقع فيه سحابة مدمجة، أي رابط مايقدرش يغيّرها —
  //    يمنع إن حد يبعت رابط خبيث يحوّل جهاز الكاشير/الأدمن لقاعدة بيانات غريبة
  if (cloudBuiltIn()) { clearHash(); return false; }
  try {
    const [url, key] = JSON.parse(atob(hash.slice(3)));
    if (!url || !key) { clearHash(); return false; }
    // 🔒 أمان: لازم يكون URL بتاع Supabase فعلاً (https + نطاق supabase)
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)\/?$/i.test(String(url).trim())) { clearHash(); return false; }
    // 🔒 أمان: مانغيّرش إعداد جهاز متظبط قبل كده لقاعدة مختلفة من مجرد رابط
    const existing = getCloudConfig();
    if (existing && existing.url && existing.url !== url) { clearHash(); return false; }
    setCloudConfig(url, key);
    clearHash();
    return true;
  } catch { clearHash(); return false; }
}

export function cloudLinkHash() {
  // السحابة مدمجة في الموقع (env أو ملف)؟ يبقى الرابط ينضف — والـ QR يبقى أصغر وأسهل مسح
  if (cloudBuiltIn()) return '';
  const c = getCloudConfig();
  if (!c) return '';
  return '#c=' + btoa(JSON.stringify([c.url, c.key]));
}

export function cloudEnabled() {
  return !!getSupabase();
}

// ---------- تخزين محلي ----------
function loadLocal(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- المزامنة السحابية ----------
function queuePush(table, type, payload) {
  const pending = loadLocal(KEYS.pending, []);
  pending.push({ table, type, payload, at: todayISO() });
  saveLocal(KEYS.pending, pending);
  flushPending();
}

let flushing = false;
export async function flushPending() {
  const client = getSupabase();
  if (!client || flushing) return;
  flushing = true;
  try {
    let pending = loadLocal(KEYS.pending, []);
    while (pending.length) {
      const op = pending[0];
      let error = null;
      if (op.type === 'upsert') {
        ({ error } = await client.from(op.table).upsert({
          id: op.payload.id,
          data: op.payload,
          updated_at: op.payload.updated_at || todayISO(),
        }));
      } else if (op.type === 'delete') {
        ({ error } = await client.from(op.table).delete().eq('id', op.payload.id));
      }
      if (error) break; // نحاول تاني في المرة الجاية
      pending.shift();
      saveLocal(KEYS.pending, pending);
    }
  } catch {
    // مفيش إنترنت — هنحاول لاحقاً
  } finally {
    flushing = false;
  }
}

// رفع كل البيانات الموجودة للسحابة دفعة واحدة — أول ما السحابة تتفعل
// (البيانات اللي اتسجلت قبل التفعيل مش بتكون في طابور المزامنة، فلازم رفعة شاملة)
let pushingAll = false;
export async function pushAllToCloud() {
  const client = getSupabase();
  if (!client || pushingAll) return { ok: false, count: 0 };
  pushingAll = true;
  let count = 0;
  try {
    const tables = {
      products: loadLocal(KEYS.products, []),
      customers: loadLocal(KEYS.customers, []),
      invoices: loadLocal(KEYS.invoices, []),
      payments: loadLocal(KEYS.payments, []),
      expenses: loadLocal(KEYS.expenses, []),
      suppliers: loadLocal(KEYS.suppliers, []),
      purchases: loadLocal(KEYS.purchases, []),
      stocktakes: loadLocal(KEYS.stocktakes, []),
      daycloses: loadLocal(KEYS.daycloses, []),
      audit: loadLocal(KEYS.audit, []),
    };
    for (const [table, list] of Object.entries(tables)) {
      const rows = list
        .filter((r) => r && r.id)
        .map((r) => ({ id: r.id, data: r, updated_at: r.updated_at || todayISO() }));
      for (let i = 0; i < rows.length; i += 400) {
        const { error } = await client.from(table).upsert(rows.slice(i, i + 400));
        if (error) throw new Error(`${table}: ${error.message}`);
        count += Math.min(400, rows.length - i);
      }
    }
    const s = getSettings();
    await client.from('settings').upsert({ id: 'main', data: stripSecrets(s), updated_at: s.updated_at || todayISO() });
    localStorage.setItem('saqqa_full_push_done', '1');
    return { ok: true, count };
  } catch (e) {
    return { ok: false, count, error: e.message };
  } finally {
    pushingAll = false;
  }
}

// بتتنادى مع فتح البرنامج: لو السحابة اتفعلت ولسه معملناش الرفعة الشاملة — نعملها
export async function ensureFullPush() {
  if (typeof window === 'undefined') return;
  if (!getSupabase()) return;
  if (localStorage.getItem('saqqa_full_push_done') === '1') return;
  await pushAllToCloud();
}

// سحب البيانات من السحابة ودمجها مع المحلي (الأحدث يكسب)
export async function syncPull() {
  const client = getSupabase();
  if (!client) return false;
  try {
    for (const table of ['products', 'customers', 'invoices', 'payments', 'expenses', 'suppliers', 'purchases', 'stocktakes', 'daycloses', 'audit']) {
      // تزامن تزايدي: بنسحب بس اللي اتغير من آخر مرة (أسرع بكتير) — وبصفحات
      // عشان جدول أكبر من 1000 صف يوصل كامل (Supabase بيقطع عند 1000)
      const markerKey = 'saqqa_sync_' + table;
      const marker = (typeof window !== 'undefined' && localStorage.getItem(markerKey)) || '';
      const rows = [];
      let failed = false;
      for (let from = 0; ; from += 1000) {
        let qy = client.from(table).select('id,data,updated_at').order('updated_at', { ascending: true }).range(from, from + 999);
        if (marker) qy = qy.gt('updated_at', marker);
        const { data, error } = await qy;
        if (error) { failed = true; break; }
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      if (failed || !rows.length) continue;
      const local = loadLocal(KEYS[table], []);
      const byId = new Map(local.map((r) => [r.id, r]));
      let maxU = marker;
      for (const row of rows) {
        const remote = { ...row.data, id: row.id };
        const mine = byId.get(row.id);
        if (!mine || (remote.updated_at || '') > (mine.updated_at || '')) byId.set(row.id, remote);
        if (String(row.updated_at || '') > maxU) maxU = String(row.updated_at);
      }
      saveLocal(KEYS[table], [...byId.values()]);
      if (typeof window !== 'undefined' && maxU) localStorage.setItem(markerKey, maxU);
    }
    const { data: st } = await client.from('settings').select('data').eq('id', 'main').maybeSingle();
    if (st && st.data) {
      const local = loadLocal(KEYS.settings, null);
      if (!local || (st.data.updated_at || '') > (local.updated_at || '')) {
        saveLocal(KEYS.settings, mergeCloudSettings(st.data)); // كلمات السر المحلية بتفضل زي ما هي
      }
    }
    applyProductsWipe();
    await flushPending();
    return true;
  } catch {
    return false;
  }
}

// مهلة زمنية لأي وعد — عشان أي عملية سحابة متعلّقش البرنامج لو النت وحش
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + (label || ''))), ms)),
  ]);
}

// إعادة ربط الجهاز بالسحابة من الصفر — آمن تماماً:
// 1) بيرفع أي شغل محلي لسه متبعتش  2) بيسحب كل حاجة من السحابة الأول
// 3) وبعد ما السحب ينجح بس بيستبدل النسخة المحلية — لو فشل مبيمسحش أي حاجة
// زرار واحد يخلي أي جهاز مطابق للسحابة 100% ويحل أي لخبطة قديمة
export async function resetFromCloud() {
  const client = getSupabase();
  if (!client) return { ok: false, reason: 'مفيش اتصال بالسحابة — اتأكد من النت' };
  const tables = ['products', 'customers', 'invoices', 'payments', 'expenses', 'suppliers', 'purchases', 'stocktakes', 'daycloses', 'audit'];
  try {
    // (1) نرفع الشغل المحلي الأول عشان ميضيعش
    await withTimeout(flushPending(), 12000, 'flush').catch(() => {});
    const left = loadLocal(KEYS.pending, []).length;
    if (left > 0) {
      return { ok: false, reason: `فيه ${left} عملية محلية لسه متبعتتش للسحابة — استنى النت يرجع وحاول تاني (عشان شغلك ميضيعش)` };
    }
    // (2) نسحب كل الجداول لنسخة مؤقتة — من غير ما نلمس المحلي لسه
    //     مهلة واحدة إجمالية على السحب كله (25ث): لو النت مقطوع بيرجع بسرعة بدل ما يعلّق
    //     ولو جدول واحد فيه خطأ سريع (مش موجود مثلاً) بنعديه ونسيب نسخته المحلية
    const fresh = {};
    await withTimeout(
      (async () => {
        for (const t of tables) {
          try {
            const rows = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await client.from(t).select('id,data,updated_at').range(from, from + 999);
              if (error) throw new Error(t);
              rows.push(...(data || []));
              if (!data || data.length < 1000) break;
            }
            fresh[t] = rows.map((r) => ({ ...r.data, id: r.id }));
          } catch {
            /* جدول اتعدى — نسيب نسخته المحلية زي ما هي */
          }
        }
      })(),
      25000,
      'pull'
    );
    // لازم على الأقل الأصناف تنجح — دي القلب
    if (!fresh.products) throw new Error('products');
    const stRes = await withTimeout(client.from('settings').select('data').eq('id', 'main').maybeSingle(), 8000, 'settings').catch(() => null);
    // (3) نجح السحب — دلوقتي بس نستبدل المحلي (الجداول اللي اتعدت بتفضل زي ما هي)
    for (const t of tables) {
      if (!fresh[t]) continue;
      localStorage.removeItem('saqqa_sync_' + t);
      saveLocal(KEYS[t], t === 'products' ? dedupByCode(fresh[t]) : fresh[t]);
    }
    if (stRes?.data?.data) saveLocal(KEYS.settings, mergeCloudSettings(stRes.data.data));
    localStorage.setItem('saqqa_slash_fix', '3');
    localStorage.setItem('saqqa_seed_v', '999');
    localStorage.setItem('saqqa_full_push_done', '1');
    logAudit('إعادة ربط', 'الجهاز اتربط بالسحابة من جديد وسحب كل البيانات نضيفة');
    return { ok: true, counts: { products: loadLocal(KEYS.products, []).length, invoices: loadLocal(KEYS.invoices, []).length } };
  } catch (e) {
    const t = String(e?.message || '').startsWith('timeout')
      ? 'النت بطيء أو مقطوع — مفيش أي حاجة اتمسحت، جرب تاني لما النت يبقى أحسن'
      : 'فشل السحب من السحابة — مفيش أي حاجة اتمسحت، جرب تاني';
    return { ok: false, reason: t };
  }
}

// ---------- الإعدادات ----------
export const DEFAULT_SETTINGS = {
  companyName: 'السقا للأدوات المنزلية',
  docTitle: 'بيان أسعار',
  logoText: 'A',
  phones: 'أ/ صابر  ت/01001098968      أ/ محمد  ت/01062253291',
  address: '',
  currency: 'ج.م',
  pin: '7974',
  adminPassword: 'saber123456@',
  accountantPassword: '3333',
  inquiryPassword: '261179',
  cashiers: [], // كاشيرين بأسماء: [{ id, name, pin }] — الأدمن بيضيفهم ويحذفهم
  requireNamedCashier: false, // لو true: مفيش دخول بكلمة الكاشير العامة، لازم كاشير باسمه
  printerName: '',
  backupUrl: '',
  // إشعارات وتقارير الواتساب التلقائية للأدمن
  alerts: {
    enabled: false,
    adminPhone: '', // رقم واتساب الأدمن
    bigInvoice: 5000, // إشعار لو فاتورة أكبر من كده
  },
  dailyReport: { enabled: false, hour: 21 }, // تقرير آخر اليوم
  debtReminder: {
    enabled: false,
    weekday: 4, // الخميس
    template: 'أهلاً {name} 🌹\nتحية طيبة من {company}.\nنذكر حضرتكم بأن المتبقي من حسابكم: {debt} {currency}.\nنتشرف بزيارتكم وشكراً لتعاملكم معنا 🙏',
  },
  perms: {
    allowPriceEdit: true, // الكاشير يعدل السعر في الفاتورة
    allowDiscount: true, // الكاشير يعمل خصومات
    allowDeleteInvoice: false, // الكاشير يحذف فواتير
    cashierReports: false, // الكاشير يشوف التقارير والمبيعات
    cashierWhatsapp: false, // الكاشير يدخل صفحة الواتساب
    showStockInquiry: false, // إظهار المخزون في صفحة الاستعلام
  },
  invoiceStart: 9082,
  arabicDigits: true,
  lowStock: 5,
  publicBaseUrl: '',
  suggestSort: 'ذكي', // ترتيب اقتراحات الأصناف: ذكي / أبجدي / بالكود
  // تخصيص شكل فاتورة البيع (بيتظبط من لوحة الأدمن)
  invoice: {
    showLogo: true,
    logoSize: 'وسط', // صغير / وسط / كبير
    showQr: true,
    showTime: true,
    showCustomerNo: true,
    showAddressRow: true,
    colCode: true, // عمود رقم الصنف
    colNotes: true, // عمود الملاحظات
    fontSize: 'وسط', // صغير / وسط / كبير
    footerText: '', // سطر حر أسفل الفاتورة (سياسة الاستبدال مثلاً)
    showPageNo: true,
    rowsPerPage: 22,
    // خانات إضافية بيحددها الأدمن تظهر في جدول بيانات الفاتورة (مثلاً: سجل تجاري)
    customFields: [],
  },
  logoImage: '', // لوجو مخصص بيرفعه الأدمن (لو فاضي بيستخدم لوجو ALSAKA)
  wa: {
    gatewayUrl: '',
    token: '',
    autoSend: false,
    sendInvoiceLink: true,
    thanksTemplate:
      'أهلاً {name} 🌹\nشكراً لتعاملكم مع السقا للأدوات المنزلية.\nفاتورتكم رقم {number} بإجمالي {total} {currency}.\n{link}\nنتشرف بزيارتكم دائماً 🙏',
  },
  updated_at: '',
};

// كلمات السر الحساسة: بتفضل محلية على كل جهاز ومبترفعش للسحابة (أمان إضافي)
// عشان لو حد وصل لمفتاح السحابة ميقدرش يقرا كلمة سر الأدمن/المحاسب
const SECRET_KEYS = ['adminPassword', 'accountantPassword', 'pin', 'inquiryPassword'];

// نسخة الإعدادات اللي بتترفع للسحابة — من غير كلمات السر ولا توكن بوابة الواتساب
function stripSecrets(s) {
  const out = { ...s };
  for (const k of SECRET_KEYS) delete out[k];
  if (out.wa) out.wa = { ...out.wa, token: '' }; // توكن البوابة يفضل محلي — مايترفعش لصف مقروء للكل
  return out;
}

// دمج إعدادات السحابة مع الحفاظ على كلمات السر (وتوكن البوابة) المحلية — متجيش من السحابة أبداً
function mergeCloudSettings(cloud) {
  const local = loadLocal(KEYS.settings, null) || {};
  const kept = {};
  for (const k of SECRET_KEYS) if (local[k] !== undefined) kept[k] = local[k];
  const merged = { ...DEFAULT_SETTINGS, ...cloud, ...kept };
  // توكن البوابة المحلي بيفضل زي ما هو (السحابة بتيجي فاضية منه)
  if (local.wa?.token) merged.wa = { ...merged.wa, token: local.wa.token };
  return merged;
}

export function getSettings() {
  const s = loadLocal(KEYS.settings, null);
  if (!s) return { ...DEFAULT_SETTINGS };
  const merged = {
    ...DEFAULT_SETTINGS,
    ...s,
    wa: { ...DEFAULT_SETTINGS.wa, ...(s.wa || {}) },
    perms: { ...DEFAULT_SETTINGS.perms, ...(s.perms || {}) },
    alerts: { ...DEFAULT_SETTINGS.alerts, ...(s.alerts || {}) },
    dailyReport: { ...DEFAULT_SETTINGS.dailyReport, ...(s.dailyReport || {}) },
    debtReminder: { ...DEFAULT_SETTINGS.debtReminder, ...(s.debtReminder || {}) },
    invoice: { ...DEFAULT_SETTINGS.invoice, ...(s.invoice || {}) },
  };
  // ترحيل كلمة السر القديمة للاستعلام على الأجهزة اللي متخزن عليها إعدادات قديمة
  if (merged.inquiryPassword === '1111') merged.inquiryPassword = '261179';
  // بوابة الواتساب المدمجة في برامج الديسكتوب — إعداد جاهز تلقائياً
  if (!merged.wa.gatewayUrl) merged.wa.gatewayUrl = 'http://localhost:3900';
  if (!merged.wa.token) merged.wa.token = 'saqqa-secret';
  return merged;
}

export function getRole() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('saqqa_role') || '';
}

export function isAdmin() {
  return getRole() === 'admin';
}

// اسم الكاشير اللي داخل دلوقتي (بيتسجل على الفاتورة)
export function getCashierName() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('saqqa_cashier_name') || '';
}

// ---------- إدارة كاشيرين بأسماء (للأدمن) ----------
export function listCashiers() {
  return (getSettings().cashiers || []).filter((c) => c && c.name);
}

// إضافة/تعديل كاشير باسم وكلمة سر خاصة بيه
export function saveCashier({ id, name, pin }) {
  const s = getSettings();
  const list = [...(s.cashiers || [])];
  const clean = { id: id || uid(), name: String(name || '').trim(), pin: String(pin || '').trim() };
  if (!clean.name || !clean.pin) return { ok: false, reason: 'لازم اسم وكلمة سر' };
  // كلمة السر متبقاش متكررة مع أدمن/محاسب/كاشير عام أو كاشير تاني
  const clash =
    clean.pin === s.adminPassword || clean.pin === s.accountantPassword || clean.pin === s.pin ||
    list.some((c) => c.pin === clean.pin && c.id !== clean.id);
  if (clash) return { ok: false, reason: 'كلمة السر دي مستخدمة قبل كده — اختار غيرها' };
  const i = list.findIndex((c) => c.id === clean.id);
  if (i >= 0) list[i] = clean;
  else list.push(clean);
  saveSettings({ cashiers: list });
  logAudit('إدارة كاشير', `${i >= 0 ? 'تعديل' : 'إضافة'} كاشير: ${clean.name}`);
  return { ok: true };
}

export function deleteCashier(id) {
  const s = getSettings();
  const c = (s.cashiers || []).find((x) => x.id === id);
  saveSettings({ cashiers: (s.cashiers || []).filter((x) => x.id !== id) });
  if (c) logAudit('إدارة كاشير', `حذف كاشير: ${c.name}`);
}

// تسجيل الدخول: بيرجع الدور واسم الكاشير حسب كلمة السر المدخلة
export function resolveLogin(pin) {
  const s = getSettings();
  const p = String(pin || '').trim();
  if (p && p === s.adminPassword) return { role: 'admin', name: 'الأدمن' };
  if (p && p === s.accountantPassword) return { role: 'accountant', name: 'المحاسب' };
  const named = (s.cashiers || []).find((c) => c.pin && c.pin === p);
  if (named) return { role: 'cashier', name: named.name };
  // كلمة الكاشير العامة (لو مش مطلوب كاشير باسمه)
  if (!s.requireNamedCashier && p && p === s.pin) return { role: 'cashier', name: 'كاشير' };
  return null;
}

// النسخ الاحتياطي اليومي التلقائي على جوجل درايف العميل (عبر Apps Script)
// بيتبعت مرة واحدة في اليوم، والسكريبت بيحتفظ بآخر 7 نسخ فقط فمفيش استهلاك مساحة زيادة
export async function runDailyBackup() {
  if (typeof window === 'undefined') return;
  const s = getSettings();
  if (!s.backupUrl) return;
  const today = new Date().toDateString();
  if (localStorage.getItem('saqqa_last_backup') === today) return;
  try {
    await fetch(s.backupUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: exportBackup(),
    });
    localStorage.setItem('saqqa_last_backup', today);
  } catch {
    // هنحاول تاني في الفتحة الجاية
  }
}

// ---------- سجل العمليات (للأدمن) ----------
export function logAudit(action, details) {
  if (typeof window === 'undefined') return;
  const list = loadLocal(KEYS.audit, []);
  const row = {
    id: uid(),
    at: todayISO(),
    role: getRole() === 'admin' ? 'أدمن' : 'كاشير',
    action,
    details,
    updated_at: todayISO(),
  };
  list.push(row);
  if (list.length > 1500) list.splice(0, list.length - 1500);
  saveLocal(KEYS.audit, list);
  queuePush('audit', 'upsert', row);
}

export function listAudit() {
  return loadLocal(KEYS.audit, []).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

export function saveSettings(s) {
  const merged = { ...getSettings(), ...s, updated_at: todayISO() };
  logAudit('تعديل إعدادات', 'تم حفظ إعدادات النظام');
  saveLocal(KEYS.settings, merged);
  const client = getSupabase();
  if (client) {
    // بنرفع الإعدادات من غير كلمات السر (بتفضل محلية على كل جهاز)
    client.from('settings').upsert({ id: 'main', data: stripSecrets(merged), updated_at: merged.updated_at }).then(() => {});
  }
  return merged;
}

// ---------- الأصناف ----------
// إزالة تكرار الأصناف بنفس الكود (بيحصل لو اترفعت من أكتر من جهاز) — نبقي الأحدث
function dedupByCode(list) {
  const byCode = new Map();
  for (const p of list) {
    const k = String(p.code);
    const prev = byCode.get(k);
    if (!prev || (p.updated_at || '') > (prev.updated_at || '')) byCode.set(k, p);
  }
  return [...byCode.values()];
}

export function listProducts() {
  return dedupByCode(loadLocal(KEYS.products, []));
}

// تنظيف تكرار الأصناف من التخزين المحلي والسحابة (للأدمن) — بيرجع كام صنف اتشال
export async function cleanupDuplicateProducts() {
  const all = loadLocal(KEYS.products, []);
  const keep = dedupByCode(all);
  const keepIds = new Set(keep.map((p) => p.id));
  const removed = all.filter((p) => !keepIds.has(p.id));
  saveLocal(KEYS.products, keep);
  const client = getSupabase();
  if (client && removed.length) {
    const ids = removed.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      await client.from('products').delete().in('id', ids.slice(i, i + 200));
    }
  }
  if (removed.length) logAudit('تنظيف مكرر', `تم حذف ${removed.length} صنف مكرر`);
  return removed.length;
}

// استيراد مجمع سريع (لملفات PDF/إكسل الكبيرة) مع شريط تقدم "تم كذا من أصل كذا"
// الموجود (بالكود أو الاسم) بيتحدث سعره — الجديد بس اللي بيتضاف: مفيش تكرار أبداً
export async function bulkImportProducts(rows, onProgress) {
  const list = listProducts();
  const byCode = new Map(list.map((p) => [String(p.code).trim(), p]));
  const byName = new Map(list.map((p) => [nameMatchKey(p.name), p]));
  const now = todayISO();
  const touched = [];
  let added = 0;
  let updated = 0;
  let done = 0;
  let nextCode = list.reduce((m, p) => Math.max(m, Number(p.code) || 0), 0) + 1;
  for (const r of rows) {
    const code = String(r.code || '').trim();
    const existing = (code && byCode.get(code)) || byName.get(nameMatchKey(r.name)) || null;
    if (existing) {
      const upd = { ...existing, price: Number(r.price) || existing.price, updated_at: now };
      if (r.cost !== undefined && r.cost !== '') upd.cost = Number(r.cost) || existing.cost || 0;
      if (r.stock !== undefined && r.stock !== '') upd.stock = Number(r.stock) || 0;
      const i = list.findIndex((p) => p.id === existing.id);
      if (i >= 0) list[i] = upd;
      byCode.set(String(upd.code).trim(), upd);
      byName.set(nameMatchKey(upd.name), upd);
      touched.push(upd);
      updated++;
    } else {
      const row = {
        id: uid(),
        code: code || String(nextCode++),
        name: cleanProductName(r.name),
        price: Number(r.price) || 0,
        cost: Number(r.cost) || 0,
        stock: Number(r.stock) || 0,
        barcode: '',
        category: r.supplier || 'أدوات منزلية',
        updated_at: now,
      };
      list.push(row);
      byCode.set(String(row.code), row);
      byName.set(nameMatchKey(row.name), row);
      touched.push(row);
      added++;
    }
    done++;
    if (done % 50 === 0) {
      onProgress?.(done, rows.length);
      await new Promise((res) => setTimeout(res, 0)); // نسيب الشاشة تحدّث العداد
    }
  }
  saveLocal(KEYS.products, list);
  onProgress?.(rows.length, rows.length);
  // رفع دفعات كبيرة للسحابة — ولو النت واقع بيتحط في الطابور ويتبعت لما يرجع
  const client = getSupabase();
  const upRows = touched.map((p) => ({ id: p.id, data: p, updated_at: p.updated_at }));
  let pushed = false;
  if (client) {
    try {
      for (let i = 0; i < upRows.length; i += 400) {
        const { error } = await client.from('products').upsert(upRows.slice(i, i + 400));
        if (error) throw error;
      }
      pushed = true;
    } catch {}
  }
  if (!pushed) for (const p of touched) queuePush('products', 'upsert', p);
  logAudit('استيراد أصناف', `${added} صنف جديد و${updated} تحديث سعر`);
  return { added, updated };
}

// حذف كل الأصناف (زر الأدمن) — محلياً ومن السحابة، وبينتشر لكل الأجهزة عن طريق علامة في الإعدادات
export async function deleteAllProducts() {
  const n = loadLocal(KEYS.products, []).length;
  saveLocal(KEYS.products, []);
  const now = todayISO();
  if (typeof window !== 'undefined') {
    localStorage.setItem('saqqa_wipe_seen', now);
    localStorage.setItem('saqqa_seed_v', '999'); // متتحملش القائمة المدمجة تاني بعد الحذف
  }
  saveSettings({ productsWipedAt: now });
  const client = getSupabase();
  if (client) {
    try {
      const ids = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('products').select('id').range(from, from + 999);
        if (error || !data) break;
        ids.push(...data.map((r) => r.id));
        if (data.length < 1000) break;
      }
      for (let i = 0; i < ids.length; i += 300) {
        await client.from('products').delete().in('id', ids.slice(i, i + 300));
      }
    } catch {}
  }
  logAudit('حذف كل الأصناف', `تم حذف ${n} صنف بواسطة الأدمن`);
  return n;
}

// حذف مجموعة أصناف محددة مرة واحدة (أسرع بكتير من الحذف واحد واحد)
// لو المحدد هو كل الأصناف بيتحول تلقائياً لحذف الكل (اللي بينتشر لكل الأجهزة)
export async function deleteProductsBulk(ids) {
  const set = new Set(ids);
  const all = loadLocal(KEYS.products, []);
  const keep = all.filter((p) => !set.has(p.id));
  if (!keep.length && all.length) return deleteAllProducts();
  saveLocal(KEYS.products, keep);
  const arr = [...set];
  const client = getSupabase();
  let done = false;
  if (client) {
    try {
      for (let i = 0; i < arr.length; i += 300) {
        const { error } = await client.from('products').delete().in('id', arr.slice(i, i + 300));
        if (error) throw error;
      }
      done = true;
    } catch {}
  }
  if (!done) for (const id of arr) queuePush('products', 'delete', { id });
  logAudit('حذف أصناف', `تم حذف ${arr.length} صنف محدد`);
  return arr.length;
}

// لو الأدمن حذف كل الأصناف من جهاز — باقي الأجهزة بتمسح نسختها المحلية برضه أول ما تزامن
export function applyProductsWipe() {
  if (typeof window === 'undefined') return;
  const wipedAt = getSettings().productsWipedAt || '';
  if (!wipedAt) return;
  if (localStorage.getItem('saqqa_wipe_seen') === wipedAt) return;
  const list = loadLocal(KEYS.products, []).filter((p) => (p.updated_at || '') > wipedAt);
  saveLocal(KEYS.products, list);
  localStorage.setItem('saqqa_wipe_seen', wipedAt);
  localStorage.setItem('saqqa_seed_v', '999');
}

export function saveProduct(p) {
  const list = listProducts();
  const row = { ...p, id: p.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) {
    if (Number(list[i].price) !== Number(row.price)) {
      logAudit('تعديل سعر', `${row.name}: من ${list[i].price} إلى ${row.price}`);
    }
    list[i] = row;
  } else {
    list.push(row);
    logAudit('إضافة صنف', `${row.name} (كود ${row.code}) بسعر ${row.price}`);
  }
  saveLocal(KEYS.products, list);
  queuePush('products', 'upsert', row);
  return row;
}

export function deleteProduct(id) {
  const p = listProducts().find((x) => x.id === id);
  if (p) logAudit('حذف صنف', `${p.name} (كود ${p.code})`);
  saveLocal(KEYS.products, listProducts().filter((x) => x.id !== id));
  queuePush('products', 'delete', { id });
}

export function findProduct(codeOrBarcode) {
  const q = String(codeOrBarcode || '').trim();
  if (!q) return null;
  return listProducts().find((p) => String(p.code) === q || String(p.barcode || '') === q) || null;
}

export function adjustStock(code, delta) {
  const list = listProducts();
  const i = list.findIndex((p) => String(p.code) === String(code));
  if (i < 0) return;
  list[i] = { ...list[i], stock: (Number(list[i].stock) || 0) + delta, updated_at: todayISO() };
  saveLocal(KEYS.products, list);
  queuePush('products', 'upsert', list[i]);
}

// ---------- العملاء ----------
export function listCustomers() {
  return loadLocal(KEYS.customers, []);
}

export function saveCustomer(c) {
  const list = listCustomers();
  const row = { ...c, id: c.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.customers, list);
  queuePush('customers', 'upsert', row);
  return row;
}

export function deleteCustomer(id) {
  saveLocal(KEYS.customers, listCustomers().filter((x) => x.id !== id));
  queuePush('customers', 'delete', { id });
}

// استيراد عملاء مجمّع (من PDF/إكسل) — الموجود بيتحدّث مش بيتكرر
// المطابقة بالتليفون الأول، وبعدين بالاسم — مفيش تكرار
export async function bulkImportCustomers(rows, onProgress) {
  const list = listCustomers();
  const byPhone = new Map(list.filter((c) => c.phone).map((c) => [String(c.phone).replace(/[^0-9]/g, ''), c]));
  const byName = new Map(list.map((c) => [String(c.name || '').replace(/\s+/g, ''), c]));
  const now = todayISO();
  const touched = [];
  let added = 0, updated = 0, done = 0;
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) { done++; continue; }
    const phone = String(r.phone || '').replace(/[^0-9]/g, '');
    const existing = (phone && byPhone.get(phone)) || byName.get(name.replace(/\s+/g, '')) || null;
    if (existing) {
      const upd = { ...existing, updated_at: now };
      if (phone && !existing.phone) upd.phone = phone;
      if (r.address && !existing.address) upd.address = r.address;
      const i = list.findIndex((c) => c.id === existing.id);
      if (i >= 0) list[i] = upd;
      if (upd.phone) byPhone.set(upd.phone, upd);
      byName.set(name.replace(/\s+/g, ''), upd);
      touched.push(upd);
      updated++;
    } else {
      const row = {
        id: uid(),
        name,
        phone,
        address: r.address || '',
        openingBalance: Number(r.balance) || 0,
        priceType: 'قطاعي',
        updated_at: now,
      };
      list.push(row);
      if (phone) byPhone.set(phone, row);
      byName.set(name.replace(/\s+/g, ''), row);
      touched.push(row);
      added++;
    }
    done++;
    if (done % 50 === 0) { onProgress?.(done, rows.length); await new Promise((res) => setTimeout(res, 0)); }
  }
  saveLocal(KEYS.customers, list);
  onProgress?.(rows.length, rows.length);
  const client = getSupabase();
  let pushed = false;
  if (client) {
    try {
      const up = touched.map((c) => ({ id: c.id, data: c, updated_at: c.updated_at }));
      for (let i = 0; i < up.length; i += 400) {
        const { error } = await client.from('customers').upsert(up.slice(i, i + 400));
        if (error) throw error;
      }
      pushed = true;
    } catch {}
  }
  if (!pushed) for (const c of touched) queuePush('customers', 'upsert', c);
  logAudit('استيراد عملاء', `${added} عميل جديد و${updated} تحديث`);
  return { added, updated };
}

// ---------- الفواتير ----------
export function listInvoices() {
  return loadLocal(KEYS.invoices, []).sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function getInvoice(id) {
  return listInvoices().find((x) => x.id === id) || null;
}

export function nextInvoiceNumber() {
  const s = getSettings();
  const invoices = listInvoices();
  const maxNum = invoices.reduce((m, inv) => Math.max(m, Number(inv.number) || 0), 0);
  return Math.max(maxNum + 1, Number(s.invoiceStart) || 1);
}

export function saveInvoice(inv) {
  const list = loadLocal(KEYS.invoices, []);
  const row = { ...inv, id: inv.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((x) => x.id === row.id);
  const isNew = i < 0;
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.invoices, list);
  queuePush('invoices', 'upsert', row);
  // خصم المخزون عند إنشاء فاتورة جديدة (stockQty بتحسب العبوات: كرتونة = 12 قطعة مثلاً)
  if (isNew && row.type !== 'مرتجع') {
    for (const it of row.items || []) adjustStock(it.code, -(Number(it.stockQty ?? it.qty) || 0));
  }
  if (isNew && row.type === 'مرتجع') {
    for (const it of row.items || []) adjustStock(it.code, Number(it.stockQty ?? it.qty) || 0);
  }
  if (isNew) logAudit('فاتورة بيع', `فاتورة ${row.number} لـ ${row.customer?.name} بصافي ${row.totals?.net}`);
  return row;
}

// تعديل فاتورة محفوظة: بنرجّع مخزون الأصناف القديمة وبنخصم الجديدة (فرق التعديل بيتحسب صح)
export function updateInvoice(inv) {
  const old = getInvoice(inv.id);
  if (!old) return saveInvoice(inv);
  const oldSign = old.type === 'مرتجع' ? -1 : 1;
  for (const it of old.items || []) adjustStock(it.code, oldSign * (Number(it.stockQty ?? it.qty) || 0));
  const row = { ...old, ...inv, updated_at: todayISO() };
  const list = loadLocal(KEYS.invoices, []);
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.invoices, list);
  queuePush('invoices', 'upsert', row);
  const newSign = row.type === 'مرتجع' ? 1 : -1;
  for (const it of row.items || []) adjustStock(it.code, newSign * (Number(it.stockQty ?? it.qty) || 0));
  logAudit('تعديل فاتورة', `فاتورة ${row.number} لـ ${row.customer?.name} — الصافي بقى ${row.totals?.net}`);
  return row;
}

export function deleteInvoice(id) {
  const inv = getInvoice(id);
  if (inv && inv.type !== 'مرتجع') {
    for (const it of inv.items || []) adjustStock(it.code, Number(it.stockQty ?? it.qty) || 0);
  }
  if (inv) logAudit('حذف فاتورة', `فاتورة ${inv.number} لـ ${inv.customer?.name} بصافي ${inv.totals?.net}`);
  saveLocal(KEYS.invoices, loadLocal(KEYS.invoices, []).filter((x) => x.id !== id));
  queuePush('invoices', 'delete', { id });
}

// ---------- سندات القبض (تحصيل دفعات) ----------
export function listPayments() {
  return loadLocal(KEYS.payments, []).sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function getPayment(id) {
  return loadLocal(KEYS.payments, []).find((x) => x.id === id) || null;
}

export function nextPaymentNumber() {
  return loadLocal(KEYS.payments, []).reduce((m, p) => Math.max(m, Number(p.number) || 0), 0) + 1;
}

// حفظ سند قبض: المبلغ بيتوزع على أقدم الفواتير المفتوحة (الأقدم أولاً)
// لو فيه targetInvoiceId (تحصيل مندوب لفاتورة معينة) بتتسدد هي الأول
export function savePayment(p) {
  const invoices = loadLocal(KEYS.invoices, []);
  const open = invoices
    .filter((i) => i.customer?.name === p.customerName && (Number(i.totals?.remaining) || 0) > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (p.targetInvoiceId) {
    open.sort((a, b) => (a.id === p.targetInvoiceId ? -1 : b.id === p.targetInvoiceId ? 1 : 0));
  }
  let left = Number(p.amount) || 0;
  const applied = [];
  for (const inv of open) {
    if (left <= 0) break;
    const rem = Number(inv.totals.remaining) || 0;
    const take = Math.min(rem, left);
    inv.totals = { ...inv.totals, remaining: rem - take };
    inv.updated_at = todayISO();
    applied.push({ invoiceId: inv.id, invoiceNumber: inv.number, amount: take });
    queuePush('invoices', 'upsert', inv);
    left -= take;
  }
  saveLocal(KEYS.invoices, invoices);
  const row = { ...p, id: p.id || uid(), applied, updated_at: todayISO() };
  const list = loadLocal(KEYS.payments, []);
  list.push(row);
  saveLocal(KEYS.payments, list);
  queuePush('payments', 'upsert', row);
  logAudit('سند قبض', `سند ${row.number} من ${row.customerName} بمبلغ ${row.amount}`);
  return row;
}

// حذف سند (أدمن): بيرجع المبالغ اللي اتوزعت لنفس الفواتير
export function deletePayment(id) {
  const list = loadLocal(KEYS.payments, []);
  const p = list.find((x) => x.id === id);
  if (!p) return;
  const invoices = loadLocal(KEYS.invoices, []);
  for (const ap of p.applied || []) {
    const inv = invoices.find((i) => i.id === ap.invoiceId);
    if (inv) {
      inv.totals = { ...inv.totals, remaining: (Number(inv.totals?.remaining) || 0) + ap.amount };
      inv.updated_at = todayISO();
      queuePush('invoices', 'upsert', inv);
    }
  }
  saveLocal(KEYS.invoices, invoices);
  saveLocal(KEYS.payments, list.filter((x) => x.id !== id));
  queuePush('payments', 'delete', { id });
  logAudit('حذف سند قبض', `سند ${p.number} من ${p.customerName} بمبلغ ${p.amount}`);
}

// ---------- المصاريف اليومية (أكل، انتقالات، ...) ----------
export function listExpenses() {
  return loadLocal(KEYS.expenses, []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function saveExpense(x) {
  const list = loadLocal(KEYS.expenses, []);
  const row = { ...x, id: x.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((e) => e.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.expenses, list);
  queuePush('expenses', 'upsert', row);
  logAudit('مصروف', `${row.desc} — ${row.amount}${row.name ? ` (${row.name})` : ''}`);
  return row;
}

export function deleteExpense(id) {
  const x = loadLocal(KEYS.expenses, []).find((e) => e.id === id);
  if (x) logAudit('حذف مصروف', `${x.desc} — ${x.amount}`);
  saveLocal(KEYS.expenses, loadLocal(KEYS.expenses, []).filter((e) => e.id !== id));
  queuePush('expenses', 'delete', { id });
}

// أسماء المندوبين المستخدمة قبل كده (للاقتراح)
export function listReps() {
  const names = new Set();
  for (const inv of listInvoices()) if (inv.rep) names.add(inv.rep);
  return [...names];
}

// ---------- الموردين والمشتريات ----------
export function listSuppliers() {
  return loadLocal(KEYS.suppliers, []);
}

export function saveSupplier(sp) {
  const list = listSuppliers();
  const row = { ...sp, id: sp.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.suppliers, list);
  queuePush('suppliers', 'upsert', row);
  return row;
}

export function deleteSupplier(id) {
  const list = listSuppliers().filter((x) => x.id !== id);
  saveLocal(KEYS.suppliers, list);
  queuePush('suppliers', 'delete', { id });
}

// أسماء الموردين الحقيقية موجودة على كل صنف (خانة المورد = category)، مش في جدول الموردين لوحده.
// الدالة دي بتجمع كل أسماء الموردين من الأصناف + جدول الموردين مع رقم كل واحد وعدد أصنافه.
export function listAllSuppliers() {
  const table = listSuppliers();
  const phoneByName = new Map(table.map((s) => [String(s.name).trim(), s]));
  const countByName = new Map();
  for (const p of listProducts()) {
    const c = String(p.category || '').trim();
    if (!c || c === 'أدوات منزلية') continue;
    countByName.set(c, (countByName.get(c) || 0) + 1);
  }
  const names = new Set([...countByName.keys(), ...phoneByName.keys()]);
  return [...names]
    .map((name) => {
      const rec = phoneByName.get(name);
      return {
        id: rec?.id || 'cat:' + name, // 'cat:' = مورد جايّ من الأصناف لسه مالوش سجل هاتف
        name,
        phone: rec?.phone || '',
        count: countByName.get(name) || 0,
        hasRecord: !!rec,
      };
    })
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'ar'));
}

// تغيير اسم مورد: بيحدّث سجل الهاتف + كل الأصناف اللي اسم موردها القديم لحد الجديد
export function renameSupplier(oldName, newName, phone) {
  const on = String(oldName).trim(), nn = String(newName).trim();
  if (!nn) return 0;
  // 1) سجل الهاتف
  const table = listSuppliers();
  let rec = table.find((s) => String(s.name).trim() === on);
  if (rec) saveSupplier({ ...rec, name: nn, phone: phone ?? rec.phone });
  else saveSupplier({ name: nn, phone: phone || '' });
  // 2) كل الأصناف اللي موردها كان الاسم القديم
  if (on !== nn) {
    const all = loadLocal(KEYS.products, []);
    const now = todayISO();
    let n = 0;
    for (let i = 0; i < all.length; i++) {
      if (String(all[i].category || '').trim() === on) {
        all[i] = { ...all[i], category: nn, updated_at: now };
        queuePush('products', 'upsert', all[i]);
        n++;
      }
    }
    if (n) saveLocal(KEYS.products, all);
    return n;
  }
  return 0;
}

// تحديث رقم هاتف مورد بالاسم (من غير ما نغيّر الأصناف)
export function setSupplierPhone(name, phone) {
  const nm = String(name).trim();
  const table = listSuppliers();
  const rec = table.find((s) => String(s.name).trim() === nm);
  if (rec) saveSupplier({ ...rec, phone });
  else saveSupplier({ name: nm, phone });
}

// طلبات البضاعة (بدون أسعار) متخزنة مع المشتريات بعلامة kind='طلب' — فواتير الشراء الفعلية من غيرها
export function listPurchases() {
  return loadLocal(KEYS.purchases, [])
    .filter((p) => p.kind !== 'طلب')
    .sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function nextPurchaseNumber() {
  return loadLocal(KEYS.purchases, [])
    .filter((p) => p.kind !== 'طلب')
    .reduce((m, p) => Math.max(m, Number(p.number) || 0), 0) + 1;
}

// ---------- طلبات بضاعة من الموردين (بدون أسعار) ----------
export function listOrders() {
  return loadLocal(KEYS.purchases, [])
    .filter((p) => p.kind === 'طلب')
    .sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function getOrder(id) {
  return loadLocal(KEYS.purchases, []).find((p) => p.id === id && p.kind === 'طلب') || null;
}

export function nextOrderNumber() {
  return listOrders().reduce((m, p) => Math.max(m, Number(p.number) || 0), 0) + 1;
}

export function saveOrder(o) {
  const list = loadLocal(KEYS.purchases, []);
  const row = { ...o, kind: 'طلب', id: o.id || uid(), updated_at: todayISO() };
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.purchases, list);
  queuePush('purchases', 'upsert', row);
  if (row.supplier?.name && !listSuppliers().find((s) => s.name === row.supplier.name)) {
    saveSupplier({ name: row.supplier.name, phone: row.supplier.phone || '' });
  }
  logAudit('طلب بضاعة', `طلب ${row.number} من ${row.supplier?.name} — ${row.items?.length || 0} صنف`);
  return row;
}

export function setOrderStatus(id, status) {
  const list = loadLocal(KEYS.purchases, []);
  const i = list.findIndex((x) => x.id === id && x.kind === 'طلب');
  if (i < 0) return null;
  list[i] = { ...list[i], status, updated_at: todayISO() };
  saveLocal(KEYS.purchases, list);
  queuePush('purchases', 'upsert', list[i]);
  return list[i];
}

export function deleteOrder(id) {
  const x = getOrder(id);
  if (!x) return;
  logAudit('حذف طلب بضاعة', `طلب ${x.number} من ${x.supplier?.name}`);
  saveLocal(KEYS.purchases, loadLocal(KEYS.purchases, []).filter((p) => p.id !== id));
  queuePush('purchases', 'delete', { id });
}

// ---------- طلبات المتجر (من التجار أونلاين) ----------
// دي بتيجي من أجهزة التجار مش من أجهزة المحل، فبتتخزن في السحابة مباشرة
// وبتظهر في صفحة "طلبات المتجر" عند المحل (بتتزامن على كل الأجهزة)

// تأكيد إن فيه جلسة قبل الكتابة (مهم بعد تشديد الحماية على السحابة)
async function ensureSession(client) {
  try {
    const { data } = await client.auth.getSession();
    if (!data?.session) await client.auth.signInAnonymously();
  } catch {}
}

// التاجر بيبعت طلبه → بيتخزن في السحابة ويوصل للمحل
export async function submitStoreOrder(order) {
  const client = getSupabase();
  if (!client) throw new Error('مفيش اتصال بالإنترنت دلوقتي — جرب تاني');
  await ensureSession(client);
  const row = {
    ...order,
    id: order.id || uid(),
    status: 'جديد',
    createdAt: new Date().toISOString(),
  };
  const { error } = await client.from('store_orders').upsert({ id: row.id, data: row, updated_at: row.createdAt });
  if (error) throw new Error(error.message);
  return row;
}

// المحل بيقرا طلبات المتجر من السحابة
export async function fetchStoreOrders() {
  const client = getSupabase();
  if (!client) return [];
  try {
    const { data, error } = await client.from('store_orders').select('id,data').order('updated_at', { ascending: false }).limit(500);
    if (error) return [];
    return (data || []).map((r) => ({ ...r.data, id: r.id }));
  } catch {
    return [];
  }
}

export async function setStoreOrderStatus(id, status) {
  const client = getSupabase();
  if (!client) return;
  await ensureSession(client);
  const { data } = await client.from('store_orders').select('data').eq('id', id).single();
  const row = { ...(data?.data || {}), id, status, updated_at: new Date().toISOString() };
  await client.from('store_orders').upsert({ id, data: row, updated_at: row.updated_at });
}

export async function deleteStoreOrder(id) {
  const client = getSupabase();
  if (!client) return;
  await ensureSession(client);
  await client.from('store_orders').delete().eq('id', id);
}

// فاتورة شراء: بتزود المخزون وبتحدث سعر التكلفة تلقائياً
export function savePurchase(p) {
  const row = { ...p, id: p.id || uid(), updated_at: todayISO() };
  const list = loadLocal(KEYS.purchases, []);
  list.push(row);
  saveLocal(KEYS.purchases, list);
  queuePush('purchases', 'upsert', row);
  // تحديث المخزون والتكلفة
  const products = listProducts();
  for (const it of row.items || []) {
    const i = products.findIndex((x) => String(x.code) === String(it.code));
    if (i >= 0) {
      // متوسط تكلفة متحرّك: التكلفة الجديدة = (مخزون قديم×تكلفة قديمة + كمية×سعر شراء) ÷ المخزون الكلي
      // كده لو اشتريت نفس الصنف بأسعار مختلفة تفضل التكلفة (والأرباح) مضبوطة
      const oldStock = Number(products[i].stock) || 0;
      const oldCost = Number(products[i].cost) || 0;
      const buyQty = Number(it.qty) || 0;
      const buyCost = Number(it.cost) || 0;
      const newStock = oldStock + buyQty;
      let avgCost = buyCost || oldCost;
      if (buyCost > 0 && oldCost > 0 && oldStock > 0 && newStock > 0) {
        avgCost = Math.round(((oldStock * oldCost + buyQty * buyCost) / newStock) * 100) / 100;
      }
      products[i] = {
        ...products[i],
        stock: newStock,
        cost: avgCost,
        updated_at: todayISO(),
      };
      queuePush('products', 'upsert', products[i]);
    } else if (it.name) {
      const np = {
        id: uid(),
        code: it.code,
        name: it.name,
        price: Number(it.cost) || 0,
        cost: Number(it.cost) || 0,
        stock: Number(it.qty) || 0,
        barcode: '',
        category: 'أدوات منزلية',
        updated_at: todayISO(),
      };
      products.push(np);
      queuePush('products', 'upsert', np);
    }
  }
  saveLocal(KEYS.products, products);
  // إضافة المورد تلقائياً لو جديد
  if (row.supplier?.name && !listSuppliers().find((s) => s.name === row.supplier.name)) {
    saveSupplier({ name: row.supplier.name, phone: row.supplier.phone || '' });
  }
  logAudit('فاتورة شراء', `شراء ${row.number} من ${row.supplier?.name} بإجمالي ${row.totals?.net}`);
  return row;
}

// مديونيتنا للمورد
export function supplierDebt(name) {
  if (!name) return 0;
  return listPurchases()
    .filter((p) => p.supplier?.name === name)
    .reduce((s, p) => s + Math.max(0, p.totals?.remaining || 0), 0);
}

// ---------- جرد المخزون ----------
export function listStocktakes() {
  return loadLocal(KEYS.stocktakes, []).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function saveStocktake(st) {
  const row = { ...st, id: st.id || uid(), updated_at: todayISO() };
  const list = loadLocal(KEYS.stocktakes, []);
  list.push(row);
  saveLocal(KEYS.stocktakes, list);
  queuePush('stocktakes', 'upsert', row);
  // اعتماد الأرصدة الفعلية
  const products = listProducts();
  for (const it of row.items || []) {
    const i = products.findIndex((x) => String(x.code) === String(it.code));
    if (i >= 0) {
      products[i] = { ...products[i], stock: Number(it.actual) || 0, updated_at: todayISO() };
      queuePush('products', 'upsert', products[i]);
    }
  }
  saveLocal(KEYS.products, products);
  logAudit('جرد مخزون', `جرد ${row.items?.length || 0} صنف — فرق بقيمة ${row.diffValue}`);
  return row;
}

// ---------- إقفال اليومية ----------
export function listDayCloses() {
  return loadLocal(KEYS.daycloses, []).sort((a, b) => (b.day || '').localeCompare(a.day || ''));
}

export function saveDayClose(d) {
  const list = loadLocal(KEYS.daycloses, []);
  const i = list.findIndex((x) => x.day === d.day);
  const row = { ...d, id: i >= 0 ? list[i].id : uid(), updated_at: todayISO() };
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.daycloses, list);
  queuePush('daycloses', 'upsert', row);
  logAudit('إقفال يومية', `يوم ${row.day}: المفروض ${row.expected} — الفعلي ${row.actual} — الفرق ${row.diff}`);
  return row;
}

// مديونية عميل = مجموع المتبقي في فواتيره السابقة (المرتجعات بتقلل المتبقي وقت تسجيلها)
export function customerDebt(name) {
  if (!name) return 0;
  return listInvoices()
    .filter((i) => i.customer?.name === name && i.type !== 'مرتجع')
    .reduce((s, i) => s + Math.max(0, i.totals?.remaining || 0), 0);
}

// المرتجع بيقلل المتبقي على فواتير العميل المفتوحة (الأقدم أولاً) — والباقي بيرجع نقدي
export function applyReturnCredit(customerName, amount, refInvoiceId) {
  const invoices = loadLocal(KEYS.invoices, []);
  const open = invoices
    .filter((i) => i.type !== 'مرتجع' && i.customer?.name === customerName && (Number(i.totals?.remaining) || 0) > 0)
    .sort((a, b) => (a.id === refInvoiceId ? -1 : b.id === refInvoiceId ? 1 : (a.date || '').localeCompare(b.date || '')));
  let left = Number(amount) || 0;
  let credited = 0;
  for (const inv of open) {
    if (left <= 0) break;
    const rem = Number(inv.totals.remaining) || 0;
    const take = Math.min(rem, left);
    inv.totals = { ...inv.totals, remaining: rem - take };
    inv.updated_at = todayISO();
    queuePush('invoices', 'upsert', inv);
    left -= take;
    credited += take;
  }
  saveLocal(KEYS.invoices, invoices);
  return { credited, cashRefund: left }; // اللي متخصمش من الآجل بيرجع كاش
}

// تصفية حساب سابق: بعد إضافته لفاتورة جديدة نصفّر المتبقي في الفواتير القديمة
export function settleCustomerDebt(name, intoNumber, excludeId) {
  const list = loadLocal(KEYS.invoices, []);
  for (const inv of list) {
    if (inv.id === excludeId) continue;
    if (inv.customer?.name === name && (inv.totals?.remaining || 0) > 0) {
      inv.totals = { ...inv.totals, remaining: 0 };
      inv.settledInto = intoNumber;
      inv.updated_at = todayISO();
      queuePush('invoices', 'upsert', inv);
    }
  }
  saveLocal(KEYS.invoices, list);
}

// قراءة الأصناف والإعدادات من السحابة (لصفحة الاستعلام من الموبايل)
export async function fetchProductsCloud() {
  const client = getSupabase();
  if (!client) return null;
  try {
    // بصفحات — عشان أكتر من 1000 صنف يوصلوا كلهم
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('products').select('id,data').range(from, from + 999);
      if (error) break;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return dedupByCode(all.map((r) => ({ ...r.data, id: r.id })));
  } catch {
    return null;
  }
}

export async function fetchSettingsCloud() {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data } = await client.from('settings').select('data').eq('id', 'main').maybeSingle();
    return data ? data.data : null;
  } catch {
    return null;
  }
}

// قراءة فاتورة من السحابة (لصفحة العرض العام على موبايل العميل)
export async function fetchInvoiceCloud(id) {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data } = await client.from('invoices').select('data').eq('id', id).maybeSingle();
    return data ? data.data : null;
  } catch {
    return null;
  }
}

// ---------- نسخ احتياطي ----------
export function exportBackup() {
  return JSON.stringify(
    {
      exported_at: todayISO(),
      products: listProducts(),
      customers: listCustomers(),
      invoices: loadLocal(KEYS.invoices, []),
      payments: loadLocal(KEYS.payments, []),
      expenses: loadLocal(KEYS.expenses, []),
      suppliers: loadLocal(KEYS.suppliers, []),
      purchases: loadLocal(KEYS.purchases, []),
      stocktakes: loadLocal(KEYS.stocktakes, []),
      daycloses: loadLocal(KEYS.daycloses, []),
      audit: loadLocal(KEYS.audit, []),
      settings: getSettings(),
    },
    null,
    2
  );
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (data.products) saveLocal(KEYS.products, data.products);
  if (data.customers) saveLocal(KEYS.customers, data.customers);
  if (data.invoices) saveLocal(KEYS.invoices, data.invoices);
  if (data.payments) saveLocal(KEYS.payments, data.payments);
  if (data.expenses) saveLocal(KEYS.expenses, data.expenses);
  if (data.suppliers) saveLocal(KEYS.suppliers, data.suppliers);
  if (data.purchases) saveLocal(KEYS.purchases, data.purchases);
  if (data.stocktakes) saveLocal(KEYS.stocktakes, data.stocktakes);
  if (data.daycloses) saveLocal(KEYS.daycloses, data.daycloses);
  if (data.audit) saveLocal(KEYS.audit, data.audit);
  if (data.settings) saveLocal(KEYS.settings, data.settings);
  // رفع الكل للسحابة
  const client = getSupabase();
  if (client) {
    for (const p of data.products || []) queuePush('products', 'upsert', p);
    for (const c of data.customers || []) queuePush('customers', 'upsert', c);
    for (const inv of data.invoices || []) queuePush('invoices', 'upsert', inv);
  }
}

// ---------- تحميل قائمة أصناف الشركة الكاملة (3705 صنف من ملف الأصناف الرسمي) ----------
// بتتحمل مرة واحدة على كل جهاز، والأصناف الجديدة بتتضاف من غير ما تلمس أي صنف موجود
const SEED_VERSION = 2;

export async function seedIfEmpty() {
  if (typeof window === 'undefined') return;
  await fixSlashNames();
  // لو الأدمن حذف كل الأصناف قبل كده — مفيش إعادة تحميل للقائمة المدمجة
  if (getSettings().productsWipedAt) return;
  const v = Number(localStorage.getItem('saqqa_seed_v') || 0);
  if (v >= SEED_VERSION) return;
  try {
    const { SEED_PRODUCTS_ALL } = await import('./seedProducts');
    let list = listProducts();
    // جهاز جديد فاضي: نسحب أصناف السحابة الأول بدل ما نولّد نسخة جديدة بمعرّفات مختلفة (كانت بتعمل تكرار)
    if (!list.length && cloudEnabled()) {
      try {
        const cloud = await fetchProductsCloud();
        if (cloud && cloud.length) {
          saveLocal(KEYS.products, cloud);
          list = cloud;
        }
      } catch {}
    }
    const have = new Set(list.map((p) => String(p.code)));
    const now = todayISO();
    let added = 0;
    for (const [code, name, price, cost, supplier] of SEED_PRODUCTS_ALL) {
      if (have.has(String(code))) continue; // مش بنلمس الأصناف الموجودة
      list.push({
        // معرّف ثابت من الكود — لو جهازين ضافوا نفس الصنف بيتوحدوا على السحابة بدل ما يتكرروا
        id: 'seed-' + String(code),
        code: String(code),
        name,
        price: Number(price) || 0,
        cost: Number(cost) || 0,
        stock: 0,
        barcode: '',
        category: supplier || 'أدوات منزلية',
        updated_at: now,
      });
      added++;
    }
    saveLocal(KEYS.products, list);
    localStorage.setItem('saqqa_seed_v', String(SEED_VERSION));
    // رفع دفعات كبيرة للسحابة مرة واحدة (بدل الطابور صنف صنف)
    const client = getSupabase();
    if (client && added) {
      const rows = list.map((p) => ({ id: p.id, data: p, updated_at: p.updated_at }));
      for (let i = 0; i < rows.length; i += 500) {
        await client.from('products').upsert(rows.slice(i, i + 500));
      }
    }
    if (added) logAudit('تحميل الأصناف', `تم تحميل ${added} صنف من قائمة أصناف الشركة`);
  } catch {
    // هنحاول تاني في الفتحة الجاية
  }
}

// تصحيح اسم الصنف زي ملف الشركة: الشرطة المايلة بس ("ط / كاس" → "ط/كاس")
// باقي الرموز (* - +) بتفضل بمسافاتها زي الملف الأصلي بالظبط
export function cleanProductName(name) {
  return String(name || '').replace(/\s*\/\s*/g, '/');
}

// مفتاح مقارنة أسماء (للاستيراد): بيتجاهل كل المسافات وفروق صيغ الحروف —
// عشان "6 * 1" و"6*1" يتعرفوا كنفس الصنف وميتكررش
export function nameMatchKey(name) {
  let t = String(name || '');
  try { t = t.normalize('NFKC'); } catch {}
  return t.replace(/\s+/g, '');
}

export async function fixSlashNames() {
  if (typeof window === 'undefined') return 0;
  if (localStorage.getItem('saqqa_slash_fix') === '3') return 0;
  const all = loadLocal(KEYS.products, []);
  // 1) تنظيف التكرار: نسخة واحدة لكل كود (الأحدث) — والباقي بيتشال محلياً ومن السحابة
  const keep = dedupByCode(all);
  const keepIds = new Set(keep.map((p) => p.id));
  const removedIds = all.filter((p) => !keepIds.has(p.id)).map((p) => p.id);
  // 2) رجوع الأسماء زي ملف الشركة بالظبط: النسخة اللي فاتت لزقت النجمة والشرطة
  //    بالغلط ("6 * 1" بقت "6*1") — بنرجّع اسم الملف الأصلي لكل كود من القائمة المدمجة
  const seedNames = new Map();
  try {
    const { SEED_PRODUCTS_ALL } = await import('./seedProducts');
    for (const [code, name] of SEED_PRODUCTS_ALL) seedNames.set(String(code), name);
  } catch {}
  let changed = 0;
  for (const p of keep) {
    let fixed = cleanProductName(p.name);
    const seedName = seedNames.get(String(p.code));
    // لو الاسم الحالي هو نفسه اسم الملف بس بفروق مسافات/رموز — نرجّع نص الملف حرفياً
    if (seedName && nameMatchKey(seedName) === nameMatchKey(fixed)) fixed = seedName;
    if (fixed !== p.name) {
      p.name = fixed;
      p.updated_at = todayISO();
      queuePush('products', 'upsert', p);
      changed++;
    }
  }
  saveLocal(KEYS.products, keep);
  const client = getSupabase();
  if (removedIds.length) {
    if (client) {
      try {
        for (let i = 0; i < removedIds.length; i += 200) {
          await client.from('products').delete().in('id', removedIds.slice(i, i + 200));
        }
      } catch {
        for (const id of removedIds) queuePush('products', 'delete', { id });
      }
    } else {
      for (const id of removedIds) queuePush('products', 'delete', { id });
    }
  }
  if (changed || removedIds.length) {
    logAudit('تصحيح أسماء', `رجوع ${changed} اسم لنص الملف الأصلي وحذف ${removedIds.length} مكرر`);
  }
  localStorage.setItem('saqqa_slash_fix', '3');
  return changed;
}
