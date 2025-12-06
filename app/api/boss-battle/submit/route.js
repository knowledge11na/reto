// file: app/api/boss-battle/submit/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// ★ このイベントのキー（SQLの event_key と合わせる）
const EVENT_KEY = 'east-blue-202512'; // 好きな識別子にしてOK

// db.query の戻り値が配列 or { rows } どっちでも耐えるヘルパー
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = Number(body.userId);
    const correctCount = Number(body.correctCount);

    if (!userId || !Number.isInteger(userId)) {
      return NextResponse.json(
        { error: 'userId が不正です' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(correctCount) || correctCount <= 0) {
      // 0 以下なら何もせず成功扱いで返す
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    await queryRows(
      `
        INSERT INTO boss_battle_logs (user_id, event_key, correct_count)
        VALUES ($1, $2, $3)
      `,
      [userId, EVENT_KEY, correctCount]
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('/api/boss-battle/submit error', e);
    return NextResponse.json(
      { error: '保存中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
