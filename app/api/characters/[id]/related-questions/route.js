// file: app/api/characters/[id]/related-questions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, ctx) {
  try {
    const params = await ctx?.params;
    const characterId = Number(params?.id);

    if (!Number.isFinite(characterId) || characterId <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid_character_id' }, { status: 400 });
    }

    // ★ related_word 前提で取得
    const ch = await db.get(
      `SELECT id, name, related_word FROM characters WHERE id = $1`,
      [characterId]
    );

    if (!ch) {
      return NextResponse.json({ ok: false, error: 'character_not_found' }, { status: 404 });
    }

    // ★ 必ず related_word を使う
    const word = ch.related_word.toString().trim();
    const like = `%${word}%`;

    const rows = await db.query(
      `
      SELECT
        id,
        type,
        question_text,
        question,
        options_json,
        correct_answer,
        alt_answers_json,
        tags_json
      FROM question_submissions
      WHERE status = 'approved'
        AND (
          COALESCE(question_text,'') ILIKE $1
          OR COALESCE(question,'') ILIKE $1
          OR COALESCE(correct_answer,'') ILIKE $1
          OR COALESCE(alt_answers_json::text,'') ILIKE $1
          OR COALESCE(options_json::text,'') ILIKE $1
          OR COALESCE(tags_json::text,'') ILIKE $1
        )
      ORDER BY id DESC
      LIMIT 300
      `,
      [like]
    );

    return NextResponse.json(
      {
        ok: true,
        character: { id: String(ch.id), name: ch.name },
        word,              // ← 実際に検索したワード
        questions: rows,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/characters/[id]/related-questions GET error:', e);
    return NextResponse.json(
      { ok: false, error: 'failed_to_load_related_questions' },
      { status: 500 }
    );
  }
}
