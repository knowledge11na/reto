// file: lib/mistakes.js
import db from './db.js';

// db.query が配列 or { rows } どちらでも動くように統一
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

/**
 * ユーザーが問題を間違えたときに記録する
 * ・同じ user_id + question_id があれば wrong_count++ & last_wrong_at 更新
 * ・なければ新規 INSERT
 */
export async function addUserMistake(userId, questionId) {
  if (!userId || !questionId) return;

  const rows = await queryRows(
    `
      SELECT id, wrong_count
        FROM user_mistakes
       WHERE user_id = $1
         AND question_id = $2
    `,
    [userId, questionId]
  );

  const row = rows[0];

  if (!row) {
    await queryRows(
      `
        INSERT INTO user_mistakes (user_id, question_id, wrong_count, last_wrong_at)
        VALUES ($1, $2, 1, NOW())
      `,
      [userId, questionId]
    );
  } else {
    await queryRows(
      `
        UPDATE user_mistakes
           SET wrong_count = wrong_count + 1,
               last_wrong_at = NOW()
         WHERE id = $1
      `,
      [row.id]
    );
  }
}

/**
 * 弱点克服モードで「正解したとき」にミスを減らす
 * ・wrong_count > 1 なら 1 減らす
 * ・wrong_count <= 1 なら行ごと削除
 */
export async function reduceUserMistake(userId, questionId) {
  if (!userId || !questionId) return;

  const rows = await queryRows(
    `
      SELECT id, wrong_count
        FROM user_mistakes
       WHERE user_id = $1
         AND question_id = $2
    `,
    [userId, questionId]
  );

  const row = rows[0];
  if (!row) return;

  if (Number(row.wrong_count) > 1) {
    await queryRows(
      `
        UPDATE user_mistakes
           SET wrong_count = wrong_count - 1
         WHERE id = $1
      `,
      [row.id]
    );
  } else {
    await queryRows(
      `
        DELETE FROM user_mistakes
         WHERE id = $1
      `,
      [row.id]
    );
  }
}

/**
 * そのユーザーが最近間違えた問題を、問題文ごと取ってくる
 * ※ question_submissions と JOIN する
 * ※ is_favorite / is_learned も返す（リロードしても状態が消えない用）
 */
export async function getUserMistakesWithQuestions(userId, limit = 2000) {
  if (!userId) return [];

  const rows = await queryRows(
    `
      SELECT
        um.id,
        um.question_id,
        um.wrong_count,
        um.last_wrong_at,
        um.is_favorite,
        um.is_learned,

        qs.question_text,
        qs.question,
        qs.type          AS question_type,
        qs.options_json,
        qs.correct_answer,
        qs.tags_json,
        qs.alt_answers_json
      FROM user_mistakes um
      JOIN question_submissions qs ON qs.id = um.question_id
      WHERE um.user_id = $1
      ORDER BY um.last_wrong_at DESC, um.id DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return rows;
}
