// file: app/api/whois/submit/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/[・･\.\-―ー＿_（）()\[\]{}「」『』【】]/g, '')
    .toLowerCase();
}

function cleanArray(arr) {
  return (arr || [])
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0);
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const answer = String(body.answer ?? '').trim();
    const hints = cleanArray(body.hints || []);
    const altAnswers = cleanArray(body.altAnswers || []);
    const explanation = String(body.explanation ?? '').trim();
    const questionId = body.questionId ? String(body.questionId) : null;

    // 投稿ページ側で最大5にしてるが、念のためサーバでも制限
    const hintsClamped = hints.slice(0, 5);

    if (!answer) {
      return NextResponse.json({ error: '答えが必要です' }, { status: 400 });
    }
    if (hintsClamped.length < 1) {
      return NextResponse.json({ error: 'ヒントは最低1つ必要です' }, { status: 400 });
    }

    const answerNorm = norm(answer);
    if (!answerNorm) {
      return NextResponse.json({ error: '答えが不正です' }, { status: 400 });
    }

    // （任意）ログイン情報が取れるならここで author_* を埋める
    // 既存の /api/me を使う設計なら、フロントから userId 等を送ってOK
    const author_user_id = body.author_user_id ? Number(body.author_user_id) : null;
    const author_username = body.author_username ? String(body.author_username) : null;
    const author_display_name = body.author_display_name ? String(body.author_display_name) : null;

    await db.run(
      `
        insert into whois_submissions
          (status, question_id, answer, answer_norm, alt_answers, hints, explanation, tags,
           author_user_id, author_username, author_display_name)
        values
          ('pending', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        questionId,
        answer,
        answerNorm,
        altAnswers,
        hintsClamped,
        explanation,
        cleanArray(body.tags || []),
        author_user_id,
        author_username,
        author_display_name,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[whois/submit] error', e);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
