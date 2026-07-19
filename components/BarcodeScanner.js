'use client';
// مسح الباركود بكاميرا الموبايل (آيفون وأندرويد) — بيفضل شغال لمسح أكتر من صنف ورا بعض
import { useEffect, useRef } from 'react';

export default function BarcodeScanner({ onScan, onClose }) {
  const instRef = useRef(null);
  const lastRef = useRef({ code: '', at: 0 });

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        const scanner = new Html5Qrcode('saqqa-cam');
        instRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' }, // الكاميرا الخلفية
          { fps: 10, qrbox: { width: 280, height: 170 } },
          (text) => {
            // منع تكرار نفس القراءة خلال ثانيتين ونص
            const now = Date.now();
            if (text === lastRef.current.code && now - lastRef.current.at < 2500) return;
            lastRef.current = { code: text, at: now };
            onScan(String(text).trim());
          },
          () => {} // فريمات من غير باركود — عادي
        );
      } catch {
        if (!stopped) {
          alert('⚠️ تعذر فتح الكاميرا — اسمح للمتصفح باستخدام الكاميرا وجرب تاني');
          onClose();
        }
      }
    })();
    return () => {
      stopped = true;
      const s = instRef.current;
      if (s) s.stop().then(() => s.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner-overlay no-print">
      <div className="scanner-box">
        <div id="saqqa-cam" />
        <p style={{ margin: '10px 0', fontSize: 14 }}>📷 وجّه الكاميرا على الباركود — بيتقرا لوحده، وتقدر تمسح أكتر من صنف ورا بعض</p>
        <button className="btn-red" style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>✕ إغلاق الكاميرا</button>
      </div>
    </div>
  );
}
