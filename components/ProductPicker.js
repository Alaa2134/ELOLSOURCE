'use client';
// قائمة اقتراح منسدلة لاختيار الصنف بالاسم أو الكود مع تنقل بالأسهم
// + سهم ▼ بيفتح الأصناف المشابهة (نفس أول كلمتين من الاسم) أو كل الأصناف
import { useEffect, useRef, useState } from 'react';
import { num } from '@/lib/format';

export default function ProductPicker({ value, products, onType, onSelect, onNavKey, dataR, dataC, arabicDigits }) {
  const [open, setOpen] = useState(false);
  const [similar, setSimilar] = useState(false); // وضع "المشابهة" من السهم
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  const q = (value || '').trim();
  let matches = [];
  if (similar) {
    // الأصناف المشابهة: نفس بداية الاسم — ولو الخانة فاضية نعرض من الأول
    const base = q.split(' ').slice(0, 2).join(' ');
    matches = (base ? products.filter((p) => p.name.includes(base)) : products).slice(0, 12);
    if (base && matches.length <= 1) {
      const firstWord = q.split(' ')[0];
      matches = products.filter((p) => p.name.includes(firstWord)).slice(0, 12);
    }
  } else if (q) {
    // ترتيب ذكي مع كل حرف: اللي بيبدأ بالمكتوب الأول، بعدين بداية كلمة، بعدين الكود، بعدين أي تطابق
    const score = (p) => {
      if (p.name.startsWith(q)) return 0;
      if (p.name.includes(' ' + q)) return 1;
      if (String(p.code).startsWith(q)) return 2;
      if (p.name.includes(q)) return 3;
      if (String(p.code).includes(q)) return 4;
      return 9;
    };
    matches = products
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s < 9)
      .sort((a, b) => a.s - b.s || a.p.name.length - b.p.name.length || a.p.name.localeCompare(b.p.name))
      .slice(0, 10)
      .map((x) => x.p);
  }

  useEffect(() => setHi(0), [q, similar]);

  function pick(p) {
    setOpen(false);
    setSimilar(false);
    onSelect(p);
  }

  function onKeyDown(e) {
    if (open && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter') { e.preventDefault(); pick(matches[hi]); return; }
      if (e.key === 'Escape') { setOpen(false); setSimilar(false); return; }
    }
    onNavKey?.(e);
  }

  return (
    <div className="picker" ref={boxRef}>
      <input
        data-r={dataR}
        data-c={dataC}
        value={value}
        placeholder="اكتب اسم الصنف أو الكود..."
        onChange={(e) => { onType(e.target.value); setSimilar(false); setOpen(true); }}
        onFocus={() => q && !similar && setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setSimilar(false); }, 150)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        style={{ paddingLeft: 26 }}
      />
      <button
        type="button"
        tabIndex={-1}
        className="picker-arrow"
        title="عرض الأصناف المشابهة"
        onMouseDown={(e) => {
          e.preventDefault(); // عشان الفوكس ميقفلش القائمة
          if (open && similar) { setOpen(false); setSimilar(false); }
          else { setSimilar(true); setOpen(true); }
        }}
      >
        ▼
      </button>
      {open && matches.length > 0 && (
        <ul className="picker-list">
          {similar && (
            <li className="picker-head">
              {q ? `🔎 أصناف مشابهة لـ "${q.split(' ').slice(0, 2).join(' ')}"` : '📦 كل الأصناف'}
            </li>
          )}
          {matches.map((p, i) => (
            <li
              key={p.id}
              className={i === hi ? 'hi' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setHi(i)}
            >
              <span className="p-name">{p.name}</span>
              <span className="p-meta">
                كود {p.code} — <b>{num(p.price, arabicDigits)} ج</b>
                {(Number(p.stock) || 0) <= 0 && <span className="badge red" style={{ marginRight: 6 }}>نافد</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
