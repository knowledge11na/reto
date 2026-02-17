// file: app/api/admin/quotes/chars/bulk/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

function parseLines(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;

    // ヘッダっぽい行をスキップ
    if (i === 0 && /char_no/i.test(line) && /name/i.test(line)) continue;

    const sep = line.includes('\t') ? '\t' : ',';
    const cols = line.split(sep);
    if (cols.length < 2) continue;

    const charNo = Number(String(cols[0] || '').trim());
    const name = String(cols[1] || '').trim();

    if (!Number.isFinite(charNo) || charNo <= 0) continue;
    if (!name) continue;

    out.push({ char_no: Math.floor(charNo), name });
  }
  return out;
}

async function upsertOne(row) {
  // char_no優先でupsert
  try {
    const r = await db.get(
      `
      INSERT INTO quote_characters (char_no, name)
      VALUES ($1, $2)
      ON CONFLICT (char_no) DO UPDATE
        SET name = EXCLUDED.name
      RETURNING id, char_no, name
      `,
      [row.char_no, row.name]
    );
    return r;
  } catch (e) {
    // name unique の衝突など
    if (e?.code !== '23505') throw e;
  }

  // nameが既にあるなら char_no を更新
  const r2 = await db.get(
    `
    UPDATE quote_characters
    SET char_no = $1
    WHERE name = $2
    RETURNING id, char_no, name
    `,
    [row.char_no, row.name]
  );
  if (r2) return r2;

  // 念のため
  const r3 = await db.get(
    `INSERT INTO quote_characters (char_no, name) VALUES ($1, $2) RETURNING id, char_no, name`,
    [row.char_no, row.name]
  );
  return r3;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    if (!text) {
      return NextResponse.json({ ok: false, message: 'text が空です' }, { status: 400 });
    }

    const items = parseLines(text);
    if (items.length === 0) {
      return NextResponse.json({ ok: false, message: '読み取れる行がありません' }, { status: 400 });
    }

    let applied = 0;
    let errors = 0;

    for (const it of items) {
      try {
        await upsertOne(it);
        applied++;
      } catch (e) {
        errors++;
        console.error('[bulk] failed', it, e);
      }
    }

    return NextResponse.json(
      { ok: true, totalParsed: items.length, applied, errors },
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: '一括投入に失敗しました' }, { status: 500 });
  }
}
