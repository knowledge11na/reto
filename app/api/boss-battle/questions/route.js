// file: app/api/boss-battle/questions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// ★ ボスイベントで使うタグ
//   ここを書き換えるだけで出題範囲を変えられる
//   例) '頂上戦争', 'ワノ国' など
const TARGET_TAG = '東の海';

// db.query が配列 or { rows } どちらでも動くように
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET() {
  try {
    const rows = await queryRows(
      `
      SELECT 
        id,
        type,
        question       AS question_text,
        correct_answer,
        options_json,
        alt_answers_json,
        tags_json
      FROM question_submissions
      WHERE status = 'approved'
        AND tags_json::text ILIKE '%' || $1 || '%'
      ORDER BY RANDOM()
      LIMIT 50
      `,
      [TARGET_TAG]
    );

    return NextResponse.json({ questions: rows }, { status: 200 });
  } catch (e) {
    console.error('boss-battle/questions error:', e);
    return NextResponse.json(
      { error: 'ボスバトル用の問題取得に失敗しました' },
      { status: 500 }
    );
  }
}
