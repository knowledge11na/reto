// file: app/api/admin/quotes/chars/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

    if (!q) {
      const rows = await db.query(
        `SELECT id, char_no, name FROM quote_characters ORDER BY char_no NULLS LAST, id ASC LIMIT $1`,
        [limit]
      );
      const totalRow = await db.get(`SELECT COUNT(*)::int AS c FROM quote_characters`);
      return NextResponse.json(
        { ok: true, rows: rows || [], total: totalRow?.c ?? 0, source: 'db' },
        { status: 200 }
      );
    }

    const rows = await db.query(
      `
      SELECT id, char_no, name
      FROM quote_characters
      WHERE name ILIKE $1
      ORDER BY
        CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
        char_no NULLS LAST,
        id ASC
      LIMIT $3
      `,
      [`%${q}%`, `${q}%`, limit]
    );

    const totalRow = await db.get(`SELECT COUNT(*)::int AS c FROM quote_characters`);
    return NextResponse.json(
      { ok: true, rows: rows || [], total: totalRow?.c ?? 0, source: 'db' },
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ候補取得失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ ok: false, message: 'name は必須です' }, { status: 400 });
    }

    const existed = await db.get(
      `SELECT id, char_no, name FROM quote_characters WHERE name = $1`,
      [name]
    );
    if (existed) return NextResponse.json({ ok: true, row: existed, existed: true }, { status: 200 });

    const mx = await db.get(`SELECT COALESCE(MAX(char_no), 0) AS m FROM quote_characters`);
    const char_no = Number(mx?.m || 0) + 1;

    const row = await db.get(
      `INSERT INTO quote_characters (char_no, name) VALUES ($1, $2) RETURNING id, char_no, name`,
      [char_no, name]
    );

    return NextResponse.json({ ok: true, row, existed: false }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ追加失敗' }, { status: 500 });
  }
}
