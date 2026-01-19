// file: app/api/whois/list/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  return [];
}

// text(箇条書き/改行/カンマ) → hints[]
function extractHintsFromText(text) {
  const raw = String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();
  if (!raw) return [];

  let parts = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1 && /[，,、､]/.test(raw)) {
    parts = raw
      .split(/[，,、､]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const out = [];
  for (const line of parts) {
    const t = String(line ?? '').replace(/^[・•\-\*\u2022●◯]+\s*/, '').trim();
    if (t) out.push(t);
    if (out.length >= 5) break;
  }
  return out.slice(0, 5);
}

/**
 * ✅ ここが本命：配列でも文字列でも
 * 「1要素に詰まったヒント」を必ず 1〜5 に分割して返す
 */
function normalizeHints(v) {
  const raw = Array.isArray(v) ? v.map((s) => String(s ?? '')).join('\n') : String(v ?? '');

  const text = raw
    .replace(/\r/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();

  if (!text) return [];

  // まず改行
  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  const bulletRe = /^[・•\-\*\u2022●◯]+\s*/;

  for (const lineRaw of lines) {
    const line = String(lineRaw ?? '').trim();
    if (!line) continue;

    // 1行に「・」等が複数あるなら分割
    if (/[・•\-\*\u2022●◯]/.test(line)) {
      const parts = line.split(/(?=[・•\-\*\u2022●◯])/g);
      if (parts.length >= 2) {
        for (const p of parts) {
          const t = String(p ?? '').replace(bulletRe, '').trim();
          if (t) out.push(t);
          if (out.length >= 5) break;
        }
        if (out.length >= 5) break;
        continue;
      }
    }

    // カンマ系で分割（全角カンマ/半角/読点/小さいカンマ）
    const parts2 = line
      .split(/[，,、､]/g)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts2.length >= 2) {
      for (const t of parts2) {
        const tt = String(t ?? '').replace(bulletRe, '').trim();
        if (tt) out.push(tt);
        if (out.length >= 5) break;
      }
      if (out.length >= 5) break;
    } else {
      const t = line.replace(bulletRe, '').trim();
      if (t) out.push(t);
      if (out.length >= 5) break;
    }
  }

  // まだ1個しか取れない＆長文なら句点でも分割（保険）
  if (out.length <= 1) {
    const more = text
      .split(/[。！？!？]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (more.length >= 2) out.splice(0, out.length, ...more);
  }

  return out
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function GET(req) {
  try {
    const url = new URL(req.url);

    const limitRaw = Number(url.searchParams.get('limit') || 2000);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? limitRaw : 2000));

    // whois_questions の列を確認（環境差吸収）
    const cols = await queryRows(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'whois_questions'
      `
    );
    const colSet = new Set((cols || []).map((r) => r.column_name));

    const hasHintsJson = colSet.has('hints_json');
    const hasAltJson = colSet.has('alt_answers_json');
    const hasAltArray = colSet.has('alt_answers');
    const hasExplanation = colSet.has('explanation');

    // SELECT を動的に組む
    const selectCols = ['id', 'answer', 'hints'];
    if (hasHintsJson) selectCols.push('hints_json');
    if (hasAltJson) selectCols.push('alt_answers_json');
    if (hasAltArray) selectCols.push('alt_answers');
    if (hasExplanation) selectCols.push('explanation');

    const rows = await queryRows(
      `
        SELECT ${selectCols.join(', ')}
        FROM whois_questions
        ORDER BY random()
        LIMIT $1
      `,
      [limit]
    );

    const questions = (rows || []).map((r) => {
      // hints: hints_json 優先 → hints(text/array) フォールバック
      let hintsArr = hasHintsJson ? parseJsonArray(r.hints_json) : [];
      hintsArr = hintsArr.map((s) => String(s ?? '').trim()).filter(Boolean);

      // ★ここが修正：配列が1要素でも中身を分割して 1〜5 にする
      let hintsFinal = [];
      if (hintsArr.length) hintsFinal = normalizeHints(hintsArr);
      if (!hintsFinal.length) hintsFinal = normalizeHints(r.hints);
      if (!hintsFinal.length) hintsFinal = extractHintsFromText(r.hints);

      // altAnswers: alt_answers_json 優先 → alt_answers(text[]) フォールバック
      let altArr = hasAltJson ? parseJsonArray(r.alt_answers_json) : [];
      if (!altArr.length && hasAltArray && Array.isArray(r.alt_answers)) altArr = r.alt_answers;
      altArr = altArr.map((s) => String(s ?? '').trim()).filter(Boolean);

      return {
        id: r.id,
        answer: String(r.answer ?? ''),
        hints: hintsFinal, // ✅ 必ず分割済みの配列で返す
        altAnswers: altArr,
        explanation: hasExplanation ? String(r.explanation ?? '') : '',
      };
    });

    return NextResponse.json({ questions }, { status: 200 });
  } catch (e) {
    console.error('[api/whois/list] error', e);
    return NextResponse.json(
      { error: '出題リストの取得に失敗しました（whois_questions を確認してください）' },
      { status: 500 }
    );
  }
}
