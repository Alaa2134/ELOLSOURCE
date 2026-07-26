'use client';
// عارض صورة ملء الشاشة بزوم — بالأصابع (Pinch) أو دوسة مزدوجة أو الأزرار
// معمول للموبايل الأول: التاجر يقرّب على الصنف يشوف تفاصيله قبل ما يطلب
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX = 5;
const MIN = 1;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function ImageZoom({ src, alt = '', onClose, children }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const wrapRef = useRef(null);
  // بيانات اللمس الجارية: مسافة الإصبعين وبداية السحب وتوقيت آخر دوسة
  const g = useRef({ dist: 0, startScale: 1, drag: null, lastTap: 0 });

  const reset = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }); }, []);

  // الصورة لما ترجع لحجمها الطبيعي ترجع للنص — عشان متفضلش مزاحة برّه الشاشة
  const setZoom = useCallback((next) => {
    const s = clamp(next, MIN, MAX);
    setScale(s);
    if (s <= 1) setPos({ x: 0, y: 0 });
  }, []);

  // Esc يقفل، و+/- يكبّر ويصغّر (للي بيفتحها من الكمبيوتر)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === '+' || e.key === '=') setZoom(scale + 0.5);
      else if (e.key === '-') setZoom(scale - 0.5);
      else if (e.key === '0') reset();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scale, setZoom, reset, onClose]);

  // وإحنا بنزوّم نمنع الصفحة اللي ورا إنها تتحرّك
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      g.current.dist = dist(e.touches);
      g.current.startScale = scale;
      g.current.drag = null;
    } else if (e.touches.length === 1) {
      // دوستين ورا بعض بسرعة = تكبير/رجوع
      const now = Date.now();
      if (now - g.current.lastTap < 280) {
        setZoom(scale > 1.2 ? 1 : 2.5);
        g.current.lastTap = 0;
        return;
      }
      g.current.lastTap = now;
      if (scale > 1) g.current.drag = { x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y };
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && g.current.dist > 0) {
      e.preventDefault();
      setZoom(g.current.startScale * (dist(e.touches) / g.current.dist));
    } else if (e.touches.length === 1 && g.current.drag && scale > 1) {
      e.preventDefault();
      setPos({ x: e.touches[0].clientX - g.current.drag.x, y: e.touches[0].clientY - g.current.drag.y });
    }
  }

  function onTouchEnd() { g.current.dist = 0; g.current.drag = null; }

  // عجلة الماوس على الكمبيوتر
  function onWheel(e) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    setZoom(scale - e.deltaY * 0.004);
  }

  return (
    <div className="zoom-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="zoom-bar">
        <button onClick={onClose} aria-label="اقفل">✕</button>
        <span className="zoom-pct">{Math.round(scale * 100)}%</span>
        <button onClick={() => setZoom(scale - 0.5)} disabled={scale <= MIN} aria-label="صغّر">➖</button>
        <button onClick={() => setZoom(scale + 0.5)} disabled={scale >= MAX} aria-label="كبّر">➕</button>
        <button onClick={reset} disabled={scale === 1}>↺</button>
      </div>

      <div
        className="zoom-stage"
        ref={wrapRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        onDoubleClick={() => setZoom(scale > 1.2 ? 1 : 2.5)}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="zoom-img"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
          />
        ) : (
          <div className="zoom-none">
            <span style={{ fontSize: 56 }}>📷</span>
            <b>مفيش صورة للصنف ده</b>
          </div>
        )}
      </div>

      {children && <div className="zoom-foot">{children}</div>}
      {src && <p className="zoom-hint">قرّب بإصبعينك أو دوس مرتين على الصورة</p>}
    </div>
  );
}
