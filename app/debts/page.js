'use client';
// متابعة الآجل: العملاء المديونين مرتّبين بالأقدم — وتذكير واتساب بضغطة
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listInvoices, listCustomers, getSettings } from '@/lib/db';
import { num } from '@/lib/format';
import { waMeLink } from '@/lib/wa';

export default function DebtsPage() {
  const [settings, setSettings] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    setSettings(getSettings());
    setInvoices(listInvoices());
    setCustomers(listCustomers());
  }, []);

  const rows = useMemo(() => {
    const byCust = new Map();
    for (const inv of invoices) {
      if (inv.type === 'مرتجع') continue;
      const rem = Math.max(0, inv.totals?.remaining || 0);
      if (rem <= 0) continue;
      const name = inv.customer?.name || 'عميل نقدي';
      const r = byCust.get(name) || { name, debt: 0, oldest: inv.date, count: 0, phone: inv.customer?.phone || '' };
      r.debt += rem;
      r.count++;
      if ((inv.date || '') < (r.oldest || '')) r.oldest = inv.date;
      if (!r.phone && inv.customer?.phone) r.phone = inv.customer.phone;
      byCust.set(name, r);
    }
    // نكمّل التليفون من سجل العملاء لو مش موجود
    for (const r of byCust.values()) {
      if (!r.phone) r.phone = customers.find((c) => c.name === r.name)?.phone || '';
    }
    const now = Date.now();
    return [...byCust.values()]
      .map((r) => ({ ...r, days: Math.floor((now - new Date(r.oldest).getTime()) / 86400000) }))
      .sort((a, b) => (a.oldest || '').localeCompare(b.oldest || '')); // الأقدم أولاً
  }, [invoices, customers]);

  if (!settings) return null;
  const ar = settings.arabicDigits;
  const filtered = rows.filter((r) => !q || r.name.includes(q) || (r.phone || '').includes(q));
  const totalDebt = rows.reduce((s, r) => s + r.debt, 0);

  function reminderMsg(r) {
    const tmpl = settings.debtReminder?.template ||
      'أهلاً {name} 🌹\nتحية طيبة من {company}.\nنذكّر حضرتكم بأن المتبقي من حسابكم: {debt} {currency}.\nنتشرف بزيارتكم وشكراً لتعاملكم معنا 🙏';
    return tmpl
      .replaceAll('{name}', r.name)
      .replaceAll('{debt}', num(r.debt, false))
      .replaceAll('{currency}', settings.currency)
      .replaceAll('{company}', settings.companyName);
  }

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <div className="stat red">
          <div className="label">📕 إجمالي الآجل</div>
          <div className="value">{num(totalDebt, ar)}</div>
          <div className="sub">{settings.currency}</div>
        </div>
        <div className="stat orange">
          <div className="label">👥 عملاء عليهم فلوس</div>
          <div className="value">{num(rows.length, ar)}</div>
          <div className="sub">مرتّبين بالأقدم</div>
        </div>
        <div className="stat">
          <div className="label">⏰ أقدم مديونية</div>
          <div className="value">{rows.length ? num(rows[0].days, ar) : 0}</div>
          <div className="sub">يوم — {rows[0]?.name || '—'}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input style={{ maxWidth: 300 }} placeholder="🔍 بحث باسم العميل أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{num(filtered.length, ar)} عميل</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>العميل</th><th>المتبقي</th><th>عدد الفواتير</th><th>أقدم مديونية</th><th>الهاتف</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.name}>
                  <td><b>{r.name}</b></td>
                  <td><span className="badge red">{num(r.debt, ar)} {settings.currency}</span></td>
                  <td>{num(r.count, ar)}</td>
                  <td>
                    <span className={`badge ${r.days > 30 ? 'red' : r.days > 14 ? 'orange' : 'blue'}`}>
                      من {num(r.days, ar)} يوم
                    </span>
                  </td>
                  <td dir="ltr">{r.phone || '—'}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Link className="btn btn-sm" href={`/statement?name=${encodeURIComponent(r.name)}`}>📄 كشف</Link>
                    <Link className="btn btn-sm btn-accent" href={`/payments?name=${encodeURIComponent(r.name)}`}>💵 تحصيل</Link>
                    {r.phone && (
                      <a className="btn btn-sm btn-green" target="_blank" rel="noreferrer" href={waMeLink(r.phone, reminderMsg(r))}>
                        💬 تذكير
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="muted">مفيش مديونيات ✅ كل العملاء خالصين</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
