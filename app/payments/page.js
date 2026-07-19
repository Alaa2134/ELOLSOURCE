'use client';
// سند قبض: تحصيل دفعة من عميل مديون بدون فاتورة جديدة
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listCustomers,
  listPayments,
  savePayment,
  deletePayment,
  nextPaymentNumber,
  customerDebt,
  getSettings,
  isAdmin,
} from '@/lib/db';
import { num, todayISO, fmtDate, fmtTime } from '@/lib/format';
import { waMeLink, gatewaySend, gatewayStatus } from '@/lib/wa';

export default function PaymentsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('نقدي');
  const [notes, setNotes] = useState('');
  const [debt, setDebt] = useState(0);
  const [saved, setSaved] = useState(null);
  const [toast, setToast] = useState('');

  function reload() {
    setSettings(getSettings());
    setCustomers(listCustomers());
    setPayments(listPayments());
  }

  useEffect(() => {
    reload();
    // لو جاي من صفحة العملاء بـ ?name=
    const name = new URLSearchParams(window.location.search).get('name');
    if (name) setCustomerName(name);
  }, []);

  useEffect(() => {
    setDebt(customerName ? customerDebt(customerName) : 0);
    setSaved(null);
  }, [customerName]);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  function showToast(m) {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  }

  function waMsg(p, remainingDebt) {
    return (
      `أهلاً ${p.customerName} 🌹\n` +
      `تم استلام مبلغ ${num(p.amount)} ${settings.currency} — سند قبض رقم ${p.number}.\n` +
      (remainingDebt > 0
        ? `المتبقي عليكم: ${num(remainingDebt)} ${settings.currency}.`
        : `تم سداد كامل الحساب، شكراً لكم 🙏`) +
      `\n${settings.companyName}`
    );
  }

  async function save(andPrint) {
    const amt = Number(amount) || 0;
    if (!customerName) { showToast('⚠️ اختر العميل'); return; }
    if (amt <= 0) { showToast('⚠️ أدخل المبلغ'); return; }
    const p = savePayment({
      number: nextPaymentNumber(),
      date: todayISO(),
      customerName,
      phone: customers.find((c) => c.name === customerName)?.phone || '',
      amount: amt,
      method,
      notes,
      debtBefore: debt,
      debtAfter: Math.max(0, debt - amt),
    });
    setSaved(p);
    setDebt(customerDebt(customerName));
    reload();
    setAmount('');
    showToast(`✅ تم حفظ سند القبض رقم ${p.number}`);

    const wa = settings.wa || {};
    if (wa.autoSend && wa.gatewayUrl && p.phone) {
      try {
        const st = await gatewayStatus(wa);
        if (st.available && st.connected) {
          await gatewaySend(wa, p.phone, waMsg(p, p.debtAfter));
          showToast('💬 تمت إضافة رسالة السند لطابور الواتساب');
        }
      } catch { /* زر wa.me موجود */ }
    }
    if (andPrint) router.push(`/payments/print/${p.id}?auto=1`);
  }

  return (
    <div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>💵 سند قبض جديد</h3>
          <div className="grid" style={{ gap: 10 }}>
            <label className="field">
              <span>العميل</span>
              <input
                list="pay-customers"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اختر أو اكتب اسم العميل..."
              />
              <datalist id="pay-customers">
                {customers.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </label>
            {customerName && (
              <div className={debt > 0 ? 'debt-alert' : 'debt-alert ok'} style={{ marginBottom: 0 }}>
                {debt > 0
                  ? <>💰 المديونية الحالية: <b>{num(debt, ar)} {settings.currency}</b></>
                  : <>✅ العميل مفيش عليه مديونية</>}
              </div>
            )}
            <div className="grid cols-2">
              <label className="field">
                <span>المبلغ المستلم</span>
                <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>طريقة الدفع</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>نقدي</option>
                  <option>فيزا</option>
                  <option>محفظة إلكترونية</option>
                  <option>تحويل بنكي</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>ملاحظات</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {Number(amount) > 0 && (
              <div className="pos-totals">
                <div className="row"><span>المديونية بعد السداد</span>
                  <b className={debt - Number(amount) > 0 ? 'red-text' : 'green-text'}>
                    {num(Math.max(0, debt - Number(amount)), ar)} {settings.currency}
                  </b>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-green" onClick={() => save(false)}>💾 حفظ السند</button>
              <button className="btn-accent" onClick={() => save(true)}>🖨️ حفظ وطباعة</button>
            </div>
            {saved && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" href={`/payments/print/${saved.id}`}>🖨️ طباعة السند {num(saved.number, ar)}</Link>
                {saved.phone && (
                  <a className="btn btn-green" target="_blank" rel="noreferrer"
                    href={waMeLink(saved.phone, waMsg(saved, saved.debtAfter))}>
                    💬 إرسال واتساب
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>📜 آخر السندات</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr><th>رقم</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>إجراءات</th></tr>
              </thead>
              <tbody>
                {payments.slice(0, 15).map((p) => (
                  <tr key={p.id}>
                    <td><b>{num(p.number, ar)}</b></td>
                    <td>{fmtDate(p.date, ar)} {fmtTime(p.date, ar)}</td>
                    <td>{p.customerName}</td>
                    <td className="green-text">{num(p.amount, ar)}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <Link className="btn btn-sm btn-primary" href={`/payments/print/${p.id}`}>🖨️</Link>
                      {p.phone && (
                        <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer"
                          href={waMeLink(p.phone, waMsg(p, p.debtAfter))}>💬</a>
                      )}
                      {isAdmin() && (
                        <button className="btn-sm btn-red"
                          onClick={() => {
                            if (confirm(`حذف السند رقم ${p.number}؟ سيتم إرجاع المبلغ لمديونية العميل.`)) {
                              deletePayment(p.id);
                              reload();
                              setDebt(customerName ? customerDebt(customerName) : 0);
                            }
                          }}>🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={5} className="muted">لا توجد سندات بعد</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
