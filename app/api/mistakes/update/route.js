// file: app/api/mistakes/update/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db.js';

async function getLoginUserId() {
  const cookieStore = await cookies();
  const username = cookieStore.get('nb_username')?.value || null;
  if (!username) return null;

  const user = await db.get('SELECT id FROM users WHERE username = $1', [
    username,
  ]);
  return user?.id || null;
}

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

export async function POST(req) {
  try {
    const userId = await getLoginUserId();

    if (!userId) {
      return NextResponse.json(
        { ok: false, reason: 'NOT_LOGGED_IN' },
        { status: 200 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, id, value } = body;

    if (!action || !id) {
      return NextResponse.json(
        { ok: false, error: 'action / id がありません' },
        { status: 400 }
      );
    }

    if (action === 'delete') {
      await queryRows(`DELETE FROM user_mistakes WHERE id = $1 AND user_id = $2`, [
        String(id),
        String(userId),
      ]);
      return NextResponse.json({ ok: true });
    }

    if (action === 'favorite') {
      await queryRows(
        `UPDATE user_mistakes SET is_favorite = $1 WHERE id = $2 AND user_id = $3`,
        [!!value, String(id), String(userId)]
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'learned') {
      await queryRows(
        `UPDATE user_mistakes SET is_learned = $1 WHERE id = $2 AND user_id = $3`,
        [!!value, String(id), String(userId)]
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: '不明な action' },
      { status: 400 }
    );
  } catch (e) {
    console.error('/api/mistakes/update error', e);
    return NextResponse.json(
      { ok: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
