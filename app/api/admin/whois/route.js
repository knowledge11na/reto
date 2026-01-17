// file: app/api/admin/whois/route.js
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
    const status = (url.searchParams.get('status') || '').trim();
    const q = (url.searchParams.get('q') || '').trim();

    const where = [];
    const params = [];
    let idx = 1;

    if (status) {
      where.push(`ws.status = $${idx++}`);
      params.push(status);
    }

    if (q) {
      where.push(
        `(
          ws.answer ILIKE '%' || $${idx} || '%'
          OR COALESCE(array_to_string(ws.hints,' '),'') ILIKE '%' || $${idx} || '%'
          OR COALESCE(array_to_string(ws.alt_answers,' '),'') ILIKE '%' || $${idx} || '%'
        )`
      );
      params.push(q);
      idx++;
    }

    let sql = `
      select
        ws.id, ws.status, ws.answer, ws.alt_answers, ws.hints, ws.explanation,
        ws.author_user_id, ws.author_username, ws.author_display_name, ws.created_at
      from whois_submissions ws
    `;

    if (where.length) sql += ` where ` + where.join(' and ');
    sql += ` order by ws.id desc`;

    const items = await queryRows(sql, params);
    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    console.error('/api/admin/whois GET error', e);
    return NextResponse.json({ error: '内部エラー' }, { status: 500 });
  }
}
