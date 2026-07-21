'use client';
// 🧮 برنامج المحاسب — شاشة واحدة فيها كل شغله اليومي
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listInvoices,
  listCustomers,
  listPayments,
  listExpenses,
  savePayment,
  saveExpense,
  nextPaymentNumber,
  customerDebt,
  saveInvoice,
  getSettings,
  getRole,
} from '@/lib/db';
import { num, fmtDate, fmtTime, todayISO } from '@/lib/format';
import { promptBox } from '@/lib/ui';
import { waMeLink, buildMessage } from '@/lib/wa';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AccountantPage() {
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState(null);
  const [toast, setToast] = useState('');
  // سند قبض سريع
  const [payName, setPayName] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [lastPay, setLastPay] = useState(null);
  // مصروف سريع
  const [expDesc, setExpDesc] = useState('أكل');
  const [expAmount, setExpAmount] = useState('');

  function reload() {
    const s = getSettings();
    const invoices = listInvoices();
    const customers = listCustomers();
    const payments = listPayments();
    const today = dayKey(new Date().toISOString());

    const repOpen = invoices.filter((i) => i.rep && (i.totals?.remaining || 0) > 0);
    const repTotal = repOpen.reduce((x, i) => x + i.totals.remaining, 0);
    const todayCollected =
      invoices.filter((i) => dayKey(i.date) === today && i.type !== 'مرتجع').reduce((x, i) => x + (i.totals?.paid || 0), 0) +
      payments.filter((p) => dayKey(p.date) === today).reduce((x, p) => x + (Number(p.amount) || 0), 0);
    const todayExpenses = listExpenses().filter((e) => dayKey(e.date) === today).reduce((x, e) => x + (Number(e.amount) || 0), 0);

    const debtors = customers
      .map((c) => ({ ...c, debt: customerDebt(c.name) }))
      .filter((c) => c.debt > 0)
      .sort((a, b) => b.debt - a.debt);
    const totalDebt = debtors.reduce((x, c) => x + c.debt, 0);

    const moves = [
      ...invoices.filter((i) => dayKey(i.date) === today).map((i) => ({
        at: i.date,
        desc: i.type === 'مرتجع' ? `↩️ مرتجع ${i.number} — ${i.customer?.name}` : `🧾 فاتورة ${i.number} — ${i.customer?.name}${i.rep ? ` (🛵 ${i.rep})` : ''}`,
        amount: (i.type === 'مرتجع' ? -1 : 1) * (i.totals?.net || 0),
      })),
      ...payments.filter((p) => dayKey(p.date) === today).map((p) => ({
        at: p.date,
        desc: `💵 سند ${p.number} — ${p.customerName}`,
        amount: Number(p.amount) || 0,
      })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    setSettings(s);
    setData({ repOpen, repTotal, todayCollected, todayExpenses, debtors, totalDebt, moves, customers });
  }
  useEffect(reload, []);

  if (!settings || !data) return null;
  const ar = settings.arabicDigits;

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  }

  const payDebt = payName ? customerDebt(payName) : 0;

  function quickPay() {
    const amt = Number(payAmount) || 0;
    if (!payName || amt <= 0) { showToast('⚠️ اختر العميل واكتب المبلغ'); return; }
    const p = savePayment({
      number: nextPaymentNumber(),
      date: todayISO(),
      customerName: payName,
      phone: data.customers.find((c) => c.name === payName)?.phone || '',
      amount: amt,
      method: 'نقدي',
      notes: 'سند سريع — لوحة المحاسب',
      debtBefore: payDebt,
      debtAfter: Math.max(0, payDebt - amt),
    });
    setLastPay(p);
    setPayAmount('');
    reload();
    showToast(`✅ سند ${p.number} — اتحصل ${num(amt)} من ${payName}`);
  }

  function quickExpense() {
    const amt = Number(expAmount) || 0;
    if (!expDesc || amt <= 0) { showToast('⚠️ اكتب البيان والمبلغ'); return; }
    saveExpense({ date: todayISO(), desc: expDesc, name: '', amount: amt, notes: '', by: 'محاسب' });
    setExpAmount('');
    reload();
    showToast(`✅ اتسجل مصروف ${expDesc} — ${num(amt)}`);
  }

  async function collectRep(inv) {
    const remaining = inv.totals?.remaining || 0;
    const val = await promptBox({
      title: `تحصيل من ${inv.rep}`, icon: '🛵',
      message: `فاتورة ${inv.number} (${inv.customer?.name})\nالمتبقي: ${num(remaining)}\nالمبلغ المستلم:`,
      default: String(remaining), confirmText: 'حصّل',
    });
    if (val === null) return;
    const amount = Number(val) || 0;
    if (amount <= 0) return;
    savePayment({
      number: nextPaymentNumber(),
      date: todayISO(),
      customerName: inv.customer?.name,
      phone: inv.customer?.phone || '',
      amount,
      method: 'نقدي',
      notes: `تحصيل عن طريق المندوب ${inv.rep} — فاتورة ${inv.number}`,
      targetInvoiceId: inv.id,
      debtBefore: remaining,
      debtAfter: Math.max(0, remaining - amount),
    });
    const updated = listInvoices().find((x) => x.id === inv.id);
    if (updated) {
      saveInvoice({ ...updated, repStatus: (updated.totals?.remaining || 0) <= 0 ? 'تم التحصيل' : 'تحصيل جزئي' });
    }
    reload();
    showToast(`✅ اتحصل ${num(amount)} من المندوب ${inv.rep}`);
  }

  function reminderLink(c) {
    const msg = buildMessage(settings.debtReminder.template, {
      name: c.name,
      currency: settings.currency,
      company: settings.companyName,
    }).replaceAll('{debt}', num(c.debt));
    return waMeLink(c.phone, msg);
  }

  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat red">
          <div className="label">🛵 فلوس برة مع المندوبين</div>
          <div className="value">{num(data.repTotal, ar)}</div>
          <div className="sub">{num(data.repOpen.length, ar)} فاتورة لسه متحصلتش</div>
        </div>
        <div className="stat green">
          <div className="label">💵 المحصل النهارده</div>
          <div className="value">{num(data.todayCollected, ar)}</div>
          <div className="sub">{settings.currency}</div>
        </div>
        <div className="stat orange">
          <div className="label">💸 مصاريف النهارده</div>
          <div className="value">{num(data.todayExpenses, ar)}</div>
          <div className="sub">{settings.currency}</div>
        </div>
        <div className="stat">
          <div className="label">📕 إجمالي مديونيات العملاء</div>
          <div className="value">{num(data.totalDebt, ar)}</div>
          <div className="sub">{num(data.debtors.length, ar)} عميل مديون</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <h3>🛵 تحصيل من المندوبين</h3>
            <table className="tbl">
              <thead><tr><th>المندوب</th><th>فاتورة</th><th>العميل</th><th>المتبقي</th><th></th></tr></thead>
              <tbody>
                {data.repOpen.slice(0, 6).map((i) => (
                  <tr key={i.id}>
                    <td><b>🛵 {i.rep}</b></td>
                    <td>{num(i.number, ar)}</td>
                    <td>{i.customer?.name}</td>
                    <td className="red-text">{num(i.totals.remaining, ar)}</td>
                    <td><button className="btn-sm btn-green" onClick={() => collectRep(i)}>💵 تحصيل</button></td>
                  </tr>
                ))}
                {!data.repOpen.length && <tr><td colSpan={5} className="muted">مفيش فلوس برة مع مندوبين ✅</td></tr>}
              </tbody>
            </table>
            {data.repOpen.length > 6 && (
              <Link href="/reps" className="btn btn-sm btn-primary" style={{ marginTop: 8 }}>
                عرض الكل ({num(data.repOpen.length, ar)}) ←
              </Link>
            )}
          </div>

          <div className="card">
            <h3>📕 أكبر العملاء المديونين</h3>
            <table className="tbl">
              <thead><tr><th>العميل</th><th>المديونية</th><th>إجراءات</th></tr></thead>
              <tbody>
                {data.debtors.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td><span className="badge red">{num(c.debt, ar)} {settings.currency}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {c.phone && (
                        <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={reminderLink(c)} title="تذكير واتساب">💬 تذكير</a>
                      )}
                      <Link className="btn btn-sm" href={`/statement?name=${encodeURIComponent(c.name)}`}>📄 كشف</Link>
                    </td>
                  </tr>
                ))}
                {!data.debtors.length && <tr><td colSpan={3} className="muted">مفيش مديونيات ✅</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>💵 سند قبض سريع</h3>
            <div className="grid" style={{ gap: 8 }}>
              <input list="acc-customers" placeholder="اسم العميل..." value={payName} onChange={(e) => { setPayName(e.target.value); setLastPay(null); }} />
              <datalist id="acc-customers">
                {data.debtors.map((c) => <option key={c.id} value={c.name}>{`عليه ${num(c.debt)} ج`}</option>)}
                {data.customers.filter((c) => !data.debtors.find((d) => d.id === c.id)).map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
              {payName && (
                <div className={payDebt > 0 ? 'debt-alert' : 'debt-alert ok'} style={{ marginBottom: 0 }}>
                  {payDebt > 0 ? <>عليه: <b>{num(payDebt, ar)} {settings.currency}</b></> : <>مفيش عليه مديونية</>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" min="0" step="any" placeholder="المبلغ المستلم" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <button className="btn-green" onClick={quickPay}>💾 تحصيل</button>
              </div>
              {lastPay && (
                <Link className="btn btn-primary" style={{ justifyContent: 'center' }} href={`/payments/print/${lastPay.id}`}>
                  🖨️ طباعة سند {num(lastPay.number, ar)}
                </Link>
              )}
            </div>
          </div>

          <div className="card">
            <h3>💸 مصروف سريع</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input list="acc-exp" style={{ flex: 1 }} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
              <datalist id="acc-exp">
                {['أكل', 'انتقالات', 'شحن وتوصيل', 'نثريات', 'صيانة'].map((c) => <option key={c} value={c} />)}
              </datalist>
              <input type="number" min="0" step="any" style={{ width: 110 }} placeholder="المبلغ" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
              <button className="btn-accent" onClick={quickExpense}>💾</button>
            </div>
          </div>

          <div className="card">
            <h3>🕐 حركة النهارده</h3>
            <table className="tbl">
              <thead><tr><th>الوقت</th><th>البيان</th><th>المبلغ</th></tr></thead>
              <tbody>
                {data.moves.slice(0, 10).map((m, i) => (
                  <tr key={i}>
                    <td>{fmtTime(m.at, ar)}</td>
                    <td>{m.desc}</td>
                    <td className={m.amount < 0 ? 'red-text' : ''}>{num(Math.abs(m.amount), ar)}</td>
                  </tr>
                ))}
                {!data.moves.length && <tr><td colSpan={3} className="muted">مفيش حركة النهارده لسه</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>⚡ اختصارات</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" href="/dayclose">🧮 إقفال اليومية</Link>
              <Link className="btn" href="/reports">📈 التقارير</Link>
              <Link className="btn" href="/purchases">📥 المشتريات</Link>
              <Link className="btn" href="/audit">📜 سجل العمليات</Link>
            </div>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
