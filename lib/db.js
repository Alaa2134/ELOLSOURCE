// طبقة البيانات: تخزين محلي فوري (يشتغل بدون إنترنت) + مزامنة سحابية مع Supabase عند توفرها
import { createClient } from '@supabase/supabase-js';
import { uid, todayISO } from './format';

const KEYS = {
  products: 'saqqa_products',
  customers: 'saqqa_customers',
  invoices: 'saqqa_invoices',
  settings: 'saqqa_settings',
  pending: 'saqqa_pending_sync',
};

let sb = null;
export function getSupabase() {
  if (sb) return sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) sb = createClient(url, key);
  return sb;
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

// سحب البيانات من السحابة ودمجها مع المحلي (الأحدث يكسب)
export async function syncPull() {
  const client = getSupabase();
  if (!client) return false;
  try {
    for (const table of ['products', 'customers', 'invoices']) {
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
  pin: '1234',
  adminPassword: 'saber123456@',
  inquiryPassword: '1111',
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
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    wa: { ...DEFAULT_SETTINGS.wa, ...(s.wa || {}) },
    perms: { ...DEFAULT_SETTINGS.perms, ...(s.perms || {}) },
  };
}

export function getRole() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('saqqa_role') || '';
}

export function isAdmin() {
  return getRole() === 'admin';
}

export function saveSettings(s) {
  const merged = { ...getSettings(), ...s, updated_at: todayISO() };
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
  if (i >= 0) list[i] = row;
  else list.push(row);
  saveLocal(KEYS.products, list);
  queuePush('products', 'upsert', row);
  return row;
}

export function deleteProduct(id) {
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
  // خصم المخزون عند إنشاء فاتورة جديدة
  if (isNew && row.type !== 'مرتجع') {
    for (const it of row.items || []) adjustStock(it.code, -(Number(it.qty) || 0));
  }
  if (isNew && row.type === 'مرتجع') {
    for (const it of row.items || []) adjustStock(it.code, Number(it.qty) || 0);
  }
  return row;
}

export function deleteInvoice(id) {
  const inv = getInvoice(id);
  if (inv && inv.type !== 'مرتجع') {
    for (const it of inv.items || []) adjustStock(it.code, Number(it.qty) || 0);
  }
  saveLocal(KEYS.invoices, loadLocal(KEYS.invoices, []).filter((x) => x.id !== id));
  queuePush('invoices', 'delete', { id });
}

// مديونية عميل = مجموع المتبقي في فواتيره السابقة
export function customerDebt(name) {
  if (!name) return 0;
  return listInvoices()
    .filter((i) => i.customer?.name === name)
    .reduce((s, i) => s + Math.max(0, i.totals?.remaining || 0), 0);
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
  if (data.settings) saveLocal(KEYS.settings, data.settings);
  // رفع الكل للسحابة
  const client = getSupabase();
  if (client) {
    for (const p of data.products || []) queuePush('products', 'upsert', p);
    for (const c of data.customers || []) queuePush('customers', 'upsert', c);
    for (const inv of data.invoices || []) queuePush('invoices', 'upsert', inv);
  }
}

// ---------- بيانات تجريبية أول مرة ----------
const SEED_PRODUCTS = [
  { code: '787', name: 'رول مذهب مفرش الخليج لوكس', price: 200, stock: 20 },
  { code: '1476', name: 'صفاية حوض خورشيد', price: 50, stock: 30 },
  { code: '913', name: 'صفاية سارة أرز خورشيد وسط', price: 69, stock: 25 },
  { code: '3368', name: 'بولة مدورة وطنية لينا 1', price: 23, stock: 40 },
  { code: '3369', name: 'بولة مدورة وطنية لينا 2', price: 33.5, stock: 40 },
  { code: '3379', name: 'علبة أرز كبيرة لينا وطنية', price: 118, stock: 15 },
  { code: '3840', name: 'طشت سالي شفاف بالرسم 31 خورشيد', price: 38.35, stock: 30 },
  { code: '3842', name: 'طشت سالي شفاف بالرسم 36 خورشيد', price: 55.9, stock: 30 },
  { code: '5599', name: 'طقم توابل وطنية استاند روما 8ق', price: 188, stock: 10 },
  { code: '1412', name: 'سرفيس بيضاوي خورشيد ك2 دلتر', price: 33.2, stock: 20 },
  { code: '357', name: 'قارب شفاف 2لون خورشيد', price: 70.3, stock: 20 },
  { code: '3739', name: 'درج معالق وشوك الوطنية بسمة', price: 48, stock: 25 },
  { code: '4077', name: 'علبة مناديل خورشيد', price: 32.45, stock: 35 },
  { code: '4282', name: 'منظم نوجا ثلاجة 2لون خورشيد', price: 35, stock: 20 },
  { code: '5675', name: 'عصارة برتقال خورشيد', price: 19.6, stock: 30 },
  { code: '2080', name: 'مصفى سيما 2 لون ك', price: 25, stock: 30 },
  { code: '3079', name: 'مصفى سيما باليدين 2لون ص', price: 17.5, stock: 30 },
  { code: '1338', name: 'طاجورية ثلاجة 3ق خورشيد', price: 77.5, stock: 12 },
];

export function seedIfEmpty() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(KEYS.products)) return;
  const now = todayISO();
  saveLocal(
    KEYS.products,
    SEED_PRODUCTS.map((p) => ({ ...p, id: uid(), barcode: '', category: 'أدوات منزلية', cost: 0, updated_at: now }))
  );
}
