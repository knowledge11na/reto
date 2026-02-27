// file: components/sim/Board9x9.js
'use client';

import StickUnit from './StickUnit';

function keyOf(x, y) {
  return `${x},${y}`;
}

export default function Board9x9({
  size = 9,
  tiles = {},       // { "x,y": "blue"|"red"|"none" }
  units = [],
  selectedUnitId = null,
  onCellClick = null,
  onUnitClick = null,
}) {
  const CELL = 48;
  const PAD = 10;
  const W = PAD * 2 + CELL * size;
  const H = PAD * 2 + CELL * size;

  const tileFill = (t) => {
    if (t === 'blue') return 'rgba(59,130,246,0.25)';  // blue-500
    if (t === 'red') return 'rgba(239,68,68,0.25)';    // red-500
    return 'rgba(255,255,255,0)';
  };

  // マス中心座標
  const cellCenter = (x, y) => ({
    cx: PAD + x * CELL + CELL / 2,
    cy: PAD + y * CELL + CELL / 2,
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-2xl border bg-white">
      {/* 盤面 */}
      {Array.from({ length: size }).map((_, y) =>
        Array.from({ length: size }).map((_, x) => {
          const k = keyOf(x, y);
          const t = tiles[k] || null;

          return (
            <g key={k}>
              {/* ハイライト */}
              <rect
                x={PAD + x * CELL}
                y={PAD + y * CELL}
                width={CELL}
                height={CELL}
                fill={tileFill(t)}
                onClick={() => onCellClick?.(x, y)}
              />
              {/* 罫線 */}
              <rect
                x={PAD + x * CELL}
                y={PAD + y * CELL}
                width={CELL}
                height={CELL}
                fill="none"
                stroke="rgba(0,0,0,0.12)"
              />
            </g>
          );
        })
      )}

      {/* ユニット（後から描くほど上に表示される） */}
      {units.map((u) => {
        const { cx, cy } = cellCenter(u.x, u.y);
        const selected = u.id === selectedUnitId;

        return (
          <g
            key={u.id}
            onClick={(e) => {
              e.stopPropagation();
              onUnitClick?.(u);
            }}
            style={{ cursor: 'pointer' }}
          >
            {/* チームリング（敵は赤） */}
            <circle
              cx={cx}
              cy={cy}
              r={20}
              fill="rgba(0,0,0,0.03)"
              stroke={u.team === 'enemy' ? 'rgba(239,68,68,0.8)' : 'rgba(59,130,246,0.8)'}
              strokeWidth="2"
            />
            <StickUnit cx={cx} cy={cy} parts={u.parts} selected={selected} />
          </g>
        );
      })}
    </svg>
  );
}