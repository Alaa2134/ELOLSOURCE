'use client';
// إقفال اليومية: مقارنة كاش الدرج الفعلي بالمفروض وتسجيل العجز/الزيادة
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, listPayments, listExpenses, listPurchases, listDayCloses, saveDayClose, getSettings, getRole } from '@/lib/db';
import { num, fmtDate } from '@/lib/format';
import { notifyAdmin } from '@/lib/wa';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DayClosePage() {
  const [settings, setSettings] = useState(null);
  const [day, setDay] = useState('');
  const [actual, setActual] = useState('');
  const [opening, setOpening] = useState(''); // رصيد افتتاحي (من إقفال امبارح)
  const [withdraw, setWithdraw] = useState(''); // سحب نقدي من الدرج (صاحب المحل أخد)
  const [deposit, setDeposit] = useState(''); // إيداع نقدي في الدرج (فكة مثلاً)
  const [notes, setNotes] = useState('');
  const [closes, setCloses] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setDay(dayKey(new Date().toISOString()));
    setCloses(listDayCloses());
  }, []);

  // الرصيد الافتتاحي = الكاش الفعلي اللي اتعد آخر إقفال قبل اليوم ده (بيتحمّل تلقائياً)
  useEffect(() => {
    if (!day) return;
    const prev = closes.filter((c) => c.day < day).sort((a, b) => b.day.localeCompare(a.day))[0];
    setOpening(prev && prev.actual != null ? String(prev.actual) : '');
  }, [day, closes]);

  const stats = useMemo(() => {
    if (!day) return null;
    const invs = listInvoices().filter((i) => dayKey(i.date) === day);
    const pays = listPayments().filter((p) => dayKey(p.date) === day);
    const exps = listExpenses().filter((x) => dayKey(x.date) === day);
    const purs = listPurchases().filter((p) => dayKey(p.date) === day);
    const cashInvoices = invs.reduce((s, i) => s + (Number(i.totals?.paid) || 0), 0);
    const cashPayments = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const expensesTotal = exps.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const supplierCash = purs.reduce((s, p) => s + (Number(p.totals?.paid) || 0), 0);
    const sales = invs.reduce((s, i) => s + (Number(i.totals?.net) || 0), 0);
    const openN = Number(opening) || 0, wN = Number(withdraw) || 0, dN = Number(deposit) || 0;
    return {
      invCount: invs.length, payCount: pays.length, sales,
      cashInvoices, cashPayments, expensesTotal, supplierCash,
      expected: openN + cashInvoices + cashPayments + dN - expensesTotal - supplierCash - wN,
    };
  }, [day, closes, opening, withdraw, deposit]);

  if (!settings || !stats) return null;
  const ar = settings.arabicDigits;
  const actualNum = Number(actual) || 0;
  const diff = actualNum - stats.expected;

  function close() {
    if (actual === '') { setToast('⚠️ اكتب الكاش الفعلي اللي في الدرج'); setTimeout(() => setToast(''), 3000); return; }
    saveDayClose({
      day,
      invCount: stats.invCount,
      sales: stats.sales,
      opening: Number(opening) || 0,
      cashInvoices: stats.cashInvoices,
      cashPayments: stats.cashPayments,
      supplierCash: stats.supplierCash,
      withdraw: Number(withdraw) || 0,
      deposit: Number(deposit) || 0,
      expenses: stats.expensesTotal,
      expected: stats.expected,
      actual: actualNum,
      diff,
      notes,
      by: getRole() === 'admin' ? 'أدمن' : 'كاشير',
      closedAt: new Date().toISOString(),
    });
    if (diff !== 0) {
      notifyAdmin(`🧮 إقفال يومية ${day}: المفروض ${stats.expected.toFixed(2)} — الفعلي ${actualNum.toFixed(2)} — ${diff < 0 ? 'عجز' : 'زيادة'} ${Math.abs(diff).toFixed(2)}${notes ? `\nملاحظات: ${notes}` : ''}`);
    }
    setCloses(listDayCloses());
    setActual('');
    setNotes('');
    setToast('✅ تم إقفال اليومية وتسجيلها');
    setTimeout(() => setToast(''), 3000);
  }

  const existing = closes.find((c) => c.day === day);

  return (
    <div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>🧮 إقفال يومية</h3>
          <label className="field" style={{ marginBottom: 12 }}>
            <span>اليوم</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 10 }}>
            <span>رصيد افتتاحي في الدرج (من إقفال امبارح — تقدر تعدّله)</span>
            <input type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </label>
          <div className="pos-totals" style={{ marginBottom: 12 }}>
            <div className="row"><span>رصيد افتتاحي</span><b>{num(Number(opening) || 0, ar)}</b></div>
            <div className="row"><span>+ محصّل الفواتير ({num(stats.invCount, ar)})</span><b className="green-text">+{num(stats.cashInvoices, ar)}</b></div>
            <div className="row"><span>+ محصّل سندات القبض</span><b className="green-text">+{num(stats.cashPayments, ar)}</b></div>
            {Number(deposit) > 0 && <div className="row"><span>+ إيداع نقدي</span><b className="green-text">+{num(Number(deposit), ar)}</b></div>}
            <div className="row"><span>− مصاريف اليوم</span><b className="red-text">−{num(stats.expensesTotal, ar)}</b></div>
            {stats.supplierCash > 0 && <div className="row"><span>− مدفوع للموردين نقدي</span><b className="red-text">−{num(stats.supplierCash, ar)}</b></div>}
            {Number(withdraw) > 0 && <div className="row"><span>− سحب من الدرج</span><b className="red-text">−{num(Number(withdraw), ar)}</b></div>}
            <div className="row big"><span>المفروض في الدرج</span><span>{num(stats.expected, ar)} {settings.currency}</span></div>
          </div>
          <div className="grid cols-2" style={{ gap: 8, marginBottom: 10 }}>
            <label className="field"><span>سحب نقدي من الدرج</span>
              <input type="number" min="0" step="any" value={withdraw} onChange={(e) => setWithdraw(e.target.value)} placeholder="0" /></label>
            <label className="field"><span>إيداع نقدي (فكة مثلاً)</span>
              <input type="number" min="0" step="any" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" /></label>
          </div>
          <label className="field" style={{ marginBottom: 10 }}>
            <span>الكاش الفعلي اللي اتعد في الدرج</span>
            <input type="number" min="0" step="any" value={actual} onChange={(e) => setActual(e.target.value)} />
          </label>
          {actual !== '' && (
            <div className={diff === 0 ? 'debt-alert ok' : 'debt-alert'} style={{ marginBottom: 10 }}>
              {diff === 0 && <>✅ الدرج مظبوط بالمليم 👌</>}
              {diff < 0 && <>⚠️ عجز في الدرج: <b>{num(Math.abs(diff), ar)} {settings.currency}</b></>}
              {diff > 0 && <>💰 زيادة في الدرج: <b>{num(diff, ar)} {settings.currency}</b></>}
            </div>
          )}
          <label className="field" style={{ marginBottom: 12 }}>
            <span>ملاحظات (سبب العجز/الزيادة لو معروف)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button className="btn-accent" onClick={close}>🔒 إقفال اليومية</button>
          {existing && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              ℹ️ اليوم ده متقفل قبل كده — الحفظ هيحدّث الإقفال.
            </p>
          )}
        </div>

        <div className="card">
          <h3>📜 الإقفالات السابقة</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th>اليوم</th><th>المفروض</th><th>الفعلي</th><th>الفرق</th><th>بواسطة</th></tr>
              </thead>
              <tbody>
                {closes.slice(0, 20).map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate(c.day, ar)}</td>
                    <td>{num(c.expected, ar)}</td>
                    <td>{num(c.actual, ar)}</td>
                    <td>
                      {c.diff === 0
                        ? <span className="badge green">مظبوط</span>
                        : c.diff < 0
                          ? <span className="badge red">عجز {num(Math.abs(c.diff), ar)}</span>
                          : <span className="badge orange">زيادة {num(c.diff, ar)}</span>}
                    </td>
                    <td>{c.by}</td>
                  </tr>
                ))}
                {!closes.length && <tr><td colSpan={5} className="muted">لا توجد إقفالات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
