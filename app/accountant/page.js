'use client';
// 🧮 شاشة المحاسب — مبسّطة: خطوات واضحة وأزرار كبيرة، والاختيار بالضغط مش بالكتابة
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listInvoices, listCustomers, listPayments, listExpenses,
  savePayment, saveExpense, nextPaymentNumber, customerDebt, saveInvoice,
  getSettings,
} from '@/lib/db';
import { num, fmtTime, todayISO } from '@/lib/format';
import { promptBox } from '@/lib/ui';
import { waMeLink, buildMessage } from '@/lib/wa';

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const EXP_KINDS = ['أكل', 'انتقالات', 'شحن وتوصيل', 'نثريات', 'صيانة', 'كهربا ومياه'];

export default function AccountantPage() {
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState(null);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('collect'); // collect | expense
  // تحصيل
  const [payName, setPayName] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [search, setSearch] = useState('');
  const [lastPay, setLastPay] = useState(null);
  // مصروف
  const [expDesc, setExpDesc] = useState('');
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

    const debtors = customers.map((c) => ({ ...c, debt: customerDebt(c.name) }))
      .filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
    const totalDebt = debtors.reduce((x, c) => x + c.debt, 0);

    const moves = [
      ...invoices.filter((i) => dayKey(i.date) === today).map((i) => ({
        at: i.date,
        desc: i.type === 'مرتجع' ? `↩️ مرتجع ${i.number} — ${i.customer?.name}` : `🧾 فاتورة ${i.number} — ${i.customer?.name}`,
        amount: (i.type === 'مرتجع' ? -1 : 1) * (i.totals?.net || 0),
      })),
      ...payments.filter((p) => dayKey(p.date) === today).map((p) => ({
        at: p.date, desc: `💵 سند ${p.number} — ${p.customerName}`, amount: Number(p.amount) || 0,
      })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    setSettings(s);
    setData({ repOpen, repTotal, todayCollected, todayExpenses, debtors, totalDebt, moves, customers });
  }
  useEffect(reload, []);

  if (!settings || !data) return null;
  const ar = settings.arabicDigits;
  const cur = settings.currency;
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const payDebt = payName ? customerDebt(payName) : 0;

  // العملاء المعروضين للاختيار: المديونين الأول، والبحث بيصفّي
  const pickList = (search.trim()
    ? [...data.debtors, ...data.customers.filter((c) => !data.debtors.find((d) => d.id === c.id))]
        .filter((c) => c.name.includes(search.trim()))
    : data.debtors
  ).slice(0, 30);

  function quickPay() {
    const amt = Number(payAmount) || 0;
    if (!payName) { showToast('⚠️ اختار العميل الأول'); return; }
    if (amt <= 0) { showToast('⚠️ اكتب المبلغ'); return; }
    const p = savePayment({
      number: nextPaymentNumber(), date: todayISO(), customerName: payName,
      phone: data.customers.find((c) => c.name === payName)?.phone || '',
      amount: amt, method: 'نقدي', notes: 'سند — شاشة المحاسب',
      debtBefore: payDebt, debtAfter: Math.max(0, payDebt - amt),
    });
    setLastPay(p); setPayAmount(''); setPayName(''); setSearch('');
    reload();
    showToast(`✅ اتحصّل ${num(amt, ar)} ${cur} من ${p.customerName}`);
  }

  function quickExpense() {
    const amt = Number(expAmount) || 0;
    if (!expDesc) { showToast('⚠️ اختار نوع المصروف'); return; }
    if (amt <= 0) { showToast('⚠️ اكتب المبلغ'); return; }
    saveExpense({ date: todayISO(), desc: expDesc, name: '', amount: amt, notes: '', by: 'محاسب' });
    setExpAmount(''); setExpDesc('');
    reload();
    showToast(`✅ اتسجّل مصروف ${expDesc} — ${num(amt, ar)} ${cur}`);
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
      number: nextPaymentNumber(), date: todayISO(), customerName: inv.customer?.name,
      phone: inv.customer?.phone || '', amount, method: 'نقدي',
      notes: `تحصيل عن طريق المندوب ${inv.rep} — فاتورة ${inv.number}`,
      targetInvoiceId: inv.id, debtBefore: remaining, debtAfter: Math.max(0, remaining - amount),
    });
    const updated = listInvoices().find((x) => x.id === inv.id);
    if (updated) saveInvoice({ ...updated, repStatus: (updated.totals?.remaining || 0) <= 0 ? 'تم التحصيل' : 'تحصيل جزئي' });
    reload();
    showToast(`✅ اتحصّل ${num(amount, ar)} من المندوب ${inv.rep}`);
  }

  function reminderLink(c) {
    const msg = buildMessage(settings.debtReminder.template, {
      name: c.name, currency: cur, company: settings.companyName,
    }).replaceAll('{debt}', num(c.debt));
    return waMeLink(c.phone, msg);
  }

  return (
    <div className="acc-simple">
      {/* أرقام اليوم — كبيرة وواضحة */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <div className="stat green"><div className="label">💵 المحصّل النهارده</div>
          <div className="value">{num(data.todayCollected, ar)}</div><div className="sub">{cur}</div></div>
        <div className="stat orange"><div className="label">💸 مصاريف النهارده</div>
          <div className="value">{num(data.todayExpenses, ar)}</div><div className="sub">{cur}</div></div>
        <div className="stat red"><div className="label">📕 فلوس عند العملاء</div>
          <div className="value">{num(data.totalDebt, ar)}</div><div className="sub">{num(data.debtors.length, ar)} عميل</div></div>
        <div className="stat"><div className="label">🛵 فلوس مع المندوبين</div>
          <div className="value">{num(data.repTotal, ar)}</div><div className="sub">{num(data.repOpen.length, ar)} فاتورة</div></div>
      </div>

      {/* الشغل الأساسي: تحصيل أو مصروف */}
      <div className="card">
        <div className="acc-tabs">
          <button className={tab === 'collect' ? 'on' : ''} onClick={() => setTab('collect')}>💵 استلام فلوس من عميل</button>
          <button className={tab === 'expense' ? 'on' : ''} onClick={() => setTab('expense')}>💸 تسجيل مصروف</button>
        </div>

        {tab === 'collect' ? (
          <div>
            <div className="acc-step">١) اختار العميل</div>
            {payName ? (
              <div className="acc-chosen">
                <span>👤 <b>{payName}</b>{payDebt > 0 ? <> — عليه <b className="red-text">{num(payDebt, ar)} {cur}</b></> : ' — مفيش عليه مديونية'}</span>
                <button onClick={() => { setPayName(''); setPayAmount(''); }}>✕ غيّر</button>
              </div>
            ) : (
              <>
                <input className="acc-input" placeholder="🔍 دوّر على العميل بالاسم..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="acc-people">
                  {pickList.map((c) => (
                    <button key={c.id} className="acc-person" onClick={() => { setPayName(c.name); setLastPay(null); }}>
                      <span>👤 {c.name}</span>
                      {c.debt > 0 && <span className="badge red">{num(c.debt, ar)} {cur}</span>}
                    </button>
                  ))}
                  {!pickList.length && <p className="muted" style={{ padding: 12 }}>مفيش عميل بالاسم ده</p>}
                </div>
              </>
            )}

            {payName && (
              <>
                <div className="acc-step">٢) اكتب المبلغ اللي استلمته</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input className="acc-input" style={{ maxWidth: 220 }} type="number" min="0" step="any"
                    placeholder="المبلغ" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                  {payDebt > 0 && (
                    <button className="acc-btn-alt" onClick={() => setPayAmount(String(payDebt))}>
                      استلمت المبلغ كله ({num(payDebt, ar)})
                    </button>
                  )}
                </div>
                <div className="acc-step">٣) احفظ</div>
                <button className="acc-btn-big" onClick={quickPay}>✅ سجّل الاستلام</button>
              </>
            )}

            {lastPay && (
              <Link className="acc-btn-alt" style={{ marginTop: 12, display: 'inline-flex' }} href={`/payments/print/${lastPay.id}`}>
                🖨️ اطبع إيصال رقم {num(lastPay.number, ar)}
              </Link>
            )}
          </div>
        ) : (
          <div>
            <div className="acc-step">١) المصروف على إيه؟</div>
            <div className="acc-kinds">
              {EXP_KINDS.map((k) => (
                <button key={k} className={expDesc === k ? 'on' : ''} onClick={() => setExpDesc(k)}>{k}</button>
              ))}
            </div>
            <input className="acc-input" style={{ maxWidth: 320, marginTop: 8 }} placeholder="أو اكتب نوع تاني..." value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
            <div className="acc-step">٢) المبلغ</div>
            <input className="acc-input" style={{ maxWidth: 220 }} type="number" min="0" step="any"
              placeholder="المبلغ" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
            <div className="acc-step">٣) احفظ</div>
            <button className="acc-btn-big" onClick={quickExpense}>✅ سجّل المصروف</button>
          </div>
        )}
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {data.repOpen.length > 0 && (
          <div className="card">
            <h3>🛵 فلوس مع المندوبين</h3>
            <table className="tbl">
              <thead><tr><th>المندوب</th><th>العميل</th><th>المتبقي</th><th></th></tr></thead>
              <tbody>
                {data.repOpen.slice(0, 6).map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.rep}</b></td>
                    <td>{i.customer?.name}</td>
                    <td className="red-text"><b>{num(i.totals.remaining, ar)}</b></td>
                    <td><button className="btn-green" onClick={() => collectRep(i)}>💵 استلمت</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.repOpen.length > 6 && <Link href="/reps" className="btn btn-primary" style={{ marginTop: 8 }}>عرض الكل ←</Link>}
          </div>
        )}

        <div className="card">
          <h3>📕 أكبر العملاء المديونين</h3>
          <table className="tbl">
            <tbody>
              {data.debtors.slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td><span className="badge red">{num(c.debt, ar)} {cur}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {c.phone && <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={reminderLink(c)}>💬 ذكّره</a>}
                    <Link className="btn btn-sm" href={`/statement?name=${encodeURIComponent(c.name)}`}>📄 كشف</Link>
                  </td>
                </tr>
              ))}
              {!data.debtors.length && <tr><td className="muted">مفيش مديونيات ✅</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>🕐 حركة النهارده</h3>
          <table className="tbl">
            <tbody>
              {data.moves.slice(0, 10).map((m, i) => (
                <tr key={i}>
                  <td style={{ width: 60 }}>{fmtTime(m.at, ar)}</td>
                  <td>{m.desc}</td>
                  <td className={m.amount < 0 ? 'red-text' : ''}><b>{num(Math.abs(m.amount), ar)}</b></td>
                </tr>
              ))}
              {!data.moves.length && <tr><td className="muted">مفيش حركة لسه النهارده</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="acc-btn-alt" href="/dayclose">🧮 إقفال اليومية</Link>
          <Link className="acc-btn-alt" href="/reports">📈 التقارير</Link>
          <Link className="acc-btn-alt" href="/pnl">📗 أرباح وخسائر</Link>
          <Link className="acc-btn-alt" href="/purchases">📥 المشتريات</Link>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
