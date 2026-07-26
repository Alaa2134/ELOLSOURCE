'use client';
// 🚩 زرار "اطلب مراجعة" — المحاسب أو الأدمن بيعلّم على مستند فيه شك
// مابيوقفش ولا بيلغي أي حاجة، بس بيرفعه في صفحة طلبات المراجعة
import { useState } from 'react';
import { flagForReview, getRole, getCashierName } from '@/lib/db';
import { promptBox } from '@/lib/ui';

export default function ReviewFlag({ docType, doc, label, onDone, small = true }) {
  const [busy, setBusy] = useState(false);
  const role = typeof window === 'undefined' ? '' : getRole();
  // المحاسب والأدمن بس — الكاشير مايعلّمش على شغل نفسه
  if (role !== 'accountant' && role !== 'admin') return null;

  const flagged = doc?.review?.open;

  async function ask() {
    if (flagged) return;
    const reason = await promptBox({
      title: '🚩 طلب مراجعة', icon: '🚩',
      message: `${label}\n\nإيه اللي مش مظبوط؟`,
      placeholder: 'مثلاً: المبلغ مش مطابق / مرتجع مش واضح سببه',
      confirmText: 'اطلب المراجعة',
    });
    if (reason === null) return;
    setBusy(true);
    flagForReview(docType, doc.id, { reason, by: getCashierName() || role });
    setBusy(false);
    onDone?.();
  }

  return (
    <button
      className={`btn${small ? '-sm' : ''} ${flagged ? 'btn-red' : ''}`}
      title={flagged ? `محتاج مراجعة: ${doc.review.reason || ''}` : 'علّم على المستند ده للمراجعة'}
      disabled={busy || flagged}
      onClick={ask}
    >
      {flagged ? '🚩 محتاج مراجعة' : '🚩 اطلب مراجعة'}
    </button>
  );
}
