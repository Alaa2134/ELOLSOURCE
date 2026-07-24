// بحث ذكي للأصناف — بيتعامل مع طريقة الكتابة المصرية على طبيعتها
// • بيلاقي الصنف لو كتبت كلمتين مش ورا بعض: "كاس مدهب" → "ط/كاس 42 ق مشكل مدهب"
// • مابيفرقش بين ه/ة · ي/ى · أ/إ/آ/ا · ك/ک · والتشكيل والمسافات الزيادة
// • بيرتّب الأقرب للي كتبته، والأصناف اللي بتبيعها كتير بتطلع فوق

const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

// تطبيع النص: بيوحّد الحروف اللي بتتكتب بأكتر من شكل عشان البحث ميضيعش
export function normAr(s) {
  let t = String(s || '');
  try { t = t.normalize('NFKC'); } catch {}
  return t
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d])        // أرقام هندية → عربية
    .replace(/[ً-ْٰـ]/g, '')    // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[کك]/g, 'ك')
    .replace(/[گ]/g, 'ج')
    .replace(/[^\w؀-ۿ]+/g, ' ')           // أي رمز (/ * - .) يبقى مسافة
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// مفتاح البحث للصنف (بيتحسب مرة ويتخزن)
function keyOf(p) {
  if (!p.__k) {
    Object.defineProperty(p, '__k', { value: normAr(p.name), enumerable: false, writable: true, configurable: true });
  }
  return p.__k;
}

// خريطة كام مرة اتباع كل صنف — الأصناف الدارجة بتطلع فوق
export function buildFreq(invoices, days = 90) {
  const since = Date.now() - days * 86400000;
  const freq = new Map();
  for (const inv of invoices || []) {
    if (inv.type === 'مرتجع') continue;
    if (new Date(inv.date).getTime() < since) continue;
    for (const it of inv.items || []) {
      const c = String(it.code);
      freq.set(c, (freq.get(c) || 0) + 1);
    }
  }
  return freq;
}

// بحث + ترتيب ذكي. بيرجّع أقرب `limit` صنف
export function searchProducts(products, query, { limit = 12, freq = null, sortMode = 'ذكي' } = {}) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const q = normAr(raw);
  if (!q) return [];
  const words = q.split(' ').filter(Boolean);
  const isCodeQuery = /^[0-9]+$/.test(raw.trim());

  const out = [];
  for (const p of products) {
    const code = String(p.code || '');
    const name = keyOf(p);

    // مطابقة بالكود
    let codeScore = null;
    if (isCodeQuery) {
      if (code === raw.trim()) codeScore = 0;          // الكود بالظبط
      else if (code.startsWith(raw.trim())) codeScore = 1; // بيبدأ بيه
    }

    // كل الكلمات لازم تتواجد في الاسم (بأي ترتيب) — ده اللي بيخلي "كاس مدهب" يلاقي
    let allWords = true;
    let atStart = 0;
    for (const w of words) {
      const at = name.indexOf(w);
      if (at < 0) { allWords = false; break; }
      if (at === 0 || name[at - 1] === ' ') atStart++;
    }

    if (codeScore === null && !allWords) continue;

    // الترتيب: الكود بالظبط → الاسم بيبدأ بالمكتوب → كل الكلمات في بدايات كلمات → مطابقة عادية
    let s;
    if (codeScore === 0) s = 0;
    else if (allWords && name.startsWith(q)) s = 1;
    else if (codeScore === 1) s = 2;
    else if (allWords && atStart === words.length) s = 3;
    else s = 4;

    out.push({ p, s, sold: freq ? (freq.get(code) || 0) : 0 });
  }

  if (sortMode === 'أبجدي') out.sort((a, b) => a.p.name.localeCompare(b.p.name, 'ar'));
  else if (sortMode === 'بالكود') out.sort((a, b) => (Number(a.p.code) || 0) - (Number(b.p.code) || 0));
  else {
    out.sort((a, b) =>
      a.s - b.s ||                          // الأقرب للمكتوب
      b.sold - a.sold ||                    // بعدين الأكتر مبيعاً
      a.p.name.length - b.p.name.length ||  // بعدين الاسم الأقصر (الأدق غالباً)
      a.p.name.localeCompare(b.p.name, 'ar')
    );
  }
  return out.slice(0, limit).map((x) => x.p);
}

// الأصناف المشابهة (لزرار ▼) — نفس أول كلمة/كلمتين
export function similarProducts(products, query, limit = 14) {
  const q = normAr(query);
  if (!q) return products.slice(0, limit);
  const words = q.split(' ').filter(Boolean);
  for (const n of [2, 1]) {
    const base = words.slice(0, n).join(' ');
    if (!base) continue;
    const hits = products.filter((p) => keyOf(p).includes(base));
    if (hits.length > 1) return hits.slice(0, limit);
  }
  return products.filter((p) => keyOf(p).includes(words[0] || '')).slice(0, limit);
}
