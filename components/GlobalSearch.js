'use client';
// بحث سريع موحّد: فاتورة (بالرقم) أو عميل أو صنف — من أي مكان في البرنامج
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listInvoices, listCustomers, listProducts } from '@/lib/db';

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const out = [];
    // فاتورة بالرقم
    for (const inv of listInvoices()) {
      if (String(inv.number).includes(t)) {
        out.push({ type: 'فاتورة', icon: '🧾', label: `فاتورة ${inv.number}`, sub: inv.customer?.name || 'عميل نقدي', href: `/print/${inv.id}` });
      }
      if (out.length >= 6) break;
    }
    // عميل بالاسم أو الهاتف
    for (const c of listCustomers()) {
      if (c.name.includes(t) || (c.phone || '').includes(t)) {
        out.push({ type: 'عميل', icon: '👤', label: c.name, sub: c.phone || 'بدون هاتف', href: `/statement?name=${encodeURIComponent(c.name)}` });
      }
      if (out.length >= 12) break;
    }
    // صنف بالاسم أو الكود
    for (const p of listProducts()) {
      if (p.name.includes(t) || String(p.code).includes(t)) {
        out.push({ type: 'صنف', icon: '📦', label: p.name, sub: `كود ${p.code} — ${p.price} ج`, href: `/products?q=${encodeURIComponent(p.code)}` });
      }
      if (out.length >= 18) break;
    }
    return out.slice(0, 18);
  }, [q]);

  function go(r) {
    setQ('');
    setOpen(false);
    router.push(r.href);
  }

  function onKey(e) {
    if (!open || !results.length) {
      if (e.key === 'Enter' && q.trim()) {
        // Enter من غير قائمة: لو رقم بس دوّر فاتورة
        const inv = listInvoices().find((x) => String(x.number) === q.trim());
        if (inv) go({ href: `/print/${inv.id}` });
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[hi]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="gsearch" ref={boxRef}>
      <input
        className="printer-select"
        style={{ minWidth: 200 }}
        placeholder="🔍 دوّر على فاتورة / عميل / صنف"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onKeyDown={onKey}
      />
      {open && results.length > 0 && (
        <ul className="gsearch-list">
          {results.map((r, i) => (
            <li key={i} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); go(r); }} onMouseEnter={() => setHi(i)}>
              <span className="gs-icon">{r.icon}</span>
              <span className="gs-main">
                <b>{r.label}</b>
                <small>{r.sub}</small>
              </span>
              <span className="gs-type">{r.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
