// file: app/api/whois/list/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET(req) {
  try {
    const url = new URL(req.url);

    const limitRaw = Number(url.searchParams.get('limit') || 2000);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? limitRaw : 2000));

    // whois_questions（承認済み＝本番）から出題
    const rows = await queryRows(
      `
        select
          id,
          answer,
          alt_answers,
          hints,
          explanation
        from whois_questions
        order by random()
        limit $1
      `,
      [limit]
    );

    const questions = (rows || []).map((r) => ({
      id: r.id,
      hints: Array.isArray(r.hints) ? r.hints : [],
      answer: String(r.answer ?? ''),
      altAnswers: Array.isArray(r.alt_answers) ? r.alt_answers : [],
      explanation: String(r.explanation ?? ''),
    }));

    return NextResponse.json({ questions }, { status: 200 });
  } catch (e) {
    console.error('[api/whois/list] error', e);
    return NextResponse.json(
      { error: '出題リストの取得に失敗しました（whois_questions を確認してください）' },
      { status: 500 }
    );
  }
}
