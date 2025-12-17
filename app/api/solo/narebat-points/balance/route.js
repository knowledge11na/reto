// file: app/api/solo/narebat-points/balance/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function GET() {
  try {
    const nb = cookies().get('nb_username')?.value;
    if (!nb) {
      return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    }

    const rows = await queryRows('SELECT id, username, berries FROM users WHERE username = $1 LIMIT 1', [nb]);
    const u = rows?.[0];
    if (!u?.id) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      balance: Number(u.berries ?? 0),
      currency: 'berries_as_narebat_points',
    });
  } catch (e) {
    console.error('[narebat-points/balance]', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
