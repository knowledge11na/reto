// file: app/api/challenge/start/route.js
import db from '@/lib/db.js';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

// JSON配列 or カンマ区切り → 配列
function toStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];

    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
    }

    return t
      .split(/[、，,／/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request) {
  try {
    const { user_id } = await request.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id が必要です' }), {
        status: 400,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // -----------------------------------
    // 今日の投稿数（15問で復活権）
    // -----------------------------------
    const postRow = await db.get(
      `
        SELECT count
        FROM challenge_daily_posts
        WHERE user_id = $1 AND date = $2
      `,
      [user_id, today]
    );
    const todaysPosts = postRow?.count ?? 0;
    const hasPostingTicket = todaysPosts >= 15;

    // -----------------------------------
    // 今日プレイ済みか？
    // -----------------------------------
    const usedRow = await db.get(
      `
        SELECT 1
        FROM challenge_daily_attempts
        WHERE user_id = $1 AND date = $2
      `,
      [user_id, today]
    );
    const usedToday = !!usedRow;

    // -----------------------------------
    // 今日復活を使ったか？
    // challenge_daily_restore の行の有無だけで判定
    // -----------------------------------
    const restoreRow = await db.get(
      `
        SELECT 1
        FROM challenge_daily_restore
        WHERE user_id = $1 AND date = $2
      `,
      [user_id, today]
    );
    const restoredToday = !!restoreRow;

    // -----------------------------------
    // attemptCount を 0 / 1 / 2 として扱う
    // -----------------------------------
    const attemptCount = usedToday ? (restoredToday ? 2 : 1) : 0;

    // -----------------------------------
    // 今日許される回数
    // ・15問投稿していて復活未使用 → 2
    // ・それ以外 → 1
    // -----------------------------------
    const maxRuns = hasPostingTicket && !restoredToday ? 2 : 1;

    // 上限に到達している場合
    if (attemptCount >= maxRuns) {
      return new Response(
        JSON.stringify({
          error: '今日はすでにチャレンジモードに挑戦しています。',
        }),
        { status: 403 }
      );
    }

    // -----------------------------------
    // ここから実際にプレイ許可
    // 追加復活かどうか判定
    // -----------------------------------
    let isRestore = false;

    // 1回プレイ済みで、復活未使用で、15問投稿済み → 復活を使う
    if (attemptCount === 1 && hasPostingTicket && !restoredToday) {
      isRestore = true;

      await db.run(
        `
          INSERT INTO challenge_daily_restore (user_id, date)
          VALUES ($1, $2)
          ON CONFLICT (user_id, date) DO NOTHING
        `,
        [user_id, today]
      );
    }

    // -----------------------------------
    // 承認済み問題をランダム取得
    // ★ ここが重要：question を優先して返す（管理者編集が効く）
    // -----------------------------------
    const rows = await queryRows(
      `
        SELECT
          id,
          type,
          question_text,
          question,
          options_json,
          correct_answer,
          alt_answers_json,
          tags_json
        FROM question_submissions
        WHERE status = 'approved'
        ORDER BY RANDOM()
      `
    );

    const questions = rows.map((row) => {
      const qText = (row.question ?? row.question_text ?? '').toString();

      return {
        id: row.id,
        type: row.type || 'single',
        question: qText,
        options: toStringArray(row.options_json),
        correct: row.correct_answer ?? '',
        altAnswers: toStringArray(row.alt_answers_json),
        tags: toStringArray(row.tags_json),
      };
    });

    // -----------------------------------
    // 今日の「プレイ済み」フラグを記録
    // -----------------------------------
    await db.run(
      `
        INSERT INTO challenge_daily_attempts (user_id, date)
        VALUES ($1, $2)
        ON CONFLICT (user_id, date) DO NOTHING
      `,
      [user_id, today]
    );

    return new Response(
      JSON.stringify({
        ok: true,
        questions,
        restored: isRestore,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error('challenge/start error', err);
    return new Response(
      JSON.stringify({
        error: 'サーバーエラーが発生しました。',
      }),
      { status: 500 }
    );
  }
}
