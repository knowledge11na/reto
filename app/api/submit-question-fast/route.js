import { NextResponse } from 'next/server';
import pkg from 'pg';

const { Pool } = pkg;

// ★ 最小構成：dotenv / db.js / cookies 一切使わない
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

function normalizeAnswer(type, answer) {
  const raw = String(answer ?? '').trim();
  if (!raw) return '';
  if ((type === 'multi' || type === 'order') && raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map(String).map(s => s.trim()).filter(Boolean).join('||');
      }
    } catch {}
  }
  return raw;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      type,
      question,
      options = [],
      answer,
      tags = [],
      altAnswers = [],
    } = body;

    const questionText = String(question || '').trim();
    if (!questionText) {
      return NextResponse.json({ ok: false, error: 'question required' }, { status: 400 });
    }

    const cleanedOptions = options.map(String).map(s => s.trim()).filter(Boolean);
    const cleanedAlt = altAnswers.map(String).map(s => s.trim()).filter(Boolean);
    const cleanedTags = tags.map(String);

    const questionType = type || (cleanedOptions.length ? 'single' : 'text');
    const correctAnswer = normalizeAnswer(questionType, answer);

    await pool.query(
      `
        INSERT INTO question_submissions
          (type, question, options, answer, status,
           question_text, options_json, correct_answer,
           alt_answers_json, tags_json, updated_at)
        VALUES
          ($1,$2,$3,$4,'pending',
           $5,$6,$7,$8,$9,NOW())
      `,
      [
        questionType,
        questionText,
        cleanedOptions.join('||'),
        correctAnswer,
        questionText,
        JSON.stringify(cleanedOptions),
        correctAnswer,
        JSON.stringify(cleanedAlt),
        JSON.stringify(cleanedTags),
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[submit-question-fast]', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
