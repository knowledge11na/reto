// file: app/api/boss-battle/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { addBerriesByUserId } from '@/lib/berries.js';
import {
  BOSS_EVENT_KEY,
  BOSS_TAG_LABEL,
  BOSS_EVENT_START,
  BOSS_EVENT_END,
  BOSS_GOAL_CORRECT,
  BOSS_REWARD_ALL,
  BOSS_REWARD_RANK,
} from '@/lib/boss-battle-config.js';

// db.query の結果を配列化するヘルパー
function rowsFrom(res) {
  return Array.isArray(res) ? res : res?.rows || [];
}

// ★ 報酬配布を一度だけ実行するヘルパー
async function distributeRewardsIfNeeded() {
  const now = new Date();

  const end = new Date(BOSS_EVENT_END);
  if (now < end) {
    // まだイベント期間内 → 何もしない
    return { ran: false, reason: 'not_ended_yet' };
  }

  // すでにこのイベントで配布済みならスキップ
  const alreadyRes = await db.query(
    `SELECT id FROM boss_battle_reward_runs WHERE event_key = $1`,
    [BOSS_EVENT_KEY]
  );
  const alreadyRows = rowsFrom(alreadyRes);
  if (alreadyRows.length > 0) {
    return { ran: false, reason: 'already_distributed' };
  }

  // ここから実際の配布ロジック
  // 1) イベントの累計正解ランキングを集計
  const rankingRes = await db.query(
    `
      SELECT
        user_id,
        SUM(correct_count) AS total_correct
      FROM boss_battle_logs
      WHERE event_key = $1
      GROUP BY user_id
      HAVING SUM(correct_count) > 0
      ORDER BY total_correct DESC
    `,
    [BOSS_EVENT_KEY]
  );
  const ranking = rowsFrom(rankingRes);

  if (ranking.length === 0) {
    // 誰も参加してなかった場合も「配布済み扱い」にしておく
    await db.query(
      `INSERT INTO boss_battle_reward_runs (event_key) VALUES ($1)`,
      [BOSS_EVENT_KEY]
    );
    return { ran: false, reason: 'no_participants' };
  }

  // 全体合計
  const totalCorrect = ranking.reduce(
    (sum, r) => sum + Number(r.total_correct || 0),
    0
  );

  const cleared = totalCorrect >= BOSS_GOAL_CORRECT;

  // ========= ここからベリー配布 =========

  // ① 討伐成功なら全員に配布
  if (cleared) {
    for (const r of ranking) {
      const userId = r.user_id;
      await addBerriesByUserId(
        userId,
        BOSS_REWARD_ALL,
        `ボスバトル(${BOSS_EVENT_KEY}) 討伐成功ボーナス`
      );
    }
  }

  // ② ランキング追加報酬（1〜3位）
  for (let i = 0; i < ranking.length && i < 3; i++) {
    const extra = BOSS_REWARD_RANK[i];
    if (!extra) continue;

    const r = ranking[i];
    await addBerriesByUserId(
      r.user_id,
      extra,
      `ボスバトル(${BOSS_EVENT_KEY}) 貢献度 ${i + 1}位ボーナス`
    );
  }

  // ③ 配布したことを記録（これで二重配布を防ぐ）
  await db.query(
    `INSERT INTO boss_battle_reward_runs (event_key) VALUES ($1)`,
    [BOSS_EVENT_KEY]
  );

  return {
    ran: true,
    cleared,
    totalCorrect,
    participants: ranking.length,
  };
}

export async function GET() {
  try {
    const now = new Date();
    const start = new Date(BOSS_EVENT_START);
    const end = new Date(BOSS_EVENT_END);

    // ★ イベント状態
    let status = 'upcoming'; // upcoming / active / ended
    if (now >= start && now <= end) status = 'active';
    if (now > end) status = 'ended';

    // ★ 全体の進捗
    const totalRes = await db.query(
      `
        SELECT
          COALESCE(SUM(correct_count), 0) AS total_correct
        FROM boss_battle_logs
        WHERE event_key = $1
      `,
      [BOSS_EVENT_KEY]
    );
    const totalRow = rowsFrom(totalRes)[0] || { total_correct: 0 };
    const totalCorrect = Number(totalRow.total_correct || 0);
    const goal = BOSS_GOAL_CORRECT;

    // ★（ここでは myCorrect は 0 にしておく。
    //    実際にはクッキーから user_id を取って、同じ event_key で SUM すればOK）
    const myCorrect = 0;

    // ★ 簡易ランキング（上位 50 くらいまでで十分）
    const rankingRes = await db.query(
      `
        SELECT
          user_id,
          SUM(correct_count) AS total_correct
        FROM boss_battle_logs
        WHERE event_key = $1
        GROUP BY user_id
        HAVING SUM(correct_count) > 0
        ORDER BY total_correct DESC
        LIMIT 50
      `,
      [BOSS_EVENT_KEY]
    );
    const rankingRows = rowsFrom(rankingRes);

    const ranking = rankingRows.map((r, idx) => ({
      rank: idx + 1,
      user_id: r.user_id,
      correct: Number(r.total_correct || 0),
    }));

    // ★ もしイベント終了済みなら、このタイミングで自動配布チェック
    let rewardInfo = null;
    if (status === 'ended') {
      rewardInfo = await distributeRewardsIfNeeded();
    }

    return NextResponse.json(
      {
        ok: true,
        status,
        event: {
          key: BOSS_EVENT_KEY,
          tagLabel: BOSS_TAG_LABEL,
          startAt: BOSS_EVENT_START,
          endAt: BOSS_EVENT_END,
          goalCorrect: goal,
          totalCorrect,
          myCorrect,
          rewardAll: BOSS_REWARD_ALL,
          rewardRank: BOSS_REWARD_RANK,
        },
        ranking,
        rewardInfo,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/boss-battle GET error:', e);
    return NextResponse.json(
      { ok: false, error: '内部エラーが発生しました' },
      { status: 500 }
    );
  }
}
