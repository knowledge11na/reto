// file: app/api/admin/questions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// db.query が配列 or { rows } のどちらでも動くようにするヘルパー
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

// DB行 → フロント用に整形
function mapQuestionRow(row) {
  let options = [];
  let altAnswers = [];
  let tags = [];

  // options_json -> options[]
  try {
    if (row.options_json) {
      const parsed =
        typeof row.options_json === 'string'
          ? JSON.parse(row.options_json)
          : row.options_json;
      if (Array.isArray(parsed)) options = parsed;
    }
  } catch {
    options = [];
  }

  // alt_answers_json -> alt_answers[]
  try {
    if (row.alt_answers_json) {
      const parsed =
        typeof row.alt_answers_json === 'string'
          ? JSON.parse(row.alt_answers_json)
          : row.alt_answers_json;
      if (Array.isArray(parsed)) {
        altAnswers = parsed
          .map((v) => String(v).trim())
          .filter((s) => s !== '');
      }
    }
  } catch {
    altAnswers = [];
  }

  // tags_json -> tags[]
  try {
    if (row.tags_json) {
      const parsed =
        typeof row.tags_json === 'string'
          ? JSON.parse(row.tags_json)
          : row.tags_json;
      if (Array.isArray(parsed)) {
        tags = parsed
          .map((v) => String(v).trim())
          .filter((s) => s !== '');
      }
    }
  } catch {
    tags = [];
  }

  // ★ ここも challenge 側と同じ思想で question 優先
  const questionText = (row.question ?? row.question_text ?? '').toString();

  return {
    id: row.id,
    question_type: row.question_type ?? row.type ?? 'single',
    question: questionText,
    options,
    correct_answer: row.correct_answer ?? '',
    alt_answers: altAnswers,
    tags,
    status: row.status,

    // 作問者表示用
    created_by: row.created_by ?? null,
    author_user_id: row.author_user_id ?? null,
    author_username: row.author_username ?? null,
    author_display_name: row.author_display_name ?? null,
  };
}

// =========================================
// GET: 問題一覧（フィルタ・検索付き）
// =========================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const status = (searchParams.get('status') || '').trim(); // pending / approved / rejected / ''
    const keyword = (searchParams.get('q') || '').trim();
    const tag = (searchParams.get('tag') || '').trim();

    const where = [];
    const params = [];
    let idx = 1;

    if (status) {
      where.push(`qs.status = $${idx++}`);
      params.push(status);
    }

    if (keyword) {
      where.push(
        `
        (
          COALESCE(qs.question, '')                ILIKE '%' || $${idx} || '%'
          OR COALESCE(qs.question_text, '')       ILIKE '%' || $${idx} || '%'
          OR COALESCE(qs.correct_answer, '')      ILIKE '%' || $${idx} || '%'
          OR COALESCE(qs.alt_answers_json::text,'') ILIKE '%' || $${idx} || '%'
          OR COALESCE(qs.created_by, '')          ILIKE '%' || $${idx} || '%'
          OR COALESCE(u.display_name, '')         ILIKE '%' || $${idx} || '%'
          OR COALESCE(u.username, '')             ILIKE '%' || $${idx} || '%'
        )
        `.trim()
      );
      params.push(keyword);
      idx++;
    }

    if (tag) {
      where.push(
        `COALESCE(qs.tags_json::text, '') ILIKE '%' || $${idx} || '%'`
      );
      params.push(tag);
      idx++;
    }

    let sql = `
      SELECT
        qs.id,
        qs.type AS question_type,
        qs.question,
        qs.question_text,
        qs.correct_answer,
        qs.alt_answers_json,
        qs.options_json,
        qs.tags_json,
        qs.status,
        qs.created_by,
        qs.author_user_id,
        u.username      AS author_username,
        u.display_name  AS author_display_name
      FROM question_submissions qs
      LEFT JOIN users u
        ON u.id = qs.author_user_id
    `;

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ');
    }

    sql += ' ORDER BY qs.id DESC';

    const rows = await queryRows(sql, params);
    const questions = rows.map(mapQuestionRow);

    return NextResponse.json({ questions }, { status: 200 });
  } catch (e) {
    console.error('/api/admin/questions GET error', e);
    return NextResponse.json(
      { error: '内部エラーが発生しました' },
      { status: 500 }
    );
  }
}

// =========================================
// POST: 編集保存 or 却下
// =========================================
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    // ★ 却下処理（pending/approved どちらからでもOK）
    if (body.action === 'reject') {
      const id = Number(body.id);

      if (!id) {
        return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
      }

      // reject_reason カラムが無くても動くように、status と reviewed_at だけ更新
      await db.query(
        `
          UPDATE question_submissions
          SET
            status = 'rejected',
            reviewed_at = NOW()
          WHERE id = $1
        `,
        [id]
      );

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // ▼ ここから編集保存（問題内容の変更）
    const id = Number(body.id);
    if (!id) {
      return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    }

    const question = (body.question || '').toString();
    const type = (body.question_type || body.type || 'single').toString();

    const optionsArray = Array.isArray(body.options)
      ? body.options.map((s) => String(s).trim()).filter((s) => s !== '')
      : [];

    const correctAnswer = (body.correct_answer || '').toString();

    const altArray = Array.isArray(body.alt_answers)
      ? body.alt_answers.map((s) => String(s).trim()).filter((s) => s !== '')
      : [];

    const tagsArray = Array.isArray(body.tags)
      ? body.tags.map((s) => String(s).trim()).filter((s) => s !== '')
      : [];

    const optionsJson = optionsArray.length > 0 ? JSON.stringify(optionsArray) : null;
    const altJson = altArray.length > 0 ? JSON.stringify(altArray) : null;
    const tagsJson = tagsArray.length > 0 ? JSON.stringify(tagsArray) : null;

    // ★ 重要：question と question_text を両方更新（互換維持）
    await db.query(
      `
        UPDATE question_submissions
        SET
          type = $1,
          question = $2,
          question_text = $2,
          correct_answer = $3,
          options_json = $4::jsonb,
          alt_answers_json = $5::jsonb,
          tags_json = $6::jsonb
        WHERE id = $7
      `,
      [type, question, correctAnswer, optionsJson, altJson, tagsJson, id]
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('/api/admin/questions POST error', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}

// =========================================
// DELETE: 却下済みの問題を完全削除
// =========================================
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id') || '');

    if (!id) {
      return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    }

    // 一応ステータス確認（保険）
    const rows = await queryRows(
      `SELECT status FROM question_submissions WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return NextResponse.json({ error: '問題が見つかりません' }, { status: 404 });
    }
    if (rows[0].status !== 'rejected') {
      return NextResponse.json(
        { error: '却下済みの問題のみ削除できます' },
        { status: 400 }
      );
    }

    await db.query(`DELETE FROM question_submissions WHERE id = $1`, [id]);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('/api/admin/questions DELETE error', e);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
