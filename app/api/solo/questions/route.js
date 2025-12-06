// file: app/api/solo/questions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

// db.query → rows配列として返すユーティリティ
async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

// JSON安全パース
function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

// correct_answer をインデックスっぽく書いたもの用（今はほぼ使わないが保険で残す）
// 例: "0,2,3" → [0,2,3]
function parseCorrectIndexes(row) {
  const qType = row.type;
  if (qType === 'text') return [];
  const raw = (row.correct_answer ?? '').toString().trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => !Number.isNaN(v));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'meteor';

    const params = [];
    const where = [];

    // ① ソロモードは承認済みだけ使う
    where.push("qs.status = 'approved'");

    // ② モード別タイプ絞り込み
    if (mode === 'meteor') {
      where.push("qs.type = 'text'");
    } else if (mode === 'sniper') {
      where.push("qs.type = 'single'");
    } else if (mode === 'boss') {
      where.push("qs.type IN ('single','multi','order','text')");
    }

    const sql = `
      SELECT
        qs.id,
        qs.type,
        qs.question AS question,
        qs.correct_answer,
        qs.options_json,
        qs.alt_answers_json,
        qs.tags_json
      FROM question_submissions qs
      WHERE ${where.join(' AND ')}
      ORDER BY RANDOM()
      LIMIT 200
    `;

    const rows = await queryRows(sql, params);

    const questions = rows.map((row) => {
      const options = safeJsonParse(row.options_json, []);
      const alt = safeJsonParse(row.alt_answers_json, []);
      const tags = safeJsonParse(row.tags_json, []);

      // ↓↓↓ ここがポイント ↓↓↓
      // multi / order は correct_answer に JSON で ["A","B"] みたいに入っているので
      // そのまま配列にして渡す。それ以外は文字列として渡す。
      let correct = null;

      if (row.type === 'multi' || row.type === 'order') {
        const parsed = safeJsonParse(row.correct_answer, null);
        if (Array.isArray(parsed)) {
          correct = parsed;
        }
      } else {
        if (typeof row.correct_answer === 'string') {
          correct = row.correct_answer;
        }
      }

      // 旧仕様の「0,2,3」みたいな書き方用の保険
      const correctIndexes = parseCorrectIndexes(row);

      return {
        id: row.id,
        type: row.type,
        text: row.question,
        options,
        // ★ ボスモードの判定はまず correct を見る
        correct,
        // ★ 旧仕様の名残り（今は基本使われないけど残しておく）
        correctIndexes,
        // 記述のメイン正解とかで使う
        answerText: row.correct_answer,
        altAnswers: alt,
        tags,
      };
    });

    return NextResponse.json({ ok: true, questions }, { status: 200 });
  } catch (e) {
    console.error('[api/solo/questions] error', e);
    return NextResponse.json(
      { ok: false, message: '問題取得時にエラーが発生しました' },
      { status: 500 }
    );
  }
}
