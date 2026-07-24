'use client';
// قائمة اقتراح منسدلة لاختيار الصنف بالاسم أو الكود مع تنقل بالأسهم
// + سهم ▼ بيفتح الأصناف المشابهة (نفس أول كلمتين من الاسم) أو كل الأصناف
import { useEffect, useMemo, useRef, useState } from 'react';
import { num } from '@/lib/format';
import { searchProducts, similarProducts, normAr } from '@/lib/search';

// تظليل الكلمات اللي المستخدم كتبها جوه اسم الصنف — يشوف ليه الصنف ده ظهرله
function Highlight({ text, words }) {
  if (!words?.length) return text;
  const norm = normAr(text);
  const marks = new Array(text.length).fill(false);
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(w, from);
      if (at < 0) break;
      // الاسم الأصلي والمطبّع قد يختلفوا في الطول، فبنظلل تقريبياً بنفس المواضع
      for (let i = at; i < at + w.length && i < marks.length; i++) marks[i] = true;
      from = at + w.length;
    }
  }
  const parts = [];
  let cur = '', on = marks[0];
  for (let i = 0; i < text.length; i++) {
    if (marks[i] === on) cur += text[i];
    else { parts.push({ on, t: cur }); cur = text[i]; on = marks[i]; }
  }
  parts.push({ on, t: cur });
  return parts.map((p, i) => (p.on ? <mark key={i} className="pick-hit">{p.t}</mark> : <span key={i}>{p.t}</span>));
}

export default function ProductPicker({ value, products, onType, onSelect, onNavKey, dataR, dataC, arabicDigits, sortMode = 'ذكي', freq = null }) {
  const [open, setOpen] = useState(false);
  const [similar, setSimilar] = useState(false); // وضع "المشابهة" من السهم
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  const q = (value || '').trim();
  const words = useMemo(() => normAr(q).split(' ').filter(Boolean), [q]);
  const matches = useMemo(() => {
    if (similar) return similarProducts(products, q);
    if (!q) return [];
    return searchProducts(products, q, { freq, sortMode });
  }, [q, similar, products, freq, sortMode]);

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
              <span className="p-name">
                {similar ? p.name : <Highlight text={p.name} words={words} />}
              </span>
              <span className="p-meta">
                كود {p.code} — <b>{num(p.price, arabicDigits)} ج</b>
                {(Number(p.stock) || 0) <= 0
                  ? <span className="badge red" style={{ marginRight: 6 }}>نافد</span>
                  : <span className="muted" style={{ marginRight: 6 }}>مخزون {num(p.stock, arabicDigits)}</span>}
                {freq && (freq.get(String(p.code)) || 0) >= 3 && (
                  <span className="badge orange" style={{ marginRight: 6 }}>⭐ دارج</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
