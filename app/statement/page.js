'use client';
// كشف حساب عميل: فواتير + سندات قبض برصيد تراكمي، يتطبع ويتبعت واتساب
import { useEffect, useMemo, useState } from 'react';
import { listCustomers, listInvoices, listPayments, getSettings } from '@/lib/db';
import { num, fmtDate } from '@/lib/format';
import { waMeLink } from '@/lib/wa';

export default function StatementPage() {
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [name, setName] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setCustomers(listCustomers());
    const n = new URLSearchParams(window.location.search).get('name');
    if (n) setName(n);
  }, []);

  const rows = useMemo(() => {
    if (!name) return [];
    const entries = [];
    for (const inv of listInvoices()) {
      if (inv.customer?.name !== name) continue;
      if (inv.type === 'مرتجع') {
        // المرتجع دائن: بيقلل حساب العميل
        entries.push({
          date: inv.date,
          desc: `مرتجع رقم ${inv.number}${inv.refNumber ? ` من فاتورة ${inv.refNumber}` : ''}`,
          debit: 0,
          credit: inv.totals?.creditedToDebt || 0,
        });
        continue;
      }
      entries.push({
        date: inv.date,
        desc: `فاتورة بيع رقم ${inv.number}${inv.totals?.prevBalance ? ' (شاملة حساب سابق)' : ''}`,
        debit: inv.totals?.net || 0,
        credit: inv.totals?.paid || 0,
      });
      // فاتورة اترحّل رصيدها لفاتورة أحدث (حساب سابق)
      if (inv.settledInto) {
        entries.push({
          date: inv.updated_at || inv.date,
          desc: `ترحيل رصيد الفاتورة ${inv.number} إلى الفاتورة ${inv.settledInto}`,
          debit: 0,
          credit: Math.max(0, (inv.totals?.net || 0) - (inv.totals?.paid || 0)),
        });
      }
    }
    for (const p of listPayments()) {
      if (p.customerName !== name) continue;
      entries.push({
        date: p.date,
        desc: `سند قبض رقم ${p.number} (${p.method})`,
        debit: 0,
        credit: p.amount || 0,
      });
    }
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let balance = 0;
    return entries.map((e) => {
      balance += (e.debit || 0) - (e.credit || 0);
      return { ...e, balance };
    });
  }, [name]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const customer = customers.find((c) => c.name === name);
  const finalBalance = rows.length ? rows[rows.length - 1].balance : 0;
  const totals = rows.reduce(
    (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }),
    { debit: 0, credit: 0 }
  );

  const waText =
    `أهلاً ${name} 🌹\nكشف حساب من ${settings.companyName}:\n` +
    `إجمالي التعامل: ${num(totals.debit)} ${settings.currency}\n` +
    `إجمالي المدفوع: ${num(totals.credit)} ${settings.currency}\n` +
    (finalBalance > 0
      ? `الرصيد المستحق عليكم: ${num(finalBalance)} ${settings.currency}`
      : `الحساب مسدد بالكامل، شكراً لكم 🙏`);

  return (
    <div>
      <div className="card no-print">
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 280 }}>
            <span>اختر العميل</span>
            <input list="st-customers" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل..." />
            <datalist id="st-customers">
              {customers.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </label>
          {name && (
            <>
              <button className="btn-accent" onClick={() => window.print()}>🖨️ طباعة الكشف</button>
              {customer?.phone && (
                <a className="btn btn-green" target="_blank" rel="noreferrer" href={waMeLink(customer.phone, waText)}>
                  💬 إرسال ملخص واتساب
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {name && (
        <div className="card statement-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, borderBottom: '2px solid var(--brand)', paddingBottom: 10 }}>
            <img src="/logo.jpg" alt="" style={{ width: 54, height: 54, objectFit: 'contain' }} />
            <div>
              <h2 style={{ color: 'var(--brand)' }}>{settings.companyName} — كشف حساب</h2>
              <p className="muted">العميل: <b>{name}</b> {customer?.phone ? `— ${customer.phone}` : ''} — حتى {fmtDate(new Date().toISOString(), ar)}</p>
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>التاريخ</th><th>البيان</th><th>مدين (عليه)</th><th>دائن (دفع)</th><th>الرصيد</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date, ar)}</td>
                  <td>{r.desc}</td>
                  <td>{r.debit ? num(r.debit, ar) : '—'}</td>
                  <td className="green-text">{r.credit ? num(r.credit, ar) : '—'}</td>
                  <td><b className={r.balance > 0 ? 'red-text' : 'green-text'}>{num(r.balance, ar)}</b></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">لا توجد حركات لهذا العميل</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f4f7fa', fontWeight: 900 }}>
                  <td colSpan={2}>الإجمالي</td>
                  <td>{num(totals.debit, ar)}</td>
                  <td>{num(totals.credit, ar)}</td>
                  <td className={finalBalance > 0 ? 'red-text' : 'green-text'}>{num(finalBalance, ar)} {settings.currency}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p style={{ marginTop: 12, fontSize: 15 }}>
            {finalBalance > 0
              ? <>💰 الرصيد المستحق على العميل: <b className="red-text">{num(finalBalance, ar)} {settings.currency}</b></>
              : <>✅ الحساب مسدد بالكامل</>}
          </p>
        </div>
      )}
    </div>
  );
}
