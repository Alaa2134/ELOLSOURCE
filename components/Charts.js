'use client';
// رسوم بيانية بسيطة بالـ SVG/CSS — بتشتغل أوف لاين تماماً من غير أي مكتبات خارجية
import { useState } from 'react';

// أعمدة رأسية — data: [{ label, value, sub }]
export function BarsChart({ data, unit = '', height = 190, color = 'var(--accent)', fmt = (n) => Math.round(n).toLocaleString('en-US') }) {
  const [hi, setHi] = useState(-1);
  if (!data.length) return <p className="muted">لا توجد بيانات</p>;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="chart-bars" style={{ height: height + 34 }}>
      {data.map((d, i) => {
        const h = Math.max(2, (Math.abs(d.value) / max) * height);
        return (
          <div key={i} className="bar-col" onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(-1)}>
            <div className="bar-val" style={{ opacity: hi === i ? 1 : 0 }}>{fmt(d.value)}{unit ? ' ' + unit : ''}</div>
            <div className="bar-fill" style={{ height: h, background: d.color || color, filter: hi === i ? 'brightness(1.1)' : 'none' }} />
            <div className="bar-label" title={d.label}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// خط اتجاه (Area line) — data: [{ label, value }]
export function TrendLine({ data, height = 200, color = 'var(--brand)', fmt = (n) => Math.round(n).toLocaleString('en-US') }) {
  const [hi, setHi] = useState(-1);
  if (data.length < 2) return <p className="muted">محتاج نقطتين على الأقل للرسم</p>;
  const W = 600, H = height, pad = 30;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const x = (i) => pad + (i * (W - pad * 2)) / (data.length - 1);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${pad},${H - pad} ${pts} ${W - pad},${H - pad}`;
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 340, height }} onMouseLeave={() => setHi(-1)}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#areaFill)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHi(i)}>
            <circle cx={x(i)} cy={y(d.value)} r={hi === i ? 6 : 3.5} fill={color} />
            <rect x={x(i) - (W / data.length) / 2} y={0} width={W / data.length} height={H} fill="transparent" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{d.label}</text>
            {hi === i && (
              <text x={x(i)} y={y(d.value) - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{fmt(d.value)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
