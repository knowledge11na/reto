// file: lib/sim/waza.js
export function inferWazaEffect(waza) {
  const name = String(waza?.name ?? '').trim();
  const effectText = String(waza?.effect ?? '').trim();
  const t = effectText || name;

  if (t.includes('150%') || t.includes('150％')) return { kind: 'attack', atkMul: 1.5 };
  if (t.includes('100%') || t.includes('100％')) return { kind: 'attack', atkMul: 1.0 };
  if ((t.includes('20%') || t.includes('20％')) && t.includes('回復')) return { kind: 'heal', healPct: 0.2 };

  return { kind: 'special' };
}