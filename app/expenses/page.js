'use client';
// المصاريف اليومية: أكل، انتقالات، نثريات... بالأيام والأسماء
import { useEffect, useMemo, useState } from 'react';
import { listExpenses, saveExpense, deleteExpense, getSettings, isAdmin, getRole } from '@/lib/db';
import { num, fmtDate, todayISO } from '@/lib/format';
import { dangerBox } from '@/lib/ui';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CATS = ['أكل', 'انتقالات', 'شحن وتوصيل', 'كهرباء ومياه', 'صيانة', 'نثريات', 'أخرى'];

export default function ExpensesPage() {
  const [settings, setSettings] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [desc, setDesc] = useState('أكل');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [toast, setToast] = useState('');

  function reload() {
    setSettings(getSettings());
    setExpenses(listExpenses());
  }
  useEffect(() => {
    reload();
    const d = new Date();
    setFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    setTo(dayKey(d.toISOString()));
  }, []);

  const filtered = useMemo(
    () =>
      expenses.filter((x) => {
        const k = dayKey(x.date);
        return (!from || k >= from) && (!to || k <= to);
      }),
    [expenses, from, to]
  );

  // تجميع باليوم
  const byDay = useMemo(() => {
    const g = {};
    for (const x of filtered) {
      const k = dayKey(x.date);
      g[k] = g[k] || [];
      g[k].push(x);
    }
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const total = filtered.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  function add(e) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (!desc || amt <= 0) { setToast('⚠️ اكتب البيان والمبلغ'); setTimeout(() => setToast(''), 3000); return; }
    saveExpense({ date: todayISO(), desc, name, amount: amt, notes, by: getRole() === 'admin' ? 'أدمن' : getRole() === 'accountant' ? 'محاسب' : 'كاشير' });
    setAmount('');
    setName('');
    setNotes('');
    reload();
    setToast('✅ تم تسجيل المصروف');
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div>
      <div className="card">
        <h3>💸 تسجيل مصروف جديد</h3>
        <form onSubmit={add} className="grid cols-4" style={{ alignItems: 'end' }}>
          <label className="field">
            <span>البيان</span>
            <input list="exp-cats" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <datalist id="exp-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">
            <span>الاسم (مين صرف / لمين)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اختياري" />
          </label>
          <label className="field">
            <span>المبلغ</span>
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button className="btn-green">💾 تسجيل</button>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
          <label className="field"><span>من</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>إلى</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="stat orange" style={{ marginRight: 'auto', padding: '8px 16px' }}>
            <div className="label">إجمالي مصاريف الفترة</div>
            <div className="value" style={{ fontSize: 20 }}>{num(total, ar)} {settings.currency}</div>
          </div>
        </div>

        {byDay.map(([k, items]) => {
          const dayTotal = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
          return (
            <div key={k} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, background: '#f4f7fa', padding: '6px 12px', borderRadius: 8, marginBottom: 4, alignItems: 'center' }}>
                <b>📅 {fmtDate(k, ar)}</b>
                <span className="badge orange" style={{ marginRight: 'auto' }}>{num(dayTotal, ar)} {settings.currency}</span>
              </div>
              <table className="tbl">
                <thead><tr><th>البيان</th><th>الاسم</th><th>المبلغ</th><th>سجّله</th><th></th></tr></thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id}>
                      <td><b>{x.desc}</b>{x.notes ? <span className="muted"> — {x.notes}</span> : ''}</td>
                      <td>{x.name || '—'}</td>
                      <td className="red-text">{num(x.amount, ar)}</td>
                      <td><span className="badge blue">{x.by || '—'}</span></td>
                      <td>
                        {isAdmin() && (
                          <button className="btn-sm btn-red" onClick={async () => { if (await dangerBox('حذف المصروف ده؟')) { deleteExpense(x.id); reload(); } }}>🗑️</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {!byDay.length && <p className="muted">لا توجد مصاريف في الفترة دي</p>}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
