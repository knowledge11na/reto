// file: app/api/admin/suggestions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

async function requireAdmin(req) {
  try {
    const base = new URL(req.url);
    const url = `${base.origin}/api/admin/users?mode=stats`;

    const res = await fetch(url, {
      headers: { cookie: req.headers.get('cookie') || '' },
      cache: 'no-store',
    });

    if (!res.ok) return { ok: false };
    return { ok: true };
  } catch (e) {
    console.error('[requireAdmin]', e);
    return { ok: false };
  }
}

function cleanStr(v) {
  return String(v ?? '').trim();
}
function clip(s, max) {
  const t = cleanStr(s);
  return t.length > max ? t.slice(0, max) : t;
}

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: '権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  try {
    // db.all が無い環境向け：db.run で rows を取る
    const rows = await db.run(
      `
        SELECT id, user_id, user_id_text, user_name, category, body, status, admin_note, created_at, handled_at
        FROM suggestions
        ORDER BY created_at DESC
        LIMIT 500
      `,
      []
    );


    // db.run が { rows } 形式の可能性もあるので吸収
    const list = Array.isArray(rows) ? rows : rows?.rows || [];

    return NextResponse.json({ ok: true, rows: list });
  } catch (e) {
    console.error('[api/admin/suggestions GET]', e);
    return NextResponse.json(
      { ok: false, message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: '権限がありません（管理者のみ）' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) {
      return NextResponse.json(
        { ok: false, message: 'id が必要です' },
        { status: 400 }
      );
    }

    const status = cleanStr(body?.status || '');
    const adminNote =
      body?.adminNote != null ? clip(body.adminNote, 2000) : null;

    if (status) {
      if (status !== 'open' && status !== 'done') {
        return NextResponse.json(
          { ok: false, message: 'status は open / done のみ対応です' },
          { status: 400 }
        );
      }

      if (status === 'done') {
        await db.run(
          `
            UPDATE suggestions
            SET status = 'done', handled_at = now()
            WHERE id = $1
          `,
          [id]
        );
      } else {
        await db.run(
          `
            UPDATE suggestions
            SET status = 'open', handled_at = null
            WHERE id = $1
          `,
          [id]
        );
      }
    }

    if (adminNote !== null) {
      await db.run(
        `
          UPDATE suggestions
          SET admin_note = $2
          WHERE id = $1
        `,
        [id, adminNote]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/admin/suggestions PATCH]', e);
    return NextResponse.json(
      { ok: false, message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
