// file: app/api/story/save/route.js
import db from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

async function ensureTable() {
  // Postgres想定（Supabase/pg）
  await queryRows(`
    CREATE TABLE IF NOT EXISTS story_saves (
      user_id BIGINT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function GET(request) {
  try {
    await ensureTable();

    const url = new URL(request.url);
    const user_id = url.searchParams.get('user_id');
    if (!user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), { status: 400 });
    }

    const rows = await queryRows(
      `SELECT data, updated_at FROM story_saves WHERE user_id = $1`,
      [String(user_id)]
    );

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, exists: false, data: null }), { status: 200 });
    }

    return new Response(
      JSON.stringify({ ok: true, exists: true, data: rows[0].data, updated_at: rows[0].updated_at }),
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: 'server error' }), { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureTable();

    const body = await request.json().catch(() => ({}));
    const user_id = body.user_id;
    const data = body.data;

    if (!user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), { status: 400 });
    }
    if (!data || typeof data !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'data must be object' }), { status: 400 });
    }

    await queryRows(
      `
      INSERT INTO story_saves (user_id, data, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [String(user_id), JSON.stringify(data)]
    );

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: 'server error' }), { status: 500 });
  }
}
