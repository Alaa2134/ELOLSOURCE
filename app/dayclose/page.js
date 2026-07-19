'use client';
// إقفال اليومية: مقارنة كاش الدرج الفعلي بالمفروض وتسجيل العجز/الزيادة
import { useEffect, useMemo, useState } from 'react';
import { listInvoices, listPayments, listExpenses, listDayCloses, saveDayClose, getSettings, getRole } from '@/lib/db';
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
  const [notes, setNotes] = useState('');
  const [closes, setCloses] = useState([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setDay(dayKey(new Date().toISOString()));
    setCloses(listDayCloses());
  }, []);

  const stats = useMemo(() => {
    if (!day) return null;
    const invs = listInvoices().filter((i) => dayKey(i.date) === day);
    const pays = listPayments().filter((p) => dayKey(p.date) === day);
    const exps = listExpenses().filter((x) => dayKey(x.date) === day);
    const cashInvoices = invs.reduce((s, i) => s + (Number(i.totals?.paid) || 0), 0);
    const cashPayments = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const expensesTotal = exps.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const sales = invs.reduce((s, i) => s + (Number(i.totals?.net) || 0), 0);
    return {
      invCount: invs.length,
      payCount: pays.length,
      sales,
      cashInvoices,
      cashPayments,
      expensesTotal,
      expected: cashInvoices + cashPayments - expensesTotal,
    };
  }, [day, closes]);

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
          <div className="pos-totals" style={{ marginBottom: 12 }}>
            <div className="row"><span>عدد الفواتير</span><b>{num(stats.invCount, ar)}</b></div>
            <div className="row"><span>إجمالي المبيعات</span><b>{num(stats.sales, ar)} {settings.currency}</b></div>
            <div className="row"><span>المحصل من الفواتير</span><b>{num(stats.cashInvoices, ar)}</b></div>
            <div className="row"><span>المحصل من سندات القبض</span><b>{num(stats.cashPayments, ar)}</b></div>
            <div className="row"><span>مصاريف اليوم (بتتخصم)</span><b className="red-text">−{num(stats.expensesTotal, ar)}</b></div>
            <div className="row big"><span>المفروض في الدرج</span><span>{num(stats.expected, ar)} {settings.currency}</span></div>
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
