// أدوات تنسيق الأرقام والتواريخ والهواتف

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
}

export function num(value, arabic = false) {
  const s = fmtMoney(value);
  return arabic ? toArabicDigits(s) : s;
}

export function fmtMoney(value) {
  const n = Number(value) || 0;
  const s = n.toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s.replace(/0$/, '');
}

export function fmtDate(iso, arabic = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  return arabic ? toArabicDigits(s) : s;
}

export function fmtTime(iso, arabic = false) {
  if (!iso) return '';
  const d = new Date(iso);
  let h = d.getHours();
  const suffix = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  const s = `${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
  return arabic ? toArabicDigits(s) : s;
}

export function todayISO() {
  return new Date().toISOString();
}

// تحويل رقم مصري إلى صيغة دولية للواتساب: 01012345678 -> 201012345678
export function normalizePhone(raw) {
  if (!raw) return '';
  let p = String(raw).replace(/[^0-9+]/g, '');
  // تحويل الأرقام العربية لو موجودة تم قبل كده لأننا شلنا غير الأرقام الإنجليزية
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0') && p.length === 11) p = '2' + p; // مصر
  if (p.length === 10 && p.startsWith('1')) p = '20' + p;
  return p;
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
