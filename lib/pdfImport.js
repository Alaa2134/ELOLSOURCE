'use client';
// قراءة ملفات PDF (بيان أسعار / قائمة أصناف / قائمة عملاء) وتحليلها بذكاء
// بنجمّع النصوص في سطور حسب موضعها في الصفحة، وبنحلل كل سطر بالاعتماد على
// موضع كل عمود (إحداثي x) مش مجرد ترتيب الكلام — عشان يفهم شكل ملفات الشركة

const AR2EN = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

function normDigits(s) {
  // NFKC بيحول الحروف العربية من صيغ العرض القديمة (ﻣ ﻛ ﹰ) للصيغة العادية
  let t = String(s);
  try { t = t.normalize('NFKC'); } catch {}
  return t.replace(/[٠-٩]/g, (d) => AR2EN[d]).replace(/٫/g, '.').replace(/،/g, ',');
}

// تنظيف الاسم: الشرطة المايلة بس ("ط / كاس" → "ط/كاس") — باقي الرموز زي الملف
function cleanName(s) {
  return String(s || '').replace(/\s*\/\s*/g, '/').replace(/\s{2,}/g, ' ').trim();
}

const isNum = (t) => /^[0-9]+([.,][0-9]+)?$/.test(t);
const toNum = (t) => Number(String(t).replace(',', '.')) || 0;
const hasArabic = (s) => /[؀-ۿ]/.test(s);
// تليفون مصري: 11 رقم بيبدأ بـ 01 (موبايل) أو أرقام أرضي
const isPhone = (t) => /^01[0-9]{9}$/.test(t) || /^0[0-9]{8,10}$/.test(t);

// كلمات العناوين والفوتر اللي بنعديها (مش أصناف/عملاء)
// ملاحظة: مابنحطش "رقم" هنا لأنها بتيجي جوه أسماء أصناف حقيقية (زباله راتان رقم 1)
const NOISE = ['بيان', 'أسعار', 'اسعار', 'الإجمالي', 'الاجمالي', 'الصنف', 'المجموع', 'صفحة', 'التاريخ',
  'الكود', 'السعر', 'الكمية', 'ملاحظات', 'العميل', 'الاسم', 'الهاتف', 'التليفون',
  'العنوان', 'المندوب', 'الشركة', 'اجمالي'];

// الخطوة المشتركة: نقرأ كل صفحات الـ PDF ونطلع سطور، كل سطر مصفوفة رموز فيها {x, text}
async function readRows(file, opts = {}) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const rows = [];
  let textItems = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    opts.onProgress?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // نجمع العناصر حسب قربها الرأسي (مش تقريب ثابت) — عشان الكود والاسم اللي بينهم
    // فرق بسيط في y مايتفصلوش عن بعض في سطرين (ده كان بيبوّظ ربط الكود بصنفه)
    const its = content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => { textItems++; return { x: i.transform[4], y: i.transform[5], text: normDigits(i.str.trim()) }; })
      .sort((a, b) => b.y - a.y);
    let cur = [], refY = null;
    const flush = () => {
      if (cur.length) { cur.sort((a, b) => b.x - a.x); rows.push(cur.map((c) => ({ x: c.x, text: c.text }))); }
      cur = [];
    };
    for (const it of its) {
      if (refY === null || refY - it.y <= 12) { cur.push(it); if (refY === null) refY = it.y; }
      else { flush(); cur = [it]; refY = it.y; }
    }
    flush();
  }
  if (!textItems) {
    throw new Error('الملف ده متصور سكانر (صور مش نصوص) — البرنامج مش هيعرف يقرأه. جرب ملف PDF أصلي أو ابعت البيانات من إكسل');
  }
  return rows;
}

// تقسيم رموز السطر لكلمات مفردة مع الاحتفاظ بموضع x لكل كلمة
function splitTokens(items) {
  const toks = [];
  for (const it of items) {
    const parts = it.text.split(/\s+/).filter(Boolean);
    for (const part of parts) toks.push({ x: it.x, text: part });
  }
  return toks;
}

// تصنيف سطر منتج من رموزه (دالة نقية عشان نقدر نختبرها):
// شكل ملف الشركة (بالإحداثيات): المورد يمين | الكود | اسم الصنف | التكلفة | سعر البيع شمال
// القاعدة الذكية: سعر البيع دايماً ≥ التكلفة، فأكبر رقم = بيع وأصغر = تكلفة
export function classifyProductTokens(toks, knownSuppliers = new Set()) {
  if (!toks || toks.length < 2) return null;
  if (!toks.some((t) => hasArabic(t.text))) return null;
  // مرتبين يمين → شمال (x تنازلي)
  const sorted = [...toks].sort((a, b) => b.x - a.x);

  // اسم الصنف = أطول سلسلة كلمات عربية متجاورة (بيفصل الكود/المورد يمين عن الأسعار شمال)
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < sorted.length; i++) {
    const isAr = hasArabic(sorted[i].text) && !NOISE.includes(sorted[i].text);
    if (isAr) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else curLen = 0;
  }
  if (bestLen === 0) return null;
  const nameArr = sorted.slice(bestStart, bestStart + bestLen);
  const rightZone = sorted.slice(0, bestStart);   // يمين الاسم: مورد + كود
  const leftZone = sorted.slice(bestStart + bestLen); // شمال الاسم: أسعار

  // المورد: كلمة عربية في يمين الاسم (أو مورد معروف) — والكود: رقم في يمين الاسم
  const supTok = rightZone.find((t) => hasArabic(t.text) && !NOISE.includes(t.text));
  let supplier = supTok ? supTok.text : '';
  if (!supplier) {
    const last = nameArr[nameArr.length - 1].text, first = nameArr[0].text;
    if (knownSuppliers.has(first)) supplier = first;
    else if (knownSuppliers.has(last)) supplier = last;
  }
  const codeTok = rightZone.filter((t) => isNum(t.text)).sort((a, b) => a.x - b.x)[0]; // الأقرب للاسم
  const code = codeTok ? codeTok.text : '';

  // الأسعار: أكبر رقم = بيع، أصغر = تكلفة (البيع دايماً ≥ التكلفة)
  const prices = leftZone.filter((t) => isNum(t.text)).map((t) => toNum(t.text)).filter((n) => n > 0);
  let price = 0, cost = 0;
  if (prices.length >= 2) { price = Math.max(...prices); cost = Math.min(...prices); }
  else if (prices.length === 1) price = prices[0];

  let nameToks = nameArr.map((t) => t.text);
  if (supplier && nameToks[0] === supplier) nameToks = nameToks.slice(1);
  else if (supplier && nameToks[nameToks.length - 1] === supplier) nameToks = nameToks.slice(0, -1);
  const name = cleanName(nameToks.join(' '));
  if (!name || name.length < 2) return null;
  if (!code && !price) return null;
  return { code, name, price, cost, supplier: supplier || '' };
}

// اكتشاف أعمدة الأرقام من الملف كله: الأعمدة الحقيقية (كود/أسعار) بتتكرر في
// نفس مكان x عبر مئات السطور — أما الأرقام اللي جوه الأسماء بتبقى متبعثرة.
// بنجمع مواضع الأرقام، ونطلع أكتر 3 أماكن تكراراً = الأعمدة الثابتة.
export function detectNumberColumns(allTokens) {
  const xs = allTokens.filter((t) => isNum(t.text)).map((t) => t.x).sort((a, b) => a - b);
  if (xs.length < 10) return null;
  const clusters = [];
  let cur = [xs[0]];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - cur[cur.length - 1] <= 18) cur.push(xs[i]);
    else { clusters.push(cur); cur = [xs[i]]; }
  }
  clusters.push(cur);
  // الأعمدة الحقيقية = اللي فيها عدد كبير من الأرقام (مش تكة متبعثرة)
  const strong = clusters
    .map((c) => ({ min: c[0], max: c[c.length - 1], center: c[Math.floor(c.length / 2)], count: c.length }))
    .filter((c) => c.count >= Math.max(5, allTokens.length * 0.002))
    .sort((a, b) => a.center - b.center);
  if (strong.length < 2) return null;
  const codeCol = strong[strong.length - 1];              // أقصى يمين = الكود
  // الأسعار = أقصى عمودين على الشمال (تكلفة + بيع) — بنتجاهل أي أرقام في وسط الأسماء
  const priceCols = strong.filter((c) => c !== codeCol).slice(0, 2);
  return { codeCol, priceCols };
}

const inCol = (x, col) => x >= col.min - 12 && x <= col.max + 12;

export async function parsePdfProducts(file, opts = {}) {
  const knownSuppliers = new Set((opts.knownSuppliers || []).map((s) => String(s).trim()).filter(Boolean));
  const rows = await readRows(file, opts);
  const allTokens = rows.flatMap((items) => splitTokens(items));
  const cols = detectNumberColumns(allTokens); // أعمدة ثابتة على مستوى الملف (لو اتظبطت)
  const out = [];
  for (const items of rows) {
    const toks = splitTokens(items);
    const r = cols ? classifyByColumns(toks, cols) : classifyProductTokens(toks, knownSuppliers);
    if (r) out.push(r);
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = r.code || r.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// تصنيف سطر باستخدام أعمدة الملف الثابتة — بيحافظ على الأرقام اللي جوه الاسم
export function classifyByColumns(toks, cols) {
  if (!toks || !toks.some((t) => hasArabic(t.text))) return null;
  const codeTok = toks.filter((t) => isNum(t.text) && inCol(t.x, cols.codeCol)).sort((a, b) => b.x - a.x)[0];
  const code = codeTok ? codeTok.text : '';
  // الأعمدة مترتبة من الشمال لليمين (center تصاعدي): الشمال = سعر البيع (الحد الأدنى)،
  // اللي بعده = التكلفة (السعر المبدئي). في ملف السقا سعر البيع ممكن يقل عن التكلفة،
  // فبناخد الأعمدة بترتيبها (positional) مش max/min عشان الأسعار ماتتقلبش.
  const colVals = cols.priceCols.map((col) => {
    const pt = toks.filter((t) => isNum(t.text) && inCol(t.x, col)).sort((a, b) => a.x - b.x)[0];
    return pt ? toNum(pt.text) : 0;
  });
  let price = colVals[0] || 0; // عمود الشمال = سعر البيع
  let cost = colVals[1] || 0;  // العمود اللي بعده = التكلفة
  if (!price && cost) { price = cost; cost = 0; } // لو عمود واحد بس فيه قيمة، هو سعر البيع

  // عمود المورد بيقع على يمين عمود الكود تماماً (x أكبر من عمود الكود).
  // بياخد كلمة أو أكتر (زي "محمد الحداد") وأحياناً معاها رقم شارد — لازم نشيلهم كلهم من الاسم.
  const codeRightEdge = cols.codeCol.max + 12;
  const supTokens = toks.filter((t) => hasArabic(t.text) && t.x > codeRightEdge && !NOISE.includes(t.text));
  const supplier = supTokens.sort((a, b) => a.x - b.x).map((t) => t.text).join(' '); // من الشمال لليمين

  // اسم الصنف = الكلام اللي بين الأسعار والكود بس (مش المورد ولا الكود ولا الأسعار)
  const priceMaxX = cols.priceCols.length ? Math.max(...cols.priceCols.map((c) => c.max + 12)) : -Infinity;
  const nameToks = toks
    .filter((t) => {
      if (t.x > codeRightEdge) return false;                       // عمود المورد (يمين الكود) — يشمل الأرقام الشاردة
      if (isNum(t.text) && inCol(t.x, cols.codeCol)) return false;  // الكود
      if (isNum(t.text) && cols.priceCols.some((c) => inCol(t.x, c))) return false; // الأسعار
      if (t.x <= priceMaxX && isNum(t.text)) return false;         // أرقام في منطقة الأسعار
      return !NOISE.includes(t.text);
    })
    .sort((a, b) => b.x - a.x);
  const name = cleanName(nameToks.map((t) => t.text).join(' '));
  if (!name || name.length < 2) return null;
  if (!code && !price) return null;
  return { code, name, price, cost, supplier };
}

// ============ استيراد العملاء ============
// تصنيف سطر عميل (دالة نقية للاختبار): الاسم + التليفون + العنوان + رصيد افتتاحي
export function classifyCustomerTokens(toks) {
  if (!toks || !toks.length) return null;
  const phoneTok = toks.find((t) => {
    const d = t.text.replace(/[^0-9]/g, '');
    return d.length >= 9 && isPhone(d);
  });
  const phone = phoneTok ? phoneTok.text.replace(/[^0-9]/g, '') : '';

  const arTokens = toks.filter((t) => hasArabic(t.text) && !NOISE.includes(t.text));
  if (!arTokens.length) return null;
  const nameFull = cleanName(arTokens.map((t) => t.text).join(' '));
  if (!phone && arTokens.length < 2) return null; // سطر كلمة واحدة بدون تليفون = مش عميل
  if (nameFull.length < 3) return null;

  const nums = toks
    .map((t) => t.text.replace(/[^0-9.]/g, ''))
    .filter((t) => t && !isPhone(t) && Number(t) > 0)
    .map(Number);
  const balance = nums.length ? Math.max(...nums) : 0;

  // لو فيه تليفون بيفصل الاسم (يمينه) عن العنوان (شماله) — شكل [اسم | تليفون | عنوان]
  let nameParts, addrParts;
  if (phoneTok) {
    nameParts = arTokens.filter((t) => t.x >= phoneTok.x).map((t) => t.text);
    addrParts = arTokens.filter((t) => t.x < phoneTok.x).map((t) => t.text);
    if (!nameParts.length) { nameParts = arTokens.map((t) => t.text); addrParts = []; }
  } else {
    // بدون تليفون: أول 4 كلمات = اسم، الباقي = عنوان
    nameParts = arTokens.slice(0, 4).map((t) => t.text);
    addrParts = arTokens.slice(4).map((t) => t.text);
  }
  const name = cleanName(nameParts.join(' '));
  const address = cleanName(addrParts.join(' '));
  return { name, phone, address, balance };
}

export async function parsePdfCustomers(file, opts = {}) {
  const rows = await readRows(file, opts);
  const out = [];
  for (const items of rows) {
    const r = classifyCustomerTokens(splitTokens(items));
    if (r) out.push(r);
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = r.phone || r.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
