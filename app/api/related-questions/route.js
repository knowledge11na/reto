// file: app/api/related-questions/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function loadSearchWordByCharNo(charNo) {
  const filePath = path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cols = trimmed.split(',');
    if (cols.length < 3) continue;

    const id = Number(cols[0]);
    if (!Number.isFinite(id) || id !== charNo) continue;

    const name = (cols[1] ?? '').trim();
    const searchRaw = cols[3];
    let search_word = (searchRaw ?? '').trim();

    if (!search_word) {
      const s = name.replace(/\s+/g, ' ').trim();
      const parts = s.split(/[・\s]/).filter(Boolean);
      search_word = parts.length ? parts[parts.length - 1] : s;
    }

    return { char_no: id, name, search_word };
  }

  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const charNo = Number(searchParams.get('char_no'));

    if (!Number.isFinite(charNo) || charNo <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid_char_no' }, { status: 400 });
    }

    const meta = loadSearchWordByCharNo(charNo);
    if (!meta || !meta.search_word) {
      return NextResponse.json({ ok: true, keyword: '', questions: [], meta }, { status: 200 });
    }

    const word = meta.search_word;

    const rows = await db.query(
      `
        SELECT
          id,
          type,
          question_text,
          question,
          correct_answer,
          alt_answers_json,
          tags_json
        FROM question_submissions
        WHERE status = 'approved'
          AND (
            COALESCE(question_text, question, '') ILIKE '%' || $1 || '%'
            OR COALESCE(correct_answer, '') ILIKE '%' || $1 || '%'
            OR COALESCE(alt_answers_json::text, '') ILIKE '%' || $1 || '%'
          )
        ORDER BY id DESC
        LIMIT 300
      `,
      [word]
    );

    return NextResponse.json(
      {
        ok: true,
        meta,
        keyword: word,
        questions: rows,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/related-questions error', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
