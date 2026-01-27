// file: lib/reports.js
import db from './db.js';

// 共通：db.query を rows 配列に正規化
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

// ==============================
// プレイヤー側：不備報告の新規作成
// ==============================
export async function createQuestionReport({
  question_id,
  reported_by_user_id = null,
  source_mode = null,
  battle_id = null,
  challenge_run_id = null,
  comment,
}) {
  const rows = await queryRows(
    `
      INSERT INTO question_reports
        (question_id, reported_by_user_id, source_mode, battle_id, challenge_run_id, comment)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      question_id,
      reported_by_user_id,
      source_mode,
      battle_id,
      challenge_run_id,
      comment,
    ]
  );

  return rows[0] || null;
}

// ==============================
// 共通：DBステータス <-> 画面ステータス
// ==============================

function statusKeyToRawStatus(key) {
  // 画面: 'open' / 'fixed' / 'dismissed' / 'all'
  switch (key) {
    case 'open':
      return 'pending';
    case 'fixed':
      return 'resolved';
    case 'dismissed':
      return 'ignored';
    case 'all':
      return null;
    default:
      return 'pending';
  }
}

function rawStatusToStatusKey(raw) {
  // DB: 'pending' | 'resolved' | 'ignored'
  switch (raw) {
    case 'pending':
      return 'open';
    case 'resolved':
      return 'fixed';
    case 'ignored':
      return 'dismissed';
    default:
      return 'open';
  }
}

// ==============================
// 管理者用：一覧取得
//  - 不備報告者を users から引いて表示できるようにする
// ==============================
export async function listQuestionReportsForAdmin({
  statusKey = 'open',
  limit = 100,
  offset = 0,
} = {}) {
  const rawStatus = statusKeyToRawStatus(statusKey);

  let sql = `
    SELECT
      qr.*,
      qs.question_text AS question_text,
      qs.correct_answer AS correct_answer,
      qs.options_json AS options_json,
      u.username AS reporter_username,
      u.display_name AS reporter_display_name
    FROM question_reports qr
    LEFT JOIN question_submissions qs ON qs.id = qr.question_id
    LEFT JOIN users u ON u.id = qr.reported_by_user_id
  `;

  const params = [];
  if (rawStatus) {
    sql += ` WHERE qr.status = $1`;
    params.push(rawStatus);
  }

  sql += `
    ORDER BY qr.created_at DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;
  params.push(limit, offset);

  const rows = await queryRows(sql, params);

  return rows.map((r) => {
    const reporterDisplay =
      (r.reporter_display_name || '').trim() ||
      (r.reporter_username || '').trim() ||
      '';

    return {
      id: r.id,
      question_id: r.question_id,

      // 後方互換（既存の管理画面がこれを使ってても壊れない）
      reporter_user_id: r.reported_by_user_id,

      // ★追加：誰から来たか分かる情報
      reporter_username: r.reporter_username || '',
      reporter_display_name: r.reporter_display_name || '',
      reporter_label: reporterDisplay, // 画面表示用（display_name優先→username）

      question_text: r.question_text || '',
      comment: r.comment,
      admin_note: r.admin_note || '',
      raw_status: r.status,
      status_key: rawStatusToStatusKey(r.status),
      created_at: r.created_at,
      updated_at: r.updated_at,
      correct_answer: r.correct_answer || '',
      options_json: r.options_json || null,
    };
  });
}

// ==============================
// 管理者用：ステータス更新 ＋ 管理メモ
//  - 更新後の返り値にも報告者情報を付ける
// ==============================
export async function updateQuestionReportForAdmin({
  id,
  statusKey,
  adminNote = '',
}) {
  const rawStatus = statusKeyToRawStatus(statusKey) || 'pending';

  await queryRows(
    `
      UPDATE question_reports
         SET status = $1,
             admin_note = $2,
             updated_at = NOW()
       WHERE id = $3
    `,
    [rawStatus, adminNote, id]
  );

  const rows = await queryRows(
    `
      SELECT
        qr.*,
        qs.question_text AS question_text,
        qs.correct_answer AS correct_answer,
        qs.options_json AS options_json,
        u.username AS reporter_username,
        u.display_name AS reporter_display_name
      FROM question_reports qr
      LEFT JOIN question_submissions qs ON qs.id = qr.question_id
      LEFT JOIN users u ON u.id = qr.reported_by_user_id
      WHERE qr.id = $1
    `,
    [id]
  );

  const r = rows[0];
  if (!r) return null;

  const reporterDisplay =
    (r.reporter_display_name || '').trim() ||
    (r.reporter_username || '').trim() ||
    '';

  return {
    id: r.id,
    question_id: r.question_id,

    reporter_user_id: r.reported_by_user_id,
    reporter_username: r.reporter_username || '',
    reporter_display_name: r.reporter_display_name || '',
    reporter_label: reporterDisplay,

    question_text: r.question_text || '',
    comment: r.comment,
    admin_note: r.admin_note || '',
    raw_status: r.status,
    status_key: rawStatusToStatusKey(r.status),
    created_at: r.created_at,
    updated_at: r.updated_at,
    correct_answer: r.correct_answer || '',
    options_json: r.options_json || null,
  };
}
