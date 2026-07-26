'use client';
// تصدير أي جدول لملف يفتح في إكسل — من غير أي مكتبات خارجية
// بنستخدم صيغة CSV مع BOM عشان العربي يظهر صح في إكسل العربي

function cell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // لو فيه فاصلة أو سطر جديد أو علامة تنصيص لازم نحوّطه
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: مصفوفة مصفوفات (أول صف = العناوين) · name: اسم الملف من غير امتداد
export function exportExcel(rows, name = 'تقرير') {
  if (typeof window === 'undefined' || !rows?.length) return;
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// زرار جاهز للاستخدام في أي صفحة
export function ExcelButton({ rows, name, label = '📊 تصدير Excel', className = '' }) {
  return (
    <button className={className} onClick={() => exportExcel(typeof rows === 'function' ? rows() : rows, name)}>
      {label}
    </button>
  );
}
