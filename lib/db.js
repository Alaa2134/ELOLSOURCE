// طبقة البيانات: تخزين محلي فوري (يشتغل بدون إنترنت) + مزامنة سحابية مع Supabase عند توفرها
import { createClient } from '@supabase/supabase-js';
import { uid, todayISO } from './format';

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
}

export function getSupabase() {
  if (sb) return sb;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const c = getCloudConfig();
    if (c) {
      url = c.url;
      key = c.key;
    }
  }
  if (url && key) sb = createClient(url, key);
  return sb;
}

// إعداد السحابة مضمّن في رابط (QR الأدمن / روابط الفواتير) — بيظبط الجهاز الجديد تلقائياً
export function cloudConfigFromHash() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  if (!hash.startsWith('#c=')) return false;
  try {
    const [url, key] = JSON.parse(atob(hash.slice(3)));
    if (url && key) {
      setCloudConfig(url, key);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
  } catch {}
  return false;
}

export function cloudLinkHash() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return '';
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
    await client.from('settings').upsert({ id: 'main', data: s, updated_at: s.updated_at || todayISO() });
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
      const { data, error } = await client.from(table).select('id,data,updated_at');
      if (error) continue;
      const local = loadLocal(KEYS[table], []);
      const byId = new Map(local.map((r) => [r.id, r]));
      for (const row of data || []) {
        const remote = { ...row.data, id: row.id };
        const mine = byId.get(row.id);
        if (!mine || (remote.updated_at || '') > (mine.updated_at || '')) byId.set(row.id, remote);
      }
      saveLocal(KEYS[table], [...byId.values()]);
    }
    const { data: st } = await client.from('settings').select('data').eq('id', 'main').maybeSingle();
    if (st && st.data) {
      const local = loadLocal(KEYS.settings, null);
      if (!local || (st.data.updated_at || '') > (local.updated_at || '')) {
        saveLocal(KEYS.settings, { ...DEFAULT_SETTINGS, ...st.data });
      }
    }
    await flushPending();
    return true;
  } catch {
    return false;
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
  },
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
    client.from('settings').upsert({ id: 'main', data: merged, updated_at: merged.updated_at }).then(() => {});
  }
  return merged;
}

// ---------- الأصناف ----------
export function listProducts() {
  return loadLocal(KEYS.products, []);
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

export function listPurchases() {
  return loadLocal(KEYS.purchases, []).sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function nextPurchaseNumber() {
  return loadLocal(KEYS.purchases, []).reduce((m, p) => Math.max(m, Number(p.number) || 0), 0) + 1;
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
      products[i] = {
        ...products[i],
        stock: (Number(products[i].stock) || 0) + (Number(it.qty) || 0),
        cost: Number(it.cost) || products[i].cost || 0,
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
    const { data } = await client.from('products').select('id,data');
    return (data || []).map((r) => ({ ...r.data, id: r.id }));
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
  const v = Number(localStorage.getItem('saqqa_seed_v') || 0);
  if (v >= SEED_VERSION) return;
  try {
    const { SEED_PRODUCTS_ALL } = await import('./seedProducts');
    const list = listProducts();
    const have = new Set(list.map((p) => String(p.code)));
    const now = todayISO();
    let added = 0;
    for (const [code, name, price, cost, supplier] of SEED_PRODUCTS_ALL) {
      if (have.has(String(code))) continue; // مش بنلمس الأصناف الموجودة
      list.push({
        id: uid(),
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
