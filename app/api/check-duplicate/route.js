// file: app/api/check-duplicate/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

/**
 * 類似問題チェック API
 *
 * body: { type, question, options, answer, correctAnswer, submissionId }
 * 戻り値: { ok: true, duplicates: [ ... ] }
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const {
      type,
      question,
      options = [],
      answer,
      correctAnswer: rawCorrectAnswer,
      submissionId,
    } = body || {};

    const correctAnswer = rawCorrectAnswer || answer || '';

    // 文字列正規化（空白と句読点を削るだけの簡易版）
    const normalizeText = (s) =>
      (s || '')
        .replace(/\s+/g, '')
        .replace(/[。、．，,.、]/g, '');

    // 「順番無視で7割一致」をざっくり見るための類似度
    const textSimilarity = (a, b) => {
      const s1 = normalizeText(a);
      const s2 = normalizeText(b);
      if (!s1 || !s2) return 0;

      const arr1 = [...s1];
      const arr2 = [...s2];

      const counts = {};
      for (const ch of arr1) {
        counts[ch] = (counts[ch] || 0) + 1;
      }
      let common = 0;
      for (const ch of arr2) {
        if (counts[ch]) {
          counts[ch] -= 1;
          common += 1;
        }
      }
      const longer = Math.max(arr1.length, arr2.length);
      if (longer === 0) return 0;
      return common / longer;
    };

    // 選択肢の正規化（順番無視で比較）
    const normalizeOptions = (opts) =>
      (opts || [])
        .map((o) => (o || '').trim())
        .filter((o) => o)
        .sort();

    // ★ 答えの正規化：
    // - "A||B" / '["A","B"]' を吸収
    // - 各要素を normalizeText して比較（見た目が同じ揺れを吸収）
    // - set比較（順序違い吸収）も残す
    const parseAnswerList = (v) => {
      const raw = String(v ?? '').trim();
      if (!raw) return [];

      const norm = (x) => normalizeText(String(x ?? '').trim());

      // JSON配列文字列 → 配列化
      if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            return arr.map(norm).filter(Boolean);
          }
        } catch {
          // fallthrough
        }
      }

      // "A||B" 形式 → 分割
      if (raw.includes('||')) {
        return raw
          .split('||')
          .map(norm)
          .filter(Boolean);
      }

      // 単一
      return [norm(raw)].filter(Boolean);
    };

    const buildAnswerKeys = (v) => {
      const list = parseAnswerList(v);
      const ordered = list.join('||');
      const set = list.slice().sort().join('||');
      return { ordered, set };
    };

    const isAnswerEqual = (a, b) => {
      const A = buildAnswerKeys(a);
      const B = buildAnswerKeys(b);
      if (!A.ordered || !B.ordered) return false;

      // どっちか一致したらOK（multi/orderはset一致で吸収）
      return A.ordered === B.ordered || A.set === B.set;
    };

    const thisOptionsKey = normalizeOptions(options).join('|');
    const questionText = question || '';

    // DB から questions + question_submissions をまとめて取得（Supabase / Postgres）
        const rows = await db.query(
      `
        SELECT
          id,
          question_text,
          question,
          correct_answer,
          NULL AS answer,
          options_json::text AS options_json,
          status,
          'questions' AS source
        FROM questions
        WHERE status = 'approved'
        UNION ALL
        SELECT
          id,
          question_text,
          question,
          correct_answer,
          answer,
          options_json::text AS options_json,
          status,
          'question_submissions' AS source
        FROM question_submissions
        WHERE status IN ('pending', 'approved')
      `,
      []
    );


    const duplicates = [];

    for (const row of rows) {
      const qText = row.question_text || row.question || '';
      const candAnswer = row.correct_answer || row.answer || '';

      let candOptions = [];

      if (row.options_json) {
        if (Array.isArray(row.options_json)) {
          candOptions = row.options_json;
        } else if (typeof row.options_json === 'string') {
          try {
            const parsed = JSON.parse(row.options_json);
            if (Array.isArray(parsed)) candOptions = parsed;
          } catch {
            candOptions = [];
          }
        }
      }

      // 投稿中の自分自身は除外
      if (
        submissionId &&
        row.source === 'question_submissions' &&
        row.id === submissionId
      ) {
        continue;
      }

      // ★ 丸コピペ対策：問題文が完全一致なら答え関係なく弾く
      const cond0 = normalizeText(questionText) === normalizeText(qText);


      // 条件①: 問題文7割以上一致 ＋ 答え一致（正規化して比較）
      const sim = textSimilarity(questionText, qText);
      const cond1 =
        sim >= 0.7 &&
        !!correctAnswer &&
        !!candAnswer &&
        isAnswerEqual(correctAnswer, candAnswer);

      // 条件②: 選択肢セット完全一致 ＋ 答え一致（正規化して比較）
      let cond2 = false;
      if (thisOptionsKey && candOptions && candOptions.length > 0) {
        const candKey = candOptions
          .slice()
          .map((o) => (o || '').trim())
          .filter((o) => o)
          .sort()
          .join('|');
        cond2 =
          !!candKey &&
          !!thisOptionsKey &&
          candKey === thisOptionsKey &&
          !!correctAnswer &&
          !!candAnswer &&
          isAnswerEqual(correctAnswer, candAnswer);
      }

            if (cond0 || cond1 || cond2) {
        duplicates.push({
          id: row.id,
          question_text: qText,
          correct_answer: candAnswer,
          options: candOptions,
          status: row.status,
          source: row.source,
          similarity: sim,
        });
      }
    }

    // ★ここで「完全に同じ問題」は1件にまとめる
    const uniqMap = new Map();

    for (const d of duplicates) {
      const key =
        normalizeText(d.question_text) +
        '||' +
        (d.correct_answer || '') +
        '||' +
        d.source;
      if (!uniqMap.has(key)) {
        uniqMap.set(key, d);
      }
    }

    const uniqueDuplicates = Array.from(uniqMap.values());

    return NextResponse.json({ ok: true, duplicates: uniqueDuplicates });
  } catch (err) {
    console.error('check-duplicate error', err);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
