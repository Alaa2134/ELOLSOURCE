'use client';
// طباعة استيكرات باركود للأصناف
import { useEffect, useState } from 'react';
import { listProducts, getSettings } from '@/lib/db';
import { num } from '@/lib/format';

export default function BarcodesPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [labels, setLabels] = useState([]); // {product, count}
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    setProducts(listProducts());
    setSettings(getSettings());
  }, []);

  // رسم الباركود بعد كل تعديل في القائمة
  useEffect(() => {
    if (!labels.length) return;
    (async () => {
      const JsBarcode = (await import('jsbarcode')).default;
      document.querySelectorAll('.bc-svg').forEach((el) => {
        try {
          JsBarcode(el, el.dataset.code, {
            format: 'CODE128',
            width: 1.6,
            height: 34,
            fontSize: 12,
            margin: 0,
            displayValue: true,
          });
        } catch { /* كود غير صالح */ }
      });
    })();
  }, [labels, showPrice]);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const filtered = q
    ? products.filter((p) => p.name.includes(q) || String(p.code).includes(q)).slice(0, 10)
    : [];

  function addLabel(p) {
    setLabels((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return prev.map((l, li) => (li === i ? { ...l, count: l.count + 1 } : l));
      return [...prev, { product: p, count: 12 }];
    });
    setQ('');
  }

  const allStickers = labels.flatMap((l) => Array.from({ length: l.count }, () => l.product));

  return (
    <div>
      <div className="card no-print">
        <h3>🏷️ طباعة استيكر باركود</h3>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <input placeholder="🔍 ابحث عن صنف لإضافته..." value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length > 0 && (
            <ul className="picker-list">
              {filtered.map((p) => (
                <li key={p.id} onMouseDown={() => addLabel(p)}>
                  <span className="p-name">{p.name}</span>
                  <span className="p-meta">كود {p.code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {labels.length > 0 && (
          <>
            <table className="tbl" style={{ marginTop: 12, maxWidth: 600 }}>
              <thead><tr><th>الصنف</th><th>عدد الاستيكرات</th><th></th></tr></thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={l.product.id}>
                    <td>{l.product.name}</td>
                    <td>
                      <input type="number" min="1" style={{ width: 80 }} value={l.count}
                        onChange={(e) => setLabels(labels.map((x, xi) => xi === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x))} />
                    </td>
                    <td><button className="btn-sm btn-red" onClick={() => setLabels(labels.filter((_, xi) => xi !== i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
              <button className="btn-accent" onClick={() => window.print()}>🖨️ طباعة ({allStickers.length} استيكر)</button>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                إظهار السعر على الاستيكر
              </label>
            </div>
          </>
        )}
      </div>

      <div className="sticker-sheet">
        {allStickers.map((p, i) => (
          <div className="sticker" key={i}>
            <div className="s-co">{settings.companyName}</div>
            <div className="s-name">{p.name}</div>
            <svg className="bc-svg" data-code={String(p.barcode || p.code)}></svg>
            {showPrice && <div className="s-price">{num(p.price, ar)} {settings.currency}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
