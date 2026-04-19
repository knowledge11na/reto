// file: lib/rating.js
import db from './db.js';
import { addBerriesByUserId } from './berries.js';

/**
 * ★保険：calcRatingWithMargin が他所にあって import されてない環境でも落ちないようにする
 * - 既にグローバル/他importで calcRatingWithMargin があるならそれを使う
 * - 無いならここにある簡易版を使う
 */
function calcRatingWithMarginFallback(
  u1,
  u2,
  score1,
  score2,
  time1,
  time2
) 
{
  // ---- ここは「とりあえず動く」Elo簡易版（引き分けあり） ----
  // 既存の本実装があるならそっちが優先される（後述）
  const K = 24;

  const r1 = Number(u1.rating) || 1500;
  const r2 = Number(u2.rating) || 1500;

  // 勝敗（スコアで判断、同点なら時間で判断、完全同条件は引き分け）
  let isDraw = false;
  let winnerId = null;

if (score1 > score2) {
  winnerId = u1.id;
} else if (score1 < score2) {
  winnerId = u2.id;
} else {
  // ★ 同点なら時間で勝敗
  if (time1 < time2) winnerId = u1.id;
  else if (time1 > time2) winnerId = u2.id;
  else isDraw = true;
}

  const s1 = isDraw ? 0.5 : winnerId === u1.id ? 1 : 0;
  const s2 = isDraw ? 0.5 : 1 - s1;

  const e1 = 1 / (1 + Math.pow(10, (r2 - r1) / 400));
  const e2 = 1 - e1;

  const new1 = Math.round(r1 + K * (s1 - e1));
  const new2 = Math.round(r2 + K * (s2 - e2));

  const delta1 = new1 - r1;
  const delta2 = new2 - r2;

  // 連勝（超簡易：勝ったら+1、負けたら0、引き分けは維持）
  const cur1 = Number(u1.win_streak ?? 0);
  const cur2 = Number(u2.win_streak ?? 0);
  let newStreak1 = cur1;
  let newStreak2 = cur2;

  if (!isDraw) {
    if (winnerId === u1.id) {
      newStreak1 = cur1 + 1;
      newStreak2 = 0;
    } else {
      newStreak2 = cur2 + 1;
      newStreak1 = 0;
    }
  }

  const maxStreak1 = Math.max(Number(u1.max_win_streak ?? 0), newStreak1);
  const maxStreak2 = Math.max(Number(u2.max_win_streak ?? 0), newStreak2);

  return {
    new1,
    new2,
    delta1,
    delta2,
    winnerId,
    isDraw,
    newStreak1,
    newStreak2,
    maxStreak1,
    maxStreak2,
  };
}

// ★本命が存在するならそれを使い、無ければフォールバック
const calcRatingWithMarginSafe =
  (typeof calcRatingWithMargin !== 'undefined' && calcRatingWithMargin) ||
  calcRatingWithMarginFallback;

// ===============================
// ★ 対人レート戦（既存のまま）
// ===============================
export async function finalizeRateMatch({
  user1Id,
  user2Id,
  score1,
  score2,
  totalTime1,
  totalTime2,
  roomId,
}) {
  const u1 = await db.get(
    `
      SELECT id, username, rating, wins, losses,
             matches_played AS games_played,
             current_streak AS win_streak,
             best_streak AS max_win_streak
      FROM users
      WHERE id = $1
    `,
    [user1Id]
  );

  const u2 = await db.get(
    `
      SELECT id, username, rating, wins, losses,
             matches_played AS games_played,
             current_streak AS win_streak,
             best_streak AS max_win_streak
      FROM users
      WHERE id = $1
    `,
    [user2Id]
  );

  if (!u1 || !u2) throw new Error('ユーザーが見つかりません');

  const result = calcRatingWithMarginSafe(
  u1,
  u2,
  score1,
  score2,
  totalTime1,
  totalTime2
);
  const {
    new1,
    new2,
    delta1,
    delta2,
    winnerId,
    isDraw,
    newStreak1,
    newStreak2,
    maxStreak1,
    maxStreak2,
  } = result;

  const gp1 = (u1.games_played ?? 0) + 1;
  const gp2 = (u2.games_played ?? 0) + 1;

  let newWins1 = u1.wins ?? 0;
  let newWins2 = u2.wins ?? 0;
  let newLoss1 = u1.losses ?? 0;
  let newLoss2 = u2.losses ?? 0;

  if (!isDraw) {
    if (winnerId === u1.id) {
      newWins1 += 1;
      newLoss2 += 1;
    } else {
      newWins2 += 1;
      newLoss1 += 1;
    }
  }

  await db.run(
    `
      UPDATE users
      SET rating = $1,
          wins = $2,
          losses = $3,
          matches_played = $4,
          current_streak = $5,
          best_streak = $6
      WHERE id = $7
    `,
    [new1, newWins1, newLoss1, gp1, newStreak1, maxStreak1, u1.id]
  );

  await db.run(
    `
      UPDATE users
      SET rating = $1,
          wins = $2,
          losses = $3,
          matches_played = $4,
          current_streak = $5,
          best_streak = $6
      WHERE id = $7
    `,
    [new2, newWins2, newLoss2, gp2, newStreak2, maxStreak2, u2.id]
  );

  await db.run(
    `
      INSERT INTO matches (
        user1_id, user2_id,
        score_user1, score_user2,
        time_ms_user1, time_ms_user2,
        winner_id,
        rating_change_user1, rating_change_user2,
        mode, room_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      u1.id,
      u2.id,
      score1,
      score2,
      totalTime1,
      totalTime2,
      winnerId,
      delta1,
      delta2,
      'rate',
      roomId,
    ]
  );

  if (!isDraw && winnerId) {
    await addBerriesByUserId(winnerId, 300, 'レート戦勝利報酬');
  }

  return {
    winnerId,
    isDraw,
    delta1,
    delta2,
    newRating1: new1,
    newRating2: new2,
  };
}

// ===============================
// ★ CPU戦用（DB列に完全対応）
// ===============================
export async function finalizeCpuRateMatch({
  userId,
  cpuName,
  cpuRating,
  scoreUser,
  scoreCpu,
  totalTimeUser,
  totalTimeCpu,
  roomId,
}) {
  const u = await db.get(
    `
      SELECT
        id,
        username,
        rating,
        wins,
        losses,
        matches_played AS games_played,
        current_streak AS win_streak,
        best_streak AS max_win_streak
      FROM users
      WHERE id = $1
    `,
    [userId]
  );
  if (!u) throw new Error('ユーザーが見つかりません');

  const cpu = {
    id: 'cpu',
    username: cpuName || 'CPU',
    rating: Number(cpuRating) || 1500,
    wins: 0,
    losses: 0,
    games_played: 0,
    win_streak: 0,
    max_win_streak: 0,
  };

const result = calcRatingWithMarginSafe(
  u,
  cpu,
  scoreUser,
  scoreCpu,
  totalTimeUser,
  totalTimeCpu
);
  const { new1, delta1, winnerId, isDraw, newStreak1, maxStreak1 } = result;

  const gp = (u.games_played ?? 0) + 1;
  let newWins = u.wins ?? 0;
  let newLoss = u.losses ?? 0;

  if (!isDraw) {
    if (winnerId === u.id) newWins += 1;
    else newLoss += 1;
  }

  await db.run(
    `
      UPDATE users
      SET rating = $1,
          wins = $2,
          losses = $3,
          matches_played = $4,
          current_streak = $5,
          best_streak = $6
      WHERE id = $7
    `,
    [new1, newWins, newLoss, gp, newStreak1, maxStreak1, u.id]
  );

  try {
    await db.run(
      `
        INSERT INTO matches (
          user1_id, user2_id,
          score_user1, score_user2,
          time_ms_user1, time_ms_user2,
          winner_id,
          rating_change_user1, rating_change_user2,
          mode, room_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        u.id,
        null,
        scoreUser,
        scoreCpu,
        totalTimeUser,
        totalTimeCpu,
        winnerId === u.id ? u.id : null,
        delta1,
        0,
        'cpu',
        roomId || null,
      ]
    );
  } catch (e) {
    console.warn('[rating] matches insert skipped (cpu):', e?.message || e);
  }

  if (!isDraw && winnerId === u.id) {
    await addBerriesByUserId(u.id, 300, 'CPUレート戦勝利報酬');
  }

  return {
    isDraw,
    winnerId: winnerId === u.id ? u.id : null,
    deltaUser: delta1,
    newRatingUser: new1,
  };
}
