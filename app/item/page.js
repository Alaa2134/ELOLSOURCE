'use client';
// تاريخ حركة الصنف: مين اشتراه وإمتى وبكام — ومنين اشتريناه وبكام
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { itemHistory, listProducts, getSettings, getRole } from '@/lib/db';
import { num, fmtDate } from '@/lib/format';
import { searchProducts } from '@/lib/search';
import { exportExcel } from '@/lib/excel';

export default function ItemHistoryPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [role, setRole] = useState('cashier');
  const [products, setProducts] = useState([]);
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setRole(getRole() || 'cashier');
    setProducts(listProducts());
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) setCode(c);
  }, []);

  const found = useMemo(() => (q.trim() ? searchProducts(products, q, { limit: 8 }) : []), [q, products]);
  const h = useMemo(() => (code ? itemHistory(code) : null), [code, products]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  // الكاشير ماينفعش يشوف التكلفة والأرباح — بيشوف تاريخ البيع بس
  const showCost = role === 'admin' || role === 'accountant';

  function pick(p) {
    setCode(String(p.code));
    setQ('');
    router.replace(`/item?code=${encodeURIComponent(p.code)}`);
  }

  return (
    <div>
      <div className="card">
        <h3>🔎 تاريخ حركة الصنف</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          اكتب اسم الصنف أو كوده، وهتشوف كل مرة اتباع فيها: مين اشتراه، إمتى، وبكام.
        </p>
        <div className="picker" style={{ maxWidth: 460 }}>
          <input
            value={q}
            placeholder="اكتب اسم الصنف أو الكود..."
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && found[0]) pick(found[0]); }}
            autoComplete="off"
          />
          {found.length > 0 && (
            <ul className="picker-list">
              {found.map((p) => (
                <li key={p.id} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                  <span className="p-name">{p.name}</span>
                  <span className="p-meta">كود {p.code} — <b>{num(p.price, ar)} {settings.currency}</b></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {h && !h.product && (
        <div className="card"><b className="red-text">مفيش صنف بالكود ده ({code})</b></div>
      )}

      {h && h.product && (
        <>
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>{h.product.name}</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              كود {h.product.code}
              {h.product.category ? ` — المورد: ${h.product.category}` : ''}
            </p>
            <div className="grid cols-4" style={{ marginTop: 12 }}>
              <div className="stat sm"><div className="label">الموجود دلوقتي</div><div className="value">{num(h.summary.stock, ar)}</div></div>
              <div className="stat sm"><div className="label">اتباع إجمالي</div><div className="value">{num(h.summary.soldQty, ar)}</div></div>
              <div className="stat sm"><div className="label">بقيمة</div><div className="value">{num(h.summary.soldValue, ar)}</div></div>
              <div className="stat sm"><div className="label">عدد العملاء</div><div className="value">{num(h.summary.customers, ar)}</div></div>
            </div>
            <div className="grid cols-4" style={{ marginTop: 10 }}>
              <div className="stat sm"><div className="label">متوسط سعر البيع</div><div className="value">{num(h.summary.avgSell, ar)}</div></div>
              <div className="stat sm">
                <div className="label">أرخص / أغلى ما اتباع</div>
                <div className="value">{num(h.summary.minSell, ar)} — {num(h.summary.maxSell, ar)}</div>
              </div>
              {showCost && <div className="stat sm"><div className="label">تكلفة الشراء الحالية</div><div className="value">{num(h.summary.cost, ar)}</div></div>}
              {showCost && (
                <div className={`stat sm ${h.summary.profit > 0 ? 'green' : h.summary.profit < 0 ? 'red' : ''}`}>
                  <div className="label">الربح المحقق</div>
                  <div className={`value ${h.summary.profit > 0 ? 'green-text' : h.summary.profit < 0 ? 'red-text' : ''}`}>
                    {h.summary.profit === null ? '—' : num(h.summary.profit, ar)}
                  </div>
                </div>
              )}
            </div>
            {showCost && h.summary.profit === null && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                💡 الربح مش محسوب لأن الصنف ده لسه متسجلش ليه سعر شراء — سجّل فاتورة شراء وهيتحسب لوحده.
              </p>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>🧾 مين اشترى الصنف ده ({num(h.sales.length, ar)} مرة)</h3>
              {h.sales.length > 0 && (
                <button className="btn-sm" onClick={() => exportExcel(
                  [['التاريخ', 'فاتورة', 'العميل', 'الكمية', 'السعر', 'الإجمالي'],
                    ...h.sales.map((s) => [fmtDate(s.date), s.number, s.customer, s.qty, s.unitNet, s.total])],
                  `حركة-${h.product.name}`
                )}>📊 Excel</button>
              )}
            </div>
            {h.sales.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>الصنف ده لسه ما اتباعش ولا مرة.</p>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>التاريخ</th><th>فاتورة</th><th>العميل</th><th>الكمية</th>
                      <th>سعر القطعة</th><th>الإجمالي</th>
                      {showCost && <th>الربح</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.sales.map((s, i) => {
                      const prof = h.summary.cost > 0 ? s.total - s.qty * h.summary.cost : null;
                      return (
                        <tr key={i}>
                          <td>{fmtDate(s.date, ar)}</td>
                          <td>{num(s.number, ar)}</td>
                          <td>{s.customer}</td>
                          <td>{num(s.qty, ar)}{s.unit === 'pack' ? ' 📦' : ''}</td>
                          <td>{num(s.unitNet, ar)}</td>
                          <td><b>{num(s.total, ar)}</b></td>
                          {showCost && (
                            <td className={prof > 0 ? 'green-text' : prof < 0 ? 'red-text' : ''}>
                              {prof === null ? '—' : num(Math.round(prof * 100) / 100, ar)}
                            </td>
                          )}
                          <td>
                            <button className="btn-sm" onClick={() => router.push(`/print/${s.id}`)}>👁️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showCost && (
            <div className="card">
              <h3>📥 اشتريناه منين ({num(h.buys.length, ar)} مرة)</h3>
              {h.buys.length === 0 ? (
                <p className="muted" style={{ marginTop: 10 }}>مفيش فواتير شراء مسجلة للصنف ده.</p>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 10 }}>
                  <table className="tbl">
                    <thead>
                      <tr><th>التاريخ</th><th>فاتورة شراء</th><th>المورد</th><th>الكمية</th><th>سعر الشراء</th><th>الإجمالي</th></tr>
                    </thead>
                    <tbody>
                      {h.buys.map((b, i) => (
                        <tr key={i}>
                          <td>{fmtDate(b.date, ar)}</td>
                          <td>{num(b.number, ar)}</td>
                          <td>{b.supplier}</td>
                          <td>{num(b.qty, ar)}</td>
                          <td>{num(b.cost, ar)}</td>
                          <td><b>{num(Math.round(b.qty * b.cost * 100) / 100, ar)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
