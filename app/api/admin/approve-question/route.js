// file: app/api/admin/approve-question/route.js
import db from '@/lib/db.js';
import { addBerriesByUserId } from '@/lib/berries';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);

    console.log('[approve-question] request body =', body);

    if (!id) {
      console.warn('[approve-question] id missing in body:', body);
      return new Response(
        JSON.stringify({ error: 'id が必要です' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // 投稿された問題を取得
    const submission = await db.get(
      'SELECT * FROM question_submissions WHERE id = $1',
      [id]
    );

    console.log('[approve-question] submission =', submission);

    if (!submission) {
      return new Response(
        JSON.stringify({ error: 'データが見つかりません' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // すでに承認済みなら二重付与防止
    if (submission.status === 'approved') {
      console.log(
        '[approve-question] already approved, skip reward. id =',
        id
      );
      return new Response(
        JSON.stringify({ ok: true, alreadyApproved: true }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // ---- 作問者ユーザーIDの特定 ----
    let authorUserId =
      submission.author_user_id ?? submission.user_id ?? null;

    console.log(
      '[approve-question] initial author_user_id =',
      submission.author_user_id,
      '/ user_id =',
      submission.user_id,
      '=>',
      authorUserId
    );

    // フォールバック（旧データ用）
    if (!authorUserId && submission.created_by) {
      try {
        const key = submission.created_by;

        const userRow = await db.get(
          `
          SELECT id, username, display_name, login_id
          FROM users
          WHERE display_name = $1
             OR username = $2
             OR login_id = $3
          LIMIT 1
          `,
          [key, key, key]
        );

        console.log(
          '[approve-question] fallback from created_by =',
          key,
          '=>',
          userRow
        );

        if (userRow) {
          authorUserId = userRow.id;
        }
      } catch (e) {
        console.error(
          '[approve-question] failed to resolve author from created_by:',
          e
        );
      }
    }

    console.log('[approve-question] final authorUserId =', authorUserId);

    // ステータス更新（author_user_id も埋める）
    await db.run(
      `
      UPDATE question_submissions
      SET
        status = 'approved',
        reviewed_at = NOW(),
        author_user_id = COALESCE(author_user_id, $1)
      WHERE id = $2
      `,
      [authorUserId ?? null, id]
    );

    // ベリー付与
    if (authorUserId) {
      try {
        console.log(
          '[approve-question] add 200 berries to user_id =',
          authorUserId,
          'submission id =',
          id
        );

        await addBerriesByUserId(
          authorUserId,
          200,
          '問題承認報酬'
        );
      } catch (e) {
        console.error(
          'addBerriesByUserId (approve) failed:',
          e
        );
      }
    } else {
      console.warn(
        `[approve-question] author_user_id 不明のため報酬スキップ (submission id=${id})`
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  } catch (err) {
    console.error('[/api/admin/approve-question] error:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラー' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
}
