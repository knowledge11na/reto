// file: lib/sim/stage1.js

// 9x9
// 味方：真ん中下の4x4（x=2..5, y=5..8）から好きに置く
// 敵：奥真ん中にボス（x=4,y=0）
//     その前に雑魚4体を横並び（x=2..5,y=1）

export function buildStage1Initial() {
  const units = [
    // Enemy
    {
      id: 'boss',
      name: 'ボス',
      team: 'enemy',
      x: 4,
      y: 0,
      parts: { head: '#ff4d4d', body: '#ff4d4d', leg: '#ff4d4d' },
    },
    ...[2, 3, 4, 5].map((x, i) => ({
      id: `e${i + 1}`,
      name: `雑魚${i + 1}`,
      team: 'enemy',
      x,
      y: 1,
      parts: { head: '#fb7185', body: '#f43f5e', leg: '#be123c' },
    })),

    // Player（仮：最初は下側に並べておく。あとで「好きな場所に配置」にする）
    ...[
      { id: 'p1', x: 3, y: 7, c: { head: '#60a5fa', body: '#34d399', leg: '#fbbf24' } },
      { id: 'p2', x: 4, y: 7, c: { head: '#a78bfa', body: '#60a5fa', leg: '#34d399' } },
      { id: 'p3', x: 3, y: 8, c: { head: '#fbbf24', body: '#a78bfa', leg: '#60a5fa' } },
      { id: 'p4', x: 4, y: 8, c: { head: '#34d399', body: '#fbbf24', leg: '#a78bfa' } },
      { id: 'p5', x: 5, y: 8, c: { head: '#60a5fa', body: '#fbbf24', leg: '#34d399' } },
    ].map((p) => ({
      id: p.id,
      name: p.id.toUpperCase(),
      team: 'player',
      x: p.x,
      y: p.y,
      parts: p.c,
    })),
  ];

  // 初期の「移動範囲/攻撃範囲」デモ（適当）
  const tiles = {};
  // 例：真ん中下4x4を薄く表示（味方初期配置エリア）
  for (let y = 5; y <= 8; y++) {
    for (let x = 2; x <= 5; x++) {
      tiles[`${x},${y}`] = 'blue';
    }
  }
  // 例：敵前面を赤（攻撃範囲っぽく）
  for (let x = 1; x <= 7; x++) tiles[`${x},2}`] = 'red'; // ←ここわざとミスらないように注意
  // ↑行を正しく直す：
  for (let x = 1; x <= 7; x++) tiles[`${x},2`] = 'red';

  return { size: 9, units, tiles };
}