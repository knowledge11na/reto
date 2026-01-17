// file: app/api/admin/whois/approve/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

function toJsonString(v, fallback = '[]') {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
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

// text(箇条書き) → hints[]
function extractHintsFromText(text) {
  const raw = String(text ?? '').replace(/\r/g, '\n');

  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^私は誰でしょう/.test(s));

  const out = [];
  for (const line of lines) {
    const t = line.replace(/^[・\-\*\u2022]+\s*/, '').trim();
    if (t) out.push(t);
    if (out.length >= 5) break;
  }

  if (out.length === 0) {
    const t = raw.trim();
    if (t) out.push(t);
  }

  return out.slice(0, 5);
}

function buildHintsText(hintsArr) {
  return (hintsArr || [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .map((s) => `・${s}`)
    .join('\n');
}

function colInfoMap(cols) {
  const m = new Map();
  for (const r of cols || []) {
    m.set(r.column_name, r);
  }
  return m;
}

function isTextArrayCol(info) {
  // Postgres: arrays show up as data_type='ARRAY', udt_name like '_text'
  if (!info) return false;
  return info.data_type === 'ARRAY' && String(info.udt_name || '').startsWith('_');
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

    const sub = await db.get(`SELECT * FROM whois_submissions WHERE id = $1`, [id]);
    if (!sub) return NextResponse.json({ error: 'データが見つかりません' }, { status: 404 });

    if (sub.status === 'approved') {
      return NextResponse.json({ ok: true, alreadyApproved: true }, { status: 200 });
    }

    const answer = String(sub.answer || '').trim();
    if (!answer) return NextResponse.json({ error: 'answer が空です' }, { status: 400 });

    // ---- hints：hints_json → hints(text) → question(text)
    let hintsArr = parseJsonArray(sub.hints_json)
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);

    if (!hintsArr.length) hintsArr = extractHintsFromText(sub.hints);
    if (!hintsArr.length) hintsArr = extractHintsFromText(sub.question);

    // ここで最低1つ必須
    hintsArr = hintsArr.slice(0, 5);
    if (!hintsArr.length) {
      return NextResponse.json({ error: 'hints が空です（最低1つ必要）' }, { status: 400 });
    }

    const hintsText = buildHintsText(hintsArr);
    const hintsJson = toJsonString(hintsArr, '[]');

    // alt answers
    const altArr = parseJsonArray(sub.alt_answers_json)
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    const altJson = toJsonString(altArr, '[]');

    const explanation = sub.explanation ? String(sub.explanation) : '';

    // whois_questions の列と型を確認
    const cols = await queryRows(
      `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'whois_questions'
      `
    );
    const cm = colInfoMap(cols);

    const hintsCol = cm.get('hints');
    if (!hintsCol) {
      return NextResponse.json(
        { error: 'whois_questions に hints カラムがありません（DB設計を確認して）' },
        { status: 500 }
      );
    }

    const hintsIsArray = isTextArrayCol(hintsCol);

    const hasHintsJson = cm.has('hints_json');
    const hasAltJson = cm.has('alt_answers_json');
    const hasAlt = cm.has('alt_answers');
    const altIsArray = hasAlt ? isTextArrayCol(cm.get('alt_answers')) : false;
    const hasExplanation = cm.has('explanation');

    const existing = await db.get(
      `SELECT id FROM whois_questions WHERE answer = $1 LIMIT 1`,
      [answer]
    );

    // INSERT / UPDATE を列に合わせて組み立て
    const insertCols = ['answer', 'hints'];
    const insertVals = ['$1', '$2'];
    const params = [
      answer,
      hintsIsArray ? hintsArr : hintsText, // ★ 型に合わせる
    ];
    let p = 3;

    // hints 型キャスト（安全）
    if (hintsIsArray) {
      insertVals[1] = '$2::text[]';
    }

    if (hasHintsJson) {
      insertCols.push('hints_json');
      insertVals.push(`$${p}::jsonb`);
      params.push(hintsJson);
      p++;
    }

    if (hasAltJson) {
      insertCols.push('alt_answers_json');
      insertVals.push(`$${p}::jsonb`);
      params.push(altJson);
      p++;
    } else if (hasAlt) {
      insertCols.push('alt_answers');
      if (altIsArray) {
        insertVals.push(`$${p}::text[]`);
        params.push(altArr); // ★ 配列で渡す
      } else {
        // text などの場合：区切って1本にして格納（必要ならここを変更）
        insertVals.push(`$${p}`);
        params.push(altArr.join('、'));
      }
      p++;
    }

    if (hasExplanation) {
      insertCols.push('explanation');
      insertVals.push(`$${p}`);
      params.push(explanation);
      p++;
    }

    if (!existing) {
      await db.query(
        `INSERT INTO whois_questions (${insertCols.join(', ')})
         VALUES (${insertVals.join(', ')})`,
        params
      );
    } else {
      const sets = [];
      const uParams = [existing.id];
      let up = 2;

      // hints
      sets.push(`hints = $${up}${hintsIsArray ? '::text[]' : ''}`);
      uParams.push(hintsIsArray ? hintsArr : hintsText);
      up++;

      if (hasHintsJson) {
        sets.push(`hints_json = $${up}::jsonb`);
        uParams.push(hintsJson);
        up++;
      }

      if (hasAltJson) {
        sets.push(`alt_answers_json = $${up}::jsonb`);
        uParams.push(altJson);
        up++;
      } else if (hasAlt) {
        if (altIsArray) {
          sets.push(`alt_answers = $${up}::text[]`);
          uParams.push(altArr);
        } else {
          sets.push(`alt_answers = $${up}`);
          uParams.push(altArr.join('、'));
        }
        up++;
      }

      if (hasExplanation) {
        sets.push(`explanation = $${up}`);
        uParams.push(explanation);
        up++;
      }

      await db.query(
        `UPDATE whois_questions SET ${sets.join(', ')} WHERE id = $1`,
        uParams
      );
    }

    // submissions を approved に（reviewed_at が無いDBもあるので吸収）
try {
  const colsS = await queryRows(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'whois_submissions'
    `
  );
  const subColSet = new Set((colsS || []).map((r) => r.column_name));

  if (subColSet.has('reviewed_at')) {
    await db.query(
      `UPDATE whois_submissions
       SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1`,
      [id]
    );
  } else {
    await db.query(
      `UPDATE whois_submissions
       SET status = 'approved'
       WHERE id = $1`,
      [id]
    );
  }
} catch {
  // 情報スキーマ取得に失敗しても status だけは更新を試みる
  await db.query(
    `UPDATE whois_submissions
     SET status = 'approved'
     WHERE id = $1`,
    [id]
  );
}


    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('/api/admin/whois/approve error', e);
    return NextResponse.json({ error: e?.message || 'サーバーエラー' }, { status: 500 });
  }
}
