'use client';
// قائمة اقتراح منسدلة لاختيار الصنف بالاسم أو الكود مع تنقل بالأسهم
import { useEffect, useRef, useState } from 'react';
import { num } from '@/lib/format';

export default function ProductPicker({ value, products, onType, onSelect, onNavKey, dataR, dataC, arabicDigits }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  const q = (value || '').trim();
  const matches = q
    ? products
        .filter((p) => p.name.includes(q) || String(p.code).includes(q))
        .slice(0, 8)
    : [];

  useEffect(() => setHi(0), [q]);

  function pick(p) {
    setOpen(false);
    onSelect(p);
  }

  function onKeyDown(e) {
    if (open && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter') { e.preventDefault(); pick(matches[hi]); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
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
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="picker-list">
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
