// file: app/api/solo/dungeon/question/route.js
import db from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prevRaw = body?.prevQuestionId ?? null;
    const prevId = prevRaw ? Number(prevRaw) : null;

    const params = ['approved'];
    let extraWhere = '';

    // 直前の問題は除外（同じ問題連発防止）
    if (!Number.isNaN(prevId) && prevId) {
      extraWhere = 'AND qs.id <> $2';
      params.push(prevId);
    }

    const rows = await queryRows(
      `
        SELECT
          qs.id,
          qs.type,
          qs.question_text,
          qs.question,
          qs.options_json,
          qs.correct_answer,
          qs.alt_answers_json,
          qs.tags_json
        FROM question_submissions AS qs
        WHERE qs.status = $1
          -- ★ 複数選択専用：type = 'multi' だけ
          AND qs.type = 'multi'
          -- ★ 選択肢がちゃんと入っているものだけ
          AND qs.options_json IS NOT NULL
          AND length(trim(qs.options_json::text)) > 4
          ${extraWhere}
        ORDER BY RANDOM()
        LIMIT 1
      `,
      params
    );

    const row = rows[0];
    if (!row) {
      return new Response(
        JSON.stringify({ error: 'no_question' }),
        { status: 404 }
      );
    }

    return new Response(
      JSON.stringify({
        id: row.id,
        type: row.type,
        question_text: row.question_text,
        question: row.question,
        options_json: row.options_json,
        correct_answer: row.correct_answer,
        alt_answers_json: row.alt_answers_json,
        tags_json: row.tags_json,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (e) {
    console.error('/api/solo/dungeon/question POST error', e);
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500 }
    );
  }
}
