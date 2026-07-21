'use client';
// النافذة المصمّمة اللي بتظهر لكل تأكيد/إدخال/تنبيه — بشكل السقا وبالعربي
import { useEffect, useRef, useState } from 'react';
import { _registerDialog } from '@/lib/ui';

export default function DialogHost() {
  const [dlg, setDlg] = useState(null);
  const [val, setVal] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    _registerDialog((d) => { setVal(d.default || ''); setDlg(d); });
  }, []);

  useEffect(() => {
    if (dlg?.type === 'prompt') setTimeout(() => inputRef.current?.focus(), 50);
  }, [dlg]);

  if (!dlg) return null;

  const close = (result) => { const r = dlg.resolve; setDlg(null); setVal(''); r?.(result); };
  const onConfirm = () => close(dlg.type === 'prompt' ? val : true);
  const onCancel = () => close(dlg.type === 'prompt' ? null : false);

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  return (
    <div className="dlg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dlg.type !== 'prompt') onCancel(); }}>
      <div className={`dlg-box ${dlg.danger ? 'danger' : ''}`} onKeyDown={onKey}>
        <div className="dlg-icon">{dlg.icon}</div>
        {dlg.title && <h3 className="dlg-title">{dlg.title}</h3>}
        {dlg.message && <p className="dlg-msg">{dlg.message}</p>}
        {dlg.type === 'prompt' && (
          <input
            ref={inputRef}
            className="dlg-input"
            type={dlg.password ? 'password' : 'text'}
            dir={dlg.password ? 'ltr' : 'auto'}
            value={val}
            placeholder={dlg.placeholder || ''}
            onChange={(e) => setVal(e.target.value)}
          />
        )}
        <div className="dlg-actions">
          {dlg.type !== 'alert' && (
            <button className="dlg-btn dlg-cancel" onClick={onCancel}>{dlg.cancelText || 'إلغاء'}</button>
          )}
          <button className={`dlg-btn ${dlg.danger ? 'dlg-danger' : 'dlg-ok'}`} onClick={onConfirm} autoFocus={dlg.type !== 'prompt'}>
            {dlg.confirmText || 'تمام'}
          </button>
        </div>
      </div>
    </div>
  );
}
