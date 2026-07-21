'use client';
// نظام النوافذ المصمّمة بالعربي — بديل نوافذ المتصفح القديمة (confirm/prompt/alert)
// بترجع Promise عشان نستنى رد المستخدم: await confirmBox('متأكد؟')

let listener = null;
export function _registerDialog(fn) { listener = fn; }

function normalize(opts) {
  if (typeof opts === 'string') return { message: opts };
  return opts || {};
}

function open(base, opts) {
  const o = { ...base, ...normalize(opts) };
  return new Promise((resolve) => {
    // لو نافذة التصميم مش متركّبة لأي سبب — نرجع لنوافذ المتصفح عشان البرنامج ميقفش
    if (!listener || typeof window === 'undefined') {
      if (o.type === 'confirm') return resolve(window.confirm(o.message));
      if (o.type === 'prompt') return resolve(window.prompt(o.message, o.default || ''));
      window.alert(o.message);
      return resolve();
    }
    listener({ ...o, resolve });
  });
}

// نافذة تأكيد → بترجع true/false
export function confirmBox(opts) {
  return open({ type: 'confirm', title: 'تأكيد', icon: '❓', confirmText: 'تأكيد', cancelText: 'إلغاء' }, opts);
}
// نافذة تأكيد لعملية خطيرة (حذف) — زرار أحمر
export function dangerBox(opts) {
  return open({ type: 'confirm', title: 'تأكيد الحذف', icon: '🗑️', confirmText: 'احذف', cancelText: 'إلغاء', danger: true }, opts);
}
// نافذة إدخال (كلمة سر/نص) → بترجع النص أو null لو اتلغت
export function promptBox(opts) {
  return open({ type: 'prompt', title: 'إدخال', icon: '✏️', confirmText: 'تأكيد', cancelText: 'إلغاء' }, opts);
}
// نافذة رسالة (تنبيه) → بترجع بعد ما يقفلها
export function alertBox(opts) {
  return open({ type: 'alert', title: 'تنبيه', icon: 'ℹ️', confirmText: 'تمام' }, opts);
}
