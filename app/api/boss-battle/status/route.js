// file: app/api/boss-battle/status/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { cookies } from 'next/headers';

const EVENT_ID = 1;

// ★★ イベント期間と目標正解数 ★★
// ここを書き換えればいつでもイベント内容を変更できる
// 例: 2025/1/10〜2025/1/17 にしたいときは下を変更
const EVENT_START = '2025-01-01T00:00:00+09:00';
const EVENT_END   = '2025-01-08T00:00:00+09:00';
const TARGET_CORRECT = 5000;

// ---- 共通: ログイン中ユーザー取得 ----
async function getCurrentUser() {
  const cookieStore = await cookies();
  const username = cookieStore.get('nb_username')?.value || null;
  if (!username) return null;

  const row = await db.get(
    `SELECT id FROM users WHERE username = $1`,
    [username]
  );
  return row || null;
}

export async function GET() {
  try {
    const now = new Date();
    const start = new Date(EVENT_START);
    const end = new Date(EVENT_END);
    const isActive = now >= start && now <= end;

    let totalCorrect = 0;
    let myCorrect = 0;

    // 全体累計
    const totalRow = await db.get(
      `SELECT total_correct FROM boss_battle_total WHERE event_id = $1`,
      [EVENT_ID]
    );
    if (totalRow && typeof totalRow.total_correct === 'number') {
      totalCorrect = totalRow.total_correct;
    }

    // 自分の累計
    const user = await getCurrentUser();
    if (user) {
      const myRow = await db.get(
        `SELECT correct_count FROM boss_battle_user WHERE event_id = $1 AND user_id = $2`,
        [EVENT_ID, user.id]
      );
      if (myRow && typeof myRow.correct_count === 'number') {
        myCorrect = myRow.correct_count;
      }
    }

    return NextResponse.json(
      {
        eventId: EVENT_ID,
        totalCorrect,
        myCorrect,
        targetCorrect: TARGET_CORRECT,
        startAt: EVENT_START,
        endAt: EVENT_END,
        isActive,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('boss-battle/status error:', e);
    return NextResponse.json(
      { error: 'ボスバトル状態の取得に失敗しました' },
      { status: 500 }
    );
  }
}
