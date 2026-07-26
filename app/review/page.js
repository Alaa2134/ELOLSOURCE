'use client';
// 🚩 طلبات المراجعة — المستندات اللي المحاسب أو الأدمن شاكك فيها
// العلامة مابتوقفش شغل ومابتلغيش الحركة — دي تنبيه عشان حد يبصّ عليها
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listReviewFlags, resolveReview, getSettings, getRole, getCashierName } from '@/lib/db';
import { num, fmtDate, fmtTime } from '@/lib/format';
import { promptBox } from '@/lib/ui';

const ICONS = { invoice: '🧾', return: '↩️', payment: '💵', expense: '💸' };

export default function ReviewPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [role, setRole] = useState('');
  const [rows, setRows] = useState([]);
  const [showClosed, setShowClosed] = useState(false);
  const [msg, setMsg] = useState('');

  function reload() {
    setSettings(getSettings());
    setRole(getRole() || '');
    setRows(listReviewFlags({ openOnly: false }));
  }
  useEffect(reload, []);

  const open = useMemo(() => rows.filter((r) => r.review.open), [rows]);
  const closed = useMemo(() => rows.filter((r) => !r.review.open), [rows]);
  const visible = showClosed ? rows : open;

  if (!settings) return null;
  const ar = settings.arabicDigits;

  async function close(r) {
    const note = await promptBox({
      title: '✔️ إقفال المراجعة', icon: '✔️',
      message: `${r.label}\n\nاكتب نتيجة المراجعة (اختياري):`,
      placeholder: 'مثلاً: راجعتها وطلعت سليمة',
      confirmText: 'اقفل المراجعة',
    });
    if (note === null) return; // اتلغت
    resolveReview(r.docType, r.id, { note, by: getCashierName() || role });
    setMsg('✅ اتقفلت المراجعة');
    setTimeout(() => setMsg(''), 2500);
    reload();
  }

  function goto(r) {
    if (r.docType === 'invoice' || r.docType === 'return') router.push(`/print/${r.id}`);
    else if (r.docType === 'payment') router.push(`/payments/print/${r.id}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h2 style={{ color: 'var(--brand)', margin: 0 }}>
          🚩 طلبات المراجعة {open.length > 0 && <span className="badge red">{num(open.length, ar)} مفتوح</span>}
        </h2>
        {closed.length > 0 && (
          <button onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? '🚩 المفتوح بس' : `🗂️ عرض المقفول كمان (${num(closed.length, ar)})`}
          </button>
        )}
      </div>

      {msg && <p className="save-flash-inline">{msg}</p>}

      {!visible.length && (
        <div className="card">
          <p className="muted" style={{ textAlign: 'center', padding: 30 }}>
            ✅ مفيش حاجة محتاجة مراجعة
          </p>
        </div>
      )}

      {visible.map((r) => (
        <div key={`${r.docType}-${r.id}`} className="card" style={r.review.open ? { borderRight: '4px solid var(--red)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <b style={{ fontSize: 16 }}>{ICONS[r.docType] || '📄'} {r.label}</b>
              {r.review.open
                ? <span className="badge red" style={{ marginRight: 8 }}>محتاج مراجعة</span>
                : <span className="badge green" style={{ marginRight: 8 }}>اتراجعت</span>}
              <div className="muted" style={{ fontSize: 13 }}>
                {fmtDate(r.date, ar)} · طلبها {r.review.by || 'المحاسب'} يوم {fmtDate(r.review.at, ar)} {fmtTime(r.review.at, ar)}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--brand)' }}>
              {num(r.amount, ar)} {settings.currency}
            </div>
          </div>

          {r.review.reason && (
            <p style={{ marginTop: 8, background: '#fff5f5', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 12px' }}>
              <b>الشك:</b> {r.review.reason}
            </p>
          )}
          {!r.review.open && r.review.note && (
            <p className="muted" style={{ marginTop: 8 }}>✔️ النتيجة: {r.review.note} — {r.review.resolvedBy}</p>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {(r.docType === 'invoice' || r.docType === 'return' || r.docType === 'payment') && (
              <button className="btn-primary" onClick={() => goto(r)}>👁️ افتح المستند</button>
            )}
            {r.review.open && <button className="btn-green" onClick={() => close(r)}>✔️ راجعتها — اقفلها</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
