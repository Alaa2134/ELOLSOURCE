'use client';
// قراءة ملف PDF (بيان أسعار / قائمة أصناف) وتحليل المنتجات منه
// بنجمّع النصوص في سطور حسب موضعها في الصفحة، وبنحلل كل سطر: كود / اسم / سعر

const AR2EN = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

function normDigits(s) {
  return String(s).replace(/[٠-٩]/g, (d) => AR2EN[d]).replace(/٫/g, '.').replace(/،/g, ',');
}

const isNum = (t) => /^[0-9]+([.,][0-9]+)?$/.test(t);
const toNum = (t) => Number(String(t).replace(',', '.')) || 0;
const hasArabic = (s) => /[؀-ۿ]/.test(s);

export async function parsePdfProducts(file) {
  const pdfjs = await import('pdfjs-dist');
  // الـ worker متنسخ في public/ بسكريبت prebuild عشان webpack ميحاولش يعالجه
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // تجميع العناصر في سطور حسب الإحداثي الرأسي
    const byY = new Map();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 4) * 4;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ x: item.transform[4], text: item.str.trim() });
    }
    for (const [, items] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      // ترتيب من اليمين لليسار (جدول عربي)
      items.sort((a, b) => b.x - a.x);
      lines.push(items.map((i) => i.text).join(' '));
    }
  }

  // تحليل السطور لمنتجات
  const out = [];
  for (const raw of lines) {
    const toks = normDigits(raw).split(/\s+/).filter(Boolean);
    if (toks.length < 3) continue;
    if (!toks.some(hasArabic)) continue; // لازم فيه اسم عربي

    // نمط بيان الأسعار: [م] [كود] [اسم ممكن فيه أرقام] [كمية] [سعر] [إجمالي]
    const leadNums = [];
    let i = 0;
    while (i < toks.length && isNum(toks[i]) && leadNums.length < 2) { leadNums.push(toks[i]); i++; }
    const tailNums = [];
    let j = toks.length - 1;
    while (j >= i && isNum(toks[j]) && tailNums.length < 3) { tailNums.unshift(toks[j]); j--; }
    const nameToks = toks.slice(i, j + 1);
    if (!nameToks.length || !nameToks.some(hasArabic)) continue;

    let code = '';
    let price = 0;
    let qty = 0;
    if (leadNums.length === 2) code = leadNums[1]; // أول رقم = م، التاني = الكود
    else if (leadNums.length === 1) code = leadNums[0];

    if (tailNums.length >= 2) {
      // [كمية، سعر] أو [كمية، سعر، إجمالي]
      qty = toNum(tailNums[0]);
      price = toNum(tailNums[1]);
      if (tailNums.length === 2 && toNum(tailNums[0]) > toNum(tailNums[1])) {
        // غالباً [سعر، إجمالي] من غير كمية
        price = toNum(tailNums[0]);
        qty = 0;
      }
    } else if (tailNums.length === 1) {
      price = toNum(tailNums[0]);
    }

    if (!code && !price) continue;
    out.push({ code, name: nameToks.join(' '), price, qty });
  }

  // إزالة التكرار بالكود
  const seen = new Set();
  return out.filter((r) => {
    const k = r.code || r.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
