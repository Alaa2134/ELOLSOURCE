'use client';
// سجل العمليات — للأدمن فقط: مين عمل إيه وامتى
import { useEffect, useState } from 'react';
import { listAudit, getSettings } from '@/lib/db';
import { fmtDate, fmtTime, num } from '@/lib/format';

const ACTIONS = ['الكل', 'فاتورة بيع', 'حذف فاتورة', 'تعديل سعر', 'إضافة صنف', 'حذف صنف', 'سند قبض', 'حذف سند قبض', 'إقفال يومية', 'تعديل إعدادات'];

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('الكل');

  useEffect(() => {
    setLogs(listAudit());
    setSettings(getSettings());
  }, []);

  if (!settings) return null;
  const ar = settings.arabicDigits;

  const filtered = logs.filter((l) => {
    if (action !== 'الكل' && l.action !== action) return false;
    if (q && !(l.details || '').includes(q) && !(l.action || '').includes(q)) return false;
    return true;
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ maxWidth: 300 }} placeholder="🔍 بحث في التفاصيل..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ maxWidth: 200 }} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="muted">{num(filtered.length, ar)} عملية</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr><th>التاريخ</th><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, 300).map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.at, ar)}</td>
                <td>{fmtTime(l.at, ar)}</td>
                <td><span className={`badge ${l.role === 'أدمن' ? 'orange' : 'blue'}`}>{l.role}</span></td>
                <td><b>{l.action}</b></td>
                <td>{l.details}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5} className="muted">لا توجد عمليات مسجلة</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
