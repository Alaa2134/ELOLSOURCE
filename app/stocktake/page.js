'use client';
// جرد المخزون: عد الرف واكتب الفعلي — البرنامج بيطلع الفروقات ويعتمد الأرصدة
import { useEffect, useMemo, useState } from 'react';
import { listProducts, listStocktakes, saveStocktake, getSettings, getRole } from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';
import { confirmBox } from '@/lib/ui';

export default function StocktakePage() {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [takes, setTakes] = useState([]);
  const [actual, setActual] = useState({});
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  function reload() {
    setSettings(getSettings());
    setProducts(listProducts());
    setTakes(listStocktakes());
  }
  useEffect(reload, []);

  const counted = useMemo(
    () =>
      products
        .filter((p) => actual[p.code] !== undefined && actual[p.code] !== '')
        .map((p) => {
          const a = Number(actual[p.code]) || 0;
          const before = Number(p.stock) || 0;
          return { code: p.code, name: p.name, before, actual: a, diff: a - before, diffValue: (a - before) * (Number(p.cost) || Number(p.price) || 0) };
        }),
    [products, actual]
  );

  if (!settings) return null;
  const ar = settings.arabicDigits;
  // تخفيف: نعرض أول 200 — البحث بيوصلك لأي صنف فوراً
  const allFiltered = products.filter((p) => !q || p.name.includes(q) || String(p.code).includes(q));
  const filtered = allFiltered.slice(0, 200);
  const totalDiffValue = counted.reduce((s, x) => s + x.diffValue, 0);

  async function commit() {
    if (!counted.length) { setToast('⚠️ اكتب العدد الفعلي لصنف واحد على الأقل'); setTimeout(() => setToast(''), 3000); return; }
    if (!(await confirmBox({ title: 'اعتماد الجرد', icon: '📋', message: `هيتم تحديث أرصدة ${counted.length} صنف بالأعداد الفعلية.`, confirmText: 'اعتمد الجرد' }))) return;
    saveStocktake({
      date: todayISO(),
      items: counted,
      diffValue: totalDiffValue,
      by: getRole() === 'admin' ? 'أدمن' : 'كاشير',
    });
    setActual({});
    reload();
    setToast('✅ تم اعتماد الجرد وتحديث الأرصدة');
    setTimeout(() => setToast(''), 3500);
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>📋 جرد المخزون</h3>
          <input style={{ maxWidth: 280 }} placeholder="🔍 بحث بالاسم أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
          {allFiltered.length > filtered.length && (
            <span className="muted" style={{ fontSize: 12 }}>معروض {num(filtered.length, ar)} من {num(allFiltered.length, ar)} — ابحث توصل لأي صنف</span>
          )}
          <div style={{ marginRight: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            {counted.length > 0 && (
              <b className={totalDiffValue < 0 ? 'red-text' : 'green-text'}>
                فرق {num(counted.length, ar)} صنف بقيمة {num(Math.abs(totalDiffValue), ar)} {settings.currency} {totalDiffValue < 0 ? '(عجز)' : totalDiffValue > 0 ? '(زيادة)' : ''}
              </b>
            )}
            <button className="btn-accent" onClick={commit} disabled={!counted.length}>✅ اعتماد الجرد ({counted.length})</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>الكود</th><th>الصنف</th><th>الرصيد بالدفاتر</th><th>العدد الفعلي</th><th>الفرق</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const a = actual[p.code];
                const diff = a !== undefined && a !== '' ? (Number(a) || 0) - (Number(p.stock) || 0) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td>{num(p.stock || 0, ar)}</td>
                    <td>
                      <input type="number" min="0" step="any" style={{ width: 90, textAlign: 'center' }}
                        value={a ?? ''} placeholder="—"
                        onChange={(e) => setActual({ ...actual, [p.code]: e.target.value })} />
                    </td>
                    <td>
                      {diff === null ? <span className="muted">—</span>
                        : diff === 0 ? <span className="badge green">مظبوط</span>
                        : diff < 0 ? <span className="badge red">عجز {num(Math.abs(diff), ar)}</span>
                        : <span className="badge orange">زيادة {num(diff, ar)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>📜 الجردات السابقة</h3>
        <table className="tbl">
          <thead><tr><th>التاريخ</th><th>عدد الأصناف</th><th>قيمة الفرق</th><th>بواسطة</th></tr></thead>
          <tbody>
            {takes.slice(0, 10).map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.date, ar)}</td>
                <td>{num(t.items?.length || 0, ar)}</td>
                <td className={t.diffValue < 0 ? 'red-text' : 'green-text'}>
                  {num(Math.abs(t.diffValue || 0), ar)} {t.diffValue < 0 ? 'عجز' : t.diffValue > 0 ? 'زيادة' : ''}
                </td>
                <td>{t.by}</td>
              </tr>
            ))}
            {!takes.length && <tr><td colSpan={4} className="muted">لا توجد جردات سابقة</td></tr>}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
