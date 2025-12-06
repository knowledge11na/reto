// file: app/api/me/titles/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { cookies } from 'next/headers';

// 現在ログイン中ユーザー取得
async function getCurrentUser() {
  const cookieStore = await cookies();
  const username = cookieStore.get('nb_username')?.value ?? null;
  if (!username) return null;

  const user = await db.get(
    `
      SELECT
        id,
        username,
        display_name,
        equipped_title
      FROM users
      WHERE username = $1
    `,
    [username]
  );

  return user || null;
}

// GET: 自分の称号一覧 + 装備中の自由称号
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'not logged in' },
        { status: 401 }
      );
    }

    const titles = await db.query(
      `
        SELECT
          id,
          title_name,
          obtained_at
        FROM user_titles
        WHERE user_id = $1
        ORDER BY obtained_at ASC, id ASC
      `,
      [user.id]
    );

    return NextResponse.json(
      {
        ok: true,
        titles,
        equippedTitle: user.equipped_title ?? null,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/me/titles GET error', e);
    return NextResponse.json(
      { ok: false, message: 'internal error' },
      { status: 500 }
    );
  }
}

// POST: 称号を装備 / 解除
// body: { titleId: number } or { unequip: true }
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'not logged in' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // 解除
    if (body.unequip) {
      await db.run(
        `
          UPDATE users
          SET equipped_title = NULL
          WHERE id = $1
        `,
        [user.id]
      );

      return NextResponse.json(
        { ok: true, equippedTitle: null },
        { status: 200 }
      );
    }

    const titleIdRaw = body.titleId;
    const titleId = Number(titleIdRaw);

    if (!titleIdRaw || Number.isNaN(titleId)) {
      return NextResponse.json(
        { ok: false, message: 'titleId が不正です' },
        { status: 400 }
      );
    }

    // 自分の称号か確認
    const row = await db.get(
      `
        SELECT
          id,
          title_name
        FROM user_titles
        WHERE id = $1 AND user_id = $2
      `,
      [titleId, user.id]
    );

    if (!row) {
      return NextResponse.json(
        { ok: false, message: 'その称号は所持していません' },
        { status: 404 }
      );
    }

    // users.equipped_title に反映
    await db.run(
      `
        UPDATE users
        SET equipped_title = $1
        WHERE id = $2
      `,
      [row.title_name, user.id]
    );

    return NextResponse.json(
      { ok: true, equippedTitle: row.title_name },
      { status: 200 }
    );
  } catch (e) {
    console.error('/api/me/titles POST error', e);
    return NextResponse.json(
      { ok: false, message: 'internal error' },
      { status: 500 }
    );
  }
}
