// file: app/api/solo/narebat-points/reward/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const pointsRaw = body?.points;
    const points = Math.max(0, Math.floor(Number(pointsRaw) || 0));

    if (!points) {
      return NextResponse.json({ ok: true, added: 0 });
    }

    // ログイン識別（/api/me のログに nb_username が出てるのでそれを利用）
    const nb = cookies().get('nb_username')?.value;
    if (!nb) {
      return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    }

    const users = await queryRows('SELECT id, username, berries FROM users WHERE username = $1 LIMIT 1', [nb]);
    const user = users?.[0];
    if (!user?.id) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    // まずは berries を “ナレバトポイント” として加算（後で専用カラム作るならここを差し替え）
    await db.query('UPDATE users SET berries = COALESCE(berries, 0) + $1 WHERE id = $2', [points, user.id]);

    const after = await queryRows('SELECT id, username, berries FROM users WHERE id = $1 LIMIT 1', [user.id]);

    return NextResponse.json({
      ok: true,
      added: points,
      balance: Number(after?.[0]?.berries ?? 0),
      currency: 'berries_as_narebat_points',
    });
  } catch (e) {
    console.error('[narebat-points/reward]', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
