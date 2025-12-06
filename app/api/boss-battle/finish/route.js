import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { addBerriesByUserId } from '@/lib/berries.js';

/**
 * ★ ボスバトル報酬配布 API
 *
 * - 全体正解数が目標に到達したら参加者全員に +2000 ベリー
 * - ランキング上位へ追加報酬
 *   1位: +3000
 *   2位: +2000
 *   3位: +1000
 */

const GOAL = 3000; // ← ボス討伐目標（フロントと合わせてね）

export async function POST() {
  try {
    // 👥 全プレイヤーの累計正解数を集計（今回イベント分だけ）
    const ranking = await db.query(
      `
      SELECT 
        user_id,
        SUM(correct_count) AS total_correct
      FROM boss_battle_logs
      GROUP BY user_id
      ORDER BY total_correct DESC
      `
    );

    const rows = Array.isArray(ranking) ? ranking : ranking.rows;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { ok: false, message: '参加者がいません。' },
        { status: 400 }
      );
    }

    // 全体合計
    const totalCorrect = rows.reduce(
      (sum, r) => sum + Number(r.total_correct || 0),
      0
    );

    // 討伐成功したか？
    const cleared = totalCorrect >= GOAL;

    // 🎁 報酬定義
    const rewardAll = 2000;
    const rewardRank = [3000, 2000, 1000]; // 1,2,3位

    // === 全員報酬（討伐成功時のみ） ===
    if (cleared) {
      for (const r of rows) {
        await addBerriesByUserId(
          r.user_id,
          rewardAll,
          'ボス討伐成功ボーナス'
        );
      }
    }

    // === ランキング報酬 ===
    for (let i = 0; i < rows.length; i++) {
      if (i >= 3) break; // 3位まで
      const reward = rewardRank[i];
      if (!reward) continue;

      await addBerriesByUserId(
        rows[i].user_id,
        reward,
        `ボスバトル貢献度 ${i + 1}位`
      );
    }

    return NextResponse.json(
      {
        ok: true,
        cleared,
        totalCorrect,
        distributed: rows.length,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('boss-battle/finish error:', e);
    return NextResponse.json(
      { ok: false, message: '内部エラー発生' },
      { status: 500 }
    );
  }
}
