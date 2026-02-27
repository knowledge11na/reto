// file: components/sim/StickUnit.js
'use client';

export default function StickUnit({
  size = 40,
  parts = { head: '#cfd6df', body: '#aab7c6', leg: '#8d9aaa' },
}) {
  const s = Math.max(28, Number(size) || 40);

  return (
    <svg width={s} height={s} viewBox="0 0 100 140" aria-hidden="true">
      <defs>
        {/* 立体感：全体に落ち影 */}
        <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="rgba(0,0,0,0.35)" />
        </filter>

        {/* 立体感：頭のグラデ */}
        <radialGradient id="gHead" cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="45%" stopColor={parts.head} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
        </radialGradient>

        {/* 体のグラデ */}
        <linearGradient id="gBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="35%" stopColor={parts.body} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
        </linearGradient>

        {/* 脚のグラデ */}
        <linearGradient id="gLeg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="40%" stopColor={parts.leg} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
        </linearGradient>
      </defs>

      {/* 地面影 */}
      <ellipse cx="50" cy="132" rx="22" ry="6" fill="rgba(0,0,0,0.18)" />

      <g filter="url(#ds)">
        {/* 頭 */}
        <circle cx="50" cy="30" r="20" fill="url(#gHead)" stroke="rgba(0,0,0,0.28)" strokeWidth="3" />
        {/* ハイライト */}
        <circle cx="42" cy="22" r="7" fill="rgba(255,255,255,0.35)" />

        {/* 体 */}
        <line x1="50" y1="50" x2="50" y2="102" stroke="url(#gBody)" strokeWidth="12" strokeLinecap="round" />

        {/* 腕（少し前後感） */}
        <line x1="30" y1="72" x2="48" y2="92" stroke="rgba(0,0,0,0.12)" strokeWidth="11" strokeLinecap="round" />
        <line x1="30" y1="70" x2="50" y2="92" stroke="url(#gBody)" strokeWidth="10" strokeLinecap="round" />

        <line x1="70" y1="72" x2="52" y2="92" stroke="rgba(0,0,0,0.12)" strokeWidth="11" strokeLinecap="round" />
        <line x1="70" y1="70" x2="50" y2="92" stroke="url(#gBody)" strokeWidth="10" strokeLinecap="round" />

        {/* 脚 */}
        <line x1="50" y1="102" x2="36" y2="126" stroke="url(#gLeg)" strokeWidth="12" strokeLinecap="round" />
        <line x1="50" y1="102" x2="64" y2="126" stroke="url(#gLeg)" strokeWidth="12" strokeLinecap="round" />
      </g>
    </svg>
  );
}