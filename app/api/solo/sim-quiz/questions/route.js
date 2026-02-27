// file: app/api/solo/sim-quiz/questions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
        WHERE status = $1
        ORDER BY id DESC
        LIMIT 2000
      `,
      ['approved']
    );

    return NextResponse.json({ ok: true, questions: rows || [] }, { status: 200 });
  } catch (e) {
    console.error('sim-quiz/questions error:', e);
    return NextResponse.json({ ok: false, error: e.message || 'server_error' }, { status: 500 });
  }
}