// file: lib/sim/damage.js
export function dmgMin1(n) {
  const v = Math.floor(Number(n || 0));
  return Math.max(1, v);
}

export function calcPlayerToEnemyDamage(playerAtk, enemyDef, atkMul = 1) {
  const raw = Math.floor(playerAtk * atkMul) - Math.floor(enemyDef);
  return dmgMin1(raw);
}

export function calcEnemyToPlayerDamageOnCorrect(enemyAtk, playerDef) {
  const raw = Math.floor(enemyAtk) - Math.floor(playerDef);
  return dmgMin1(raw);
}

export function calcEnemyToPlayerDamageOnWrong(enemyAtk) {
  return dmgMin1(enemyAtk);
}