// file: app/api/titles/owned/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

/**
 * 現在のユーザーが「どの称号IDを持っているか」を返すAPI。
 *
 * フロントからは /api/titles/owned?user_id=18 のように呼び出す。
 *
 * 返り値:
 *   { owned: [1, 2, 5, 19, ...] }
 *
 * 前提:
 *   user_titles テーブルがあり、カラムは (user_id, title_id) になっている。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUserId = searchParams.get('user_id');
    const userId = rawUserId ? Number(rawUserId) : NaN;

    if (!rawUserId || Number.isNaN(userId)) {
      return NextResponse.json(
        { owned: [], error: 'invalid_user', message: 'user_id が指定されていません' },
        { status: 400 }
      );
    }

    const rows = await db.query(
      `
        SELECT title_id
        FROM user_titles
        WHERE user_id = $1
      `,
      [userId]
    );

    const owned = Array.isArray(rows)
      ? rows.map((r) => r.title_id)
      : (rows.rows || []).map((r) => r.title_id);

    return NextResponse.json({ owned }, { status: 200 });
  } catch (e) {
    console.error('[api/titles/owned] error', e);
    return NextResponse.json(
      { owned: [], error: 'server_error' },
      { status: 500 }
    );
  }
}
