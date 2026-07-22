'use client';
// حفظ مسودة أي مستند (فاتورة/طلب/سند/مصروف) تلقائياً في التخزين المحلي.
// لو النور قطع أو البرنامج اتقفل فجأة — أول ما تفتح الصفحة تاني بيرجّعلك اللي كنت بتكتبه.
// التخزين المحلي بيتكتب على القرص فوراً، فمفيش حاجة بتضيع حتى لو الكهربا فصلت.
import { useEffect, useRef } from 'react';

// key: اسم فريد للمسودة · data: أوبجكت فيه كل اللي المستخدم كتبه
// onRestore(d): بينده لما نلاقي مسودة فيها بيانات عشان ترجّع الحقول
// hasContent(d): بيرجّع true لو المسودة فيها كلام يستاهل الاسترجاع
export function useDraft(key, data, { enabled = true, onRestore, hasContent } = {}) {
  const didRestore = useRef(false);
  const skipFirstSave = useRef(true);

  // استرجاع مرة واحدة عند فتح الصفحة — قبل أي حفظ
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    try {
      const d = JSON.parse(localStorage.getItem(key) || 'null');
      if (d && (!hasContent || hasContent(d)) && onRestore) onRestore(d);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حفظ مستمر لكل تغيير — بنتجاهل أول تشغيل عشان مانمسحش المسودة بالحالة الفاضية
  const serialized = JSON.stringify(data);
  useEffect(() => {
    if (!enabled) return;
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    try {
      if (hasContent && !hasContent(data)) localStorage.removeItem(key);
      else localStorage.setItem(key, serialized);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, enabled]);
}

export function clearDraft(key) {
  try { localStorage.removeItem(key); } catch {}
}
