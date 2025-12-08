// file: app/api/my-questions/stats/route.js
import db from '@/lib/db.js';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('nb_username')?.value || null;

    if (!username) {
      return new Response(JSON.stringify({ error: 'ログインが必要です。' }), {
        status: 401,
      });
    }

    const user = await db.get(
      `SELECT id FROM users WHERE username = $1`,
      [username]
    );
    if (!user) {
      return new Response(JSON.stringify({ error: 'ユーザーが見つかりません' }), {
        status: 401,
      });
    }

    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);

    const total = (await db.get(
      `SELECT COUNT(*)::int AS c FROM question_submissions WHERE author_user_id = $1`,
      [userId]
    ))?.c ?? 0;

    const approved = (await db.get(
      `SELECT COUNT(*)::int AS c FROM question_submissions WHERE author_user_id = $1 AND status = 'approved'`,
      [userId]
    ))?.c ?? 0;

    const postRow = await db.get(
      `SELECT count FROM challenge_daily_posts WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );
    const todayPosts = postRow?.count ?? 0;

    const usedToday = !!(await db.get(
      `SELECT 1 FROM challenge_daily_attempts WHERE user_id = $1 AND date = $2`,
      [userId, today]
    ));

    const restoredToday = !!(await db.get(
      `SELECT restored FROM challenge_daily_restore WHERE user_id = $1 AND date = $2`,
      [userId, today]
    ))?.restored;

    return new Response(
      JSON.stringify({
        total,
        approved,
        todayPosts,
        usedToday,
        restoredToday,
      }),
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
      status: 500,
    });
  }
}
