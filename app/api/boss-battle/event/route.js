// file: app/api/boss-battle/event/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// ★ このイベントの設定（/app/boss-battle/page.js と合わせる）
const EVENT_KEY = 'east-blue-202512';
const BOSS_TAG_LABEL = '東の海';
const GOAL_CORRECT = 3000;
const EVENT_PERIOD_LABEL = '2025/12/07 〜 2025/12/12';
const REWARD_ALL = 2000;
const REWARD_RANK1 = 3000;
const REWARD_RANK2 = 2000;
const REWARD_RANK3 = 1000;

// db.query ヘルパー
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdRaw = searchParams.get('userId');
    const userId = userIdRaw ? Number(userIdRaw) : null;

    // 全体の合計正解数
    const totalRow = (
      await queryRows(
        `
          SELECT COALESCE(SUM(correct_count), 0) AS total_correct
          FROM boss_battle_logs
          WHERE event_key = $1
        `,
        [EVENT_KEY]
      )
    )[0] || { total_correct: 0 };

    const totalCorrect = Number(totalRow.total_correct) || 0;

    // 自分の合計正解数
    let myCorrect = 0;
    if (userId) {
      const myRow = (
        await queryRows(
          `
            SELECT COALESCE(SUM(correct_count), 0) AS my_correct
            FROM boss_battle_logs
            WHERE event_key = $1 AND user_id = $2
          `,
          [EVENT_KEY, userId]
        )
      )[0] || { my_correct: 0 };

      myCorrect = Number(myRow.my_correct) || 0;
    }

    // ランキング（正解数の多い順）
    const rankingRows = await queryRows(
      `
        SELECT
          u.id,
          u.display_name,
          u.username,
          COALESCE(SUM(b.correct_count), 0) AS correct_sum
        FROM boss_battle_logs b
        JOIN users u ON u.id = b.user_id
        WHERE b.event_key = $1
        GROUP BY u.id, u.display_name, u.username
        ORDER BY correct_sum DESC, u.id ASC
        LIMIT 50
      `,
      [EVENT_KEY]
    );

    const ranking = rankingRows.map((r, index) => ({
      rank: index + 1,
      id: r.id,
      name:
        r.display_name ||
        r.username ||
        `ID: ${r.id}`,
      correct: Number(r.correct_sum) || 0,
    }));

    const event = {
      title: 'バクロギークロン',
      tagLabel: BOSS_TAG_LABEL,
      goalCorrect: GOAL_CORRECT,
      totalCorrect,
      myCorrect,
      periodLabel: EVENT_PERIOD_LABEL,
      rewardAll: REWARD_ALL,
      rewardRank1: REWARD_RANK1,
      rewardRank2: REWARD_RANK2,
      rewardRank3: REWARD_RANK3,
    };

    return NextResponse.json(
      {
        event,
        ranking,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/boss-battle/event error', e);
    return NextResponse.json(
      { error: 'イベント情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
