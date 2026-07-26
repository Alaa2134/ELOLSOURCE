'use client';
// 🎤 بحث بالصوت — بيستخدم التعرف على الكلام المدمج في المتصفح (عربي مصري)
// شغّال على كروم وإيدج والموبايل. لو المتصفح مايدعمش، الزرار مابيظهرش أصلاً.
import { useCallback, useEffect, useRef, useState } from 'react';

export function speechSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function useVoiceSearch(onResult, { lang = 'ar-EG' } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => { setSupported(speechSupported()); }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!speechSupported()) return;
    try { recRef.current?.abort(); } catch {}
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;   // بيوري الكلام وهو بيتقال
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      const done = e.results[e.results.length - 1].isFinal;
      cbRef.current?.(text.trim(), done);
      if (done) setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, [lang]);

  const toggle = useCallback(() => { listening ? stop() : start(); }, [listening, start, stop]);

  useEffect(() => () => { try { recRef.current?.abort(); } catch {} }, []);

  return { listening, supported, start, stop, toggle };
}
