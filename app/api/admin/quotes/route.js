// file: app/api/admin/quotes/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSpeakers(input) {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);

  // 重複除去（順序保持）
  const seen = new Set();
  const uniq = [];
  for (const n of cleaned) {
    if (seen.has(n)) continue;
    seen.add(n);
    uniq.push(n);
  }
  return uniq.slice(0, 12);
}

let _schemaCache = null;
/**
 * episode_quotes に speaker_names があるか/型は何かをキャッシュして判定
 * - jsonb / text[] / text などに揺れてもなるべく動くようにする
 */
async function getEpisodeQuotesSchema() {
  if (_schemaCache) return _schemaCache;
  try {
    const cols = await db.query(
      `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='episode_quotes'
      `,
      []
    );

    const map = new Map();
    for (const r of cols || []) {
      const name = String(r.column_name || '');
      map.set(name, {
        data_type: String(r.data_type || ''),
        udt_name: String(r.udt_name || ''),
      });
    }

    const speakerCol = map.get('speaker_names') || null;

    // jsonb: data_type = 'jsonb'
    // text[]: data_type='ARRAY' && udt_name='_text'
    // text: data_type='text'
    const speakerMode = speakerCol
      ? speakerCol.data_type === 'jsonb'
        ? 'jsonb'
        : speakerCol.data_type === 'ARRAY' && speakerCol.udt_name === '_text'
        ? 'text_array'
        : speakerCol.data_type === 'text'
        ? 'text'
        : 'unknown'
      : 'none';

    _schemaCache = {
      hasSpeakerNames: Boolean(speakerCol),
      speakerMode,
    };
    return _schemaCache;
  } catch {
    _schemaCache = { hasSpeakerNames: false, speakerMode: 'none' };
    return _schemaCache;
  }
}

// episode内の sort_index を 0..n-1 に正規化（事故防止）
async function renumberEpisode(episode) {
  await db.run(
    `
    WITH ordered AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY sort_index ASC, id ASC) - 1 AS new_sort
      FROM episode_quotes
      WHERE episode = $1
    )
    UPDATE episode_quotes q
    SET sort_index = o.new_sort
    FROM ordered o
    WHERE q.id = o.id
    `,
    [episode]
  );
}

function buildSpeakerSearchWhere(schema, params, charLike) {
  // charLike: "%ルフィ%" など
  if (!schema?.hasSpeakerNames) return null;

  if (schema.speakerMode === 'jsonb') {
    params.push(charLike);
    const idx = params.length;
    return `
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(speaker_names) AS sn(name)
        WHERE sn.name ILIKE $${idx}
      )
    `;
  }

  if (schema.speakerMode === 'text_array') {
    // ANY で部分一致は無理なので、unnestでILike
    params.push(charLike);
    const idx = params.length;
    return `
      EXISTS (
        SELECT 1
        FROM unnest(speaker_names) AS sn(name)
        WHERE sn.name ILIKE $${idx}
      )
    `;
  }

  if (schema.speakerMode === 'text') {
    // "A / B / C" みたいにまとめてるケースの保険
    params.push(charLike);
    const idx = params.length;
    return `speaker_names ILIKE $${idx}`;
  }

  return null;
}

function speakerSelectExpr(schema) {
  if (!schema?.hasSpeakerNames) return `NULL AS speaker_names`;

  // そのまま返す（jsonbでもtext[]でもNextResponse側でJSON化される）
  return `speaker_names`;
}

function speakerInsertValue(schema, speakers) {
  // speakers は JS配列（文字列）想定
  if (!schema?.hasSpeakerNames) return { sql: 'NULL', params: [] };

  if (schema.speakerMode === 'jsonb') {
    return { sql: '$SPEAKERS::jsonb', params: [JSON.stringify(speakers)] };
  }
  if (schema.speakerMode === 'text_array') {
    return { sql: '$SPEAKERS::text[]', params: [speakers] };
  }
  if (schema.speakerMode === 'text') {
    return { sql: '$SPEAKERS::text', params: [speakers.join(' / ')] };
  }

  // unknown は無理せずNULL
  return { sql: 'NULL', params: [] };
}

export async function GET(request) {
  try {
    const schema = await getEpisodeQuotesSchema();

    const { searchParams } = new URL(request.url);
    const episodeStr = (searchParams.get('episode') || '').trim();
    const q = (searchParams.get('q') || '').trim(); // セリフ検索
    const char = (searchParams.get('char') || '').trim(); // キャラ検索

    const where = [];
    const params = [];

    if (episodeStr) {
      const ep = Number(episodeStr);
      if (Number.isFinite(ep) && ep > 0) {
        params.push(ep);
        where.push(`episode = $${params.length}`);
      }
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`quote_text ILIKE $${params.length}`);
    }
    if (char) {
      const like = `%${char}%`;

      // 旧：character_name の部分一致
      params.push(like);
      const idx = params.length;
      const w1 = `character_name ILIKE $${idx}`;

      // 新：speaker_names にも当てる（あれば）
      const w2 = buildSpeakerSearchWhere(schema, params, like);

      where.push(w2 ? `(${w1} OR ${w2})` : `(${w1})`);
    }

    const sql = `
      SELECT
        id,
        episode,
        character_id,
        character_name,
        ${speakerSelectExpr(schema)},
        quote_text,
        sort_index,
        created_at
      FROM episode_quotes
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY episode ASC, sort_index ASC, id ASC
      LIMIT 5000
    `;

    const rows = await db.query(sql, params);
    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, message: 'セリフ取得に失敗しました。' },
      { status: 500 }
    );
  }
}

// 追加：末尾 or 「間に挿入」(insert_after_id)
export async function POST(request) {
  try {
    const schema = await getEpisodeQuotesSchema();

    const body = await request.json().catch(() => ({}));
    const episode = safeNum(body?.episode, null);
    const quoteText = String(body?.quote_text || '').trim();
    const characterIdRaw = body?.character_id ?? null;
    const characterNameRaw = String(body?.character_name || '').trim();
    const insertAfterId = safeNum(body?.insert_after_id, null);

    // ★複数話者
    const speakersRaw = normalizeSpeakers(body?.speaker_names);

    if (!Number.isFinite(episode) || episode <= 0) {
      return NextResponse.json(
        { ok: false, message: 'episode は正の整数で指定してください。' },
        { status: 400 }
      );
    }
    if (!characterNameRaw && speakersRaw.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'character_name か speaker_names のどちらかは必須です。' },
        { status: 400 }
      );
    }
    if (!quoteText) {
      return NextResponse.json(
        { ok: false, message: 'quote_text は必須です。' },
        { status: 400 }
      );
    }

    const characterId =
      characterIdRaw === null || characterIdRaw === undefined || characterIdRaw === ''
        ? null
        : safeNum(characterIdRaw, null);

    // 互換：speaker_names が来たら先頭を character_name にする
    const characterName =
      speakersRaw.length > 0 ? speakersRaw[0] : characterNameRaw;

    let sortIndex = 0;

    // 間に挿入：指定行の次に入れる
    if (insertAfterId) {
      const after = await db.get(
        `SELECT id, episode, sort_index FROM episode_quotes WHERE id = $1`,
        [insertAfterId]
      );
      if (!after) {
        return NextResponse.json(
          { ok: false, message: 'insert_after_id の行が見つかりません。' },
          { status: 400 }
        );
      }
      if (Number(after.episode) !== Number(episode)) {
        return NextResponse.json(
          { ok: false, message: 'insert_after_id の話数が一致しません。' },
          { status: 400 }
        );
      }

      sortIndex = Number(after.sort_index ?? 0) + 1;

      // その位置以降を+1ずらす
      await db.run(
        `
        UPDATE episode_quotes
        SET sort_index = sort_index + 1
        WHERE episode = $1 AND sort_index >= $2
        `,
        [episode, sortIndex]
      );
    } else {
      // 末尾追加：max+1
      const mx = await db.get(
        `SELECT COALESCE(MAX(sort_index), -1) AS m FROM episode_quotes WHERE episode = $1`,
        [episode]
      );
      sortIndex = Number(mx?.m ?? -1) + 1;
    }

    // speaker_names の値（存在する時だけ入れる）
    const spVal = speakerInsertValue(schema, speakersRaw.length ? speakersRaw : [characterName]);
    // spVal.sql は $SPEAKERS プレースホルダを使うので、実際の $n に置換する

    const params = [episode, characterId, characterName, quoteText, sortIndex];
    let speakerSql = 'NULL';
    if (schema?.hasSpeakerNames && spVal.params.length) {
      params.push(spVal.params[0]);
      speakerSql = spVal.sql.replace('$SPEAKERS', `$${params.length}`);
    }

    const row = await db.get(
      `
      INSERT INTO episode_quotes
        (episode, character_id, character_name, speaker_names, quote_text, sort_index)
      VALUES
        ($1, $2, $3, ${speakerSql}, $4, $5)
      RETURNING
        id, episode, character_id, character_name, ${speakerSelectExpr(schema)},
        quote_text, sort_index, created_at
      `,
      params
    );

    await renumberEpisode(episode);

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, message: 'セリフ追加に失敗しました。' },
      { status: 500 }
    );
  }
}

// 編集：話者（複数）とセリフを更新
export async function PUT(request) {
  try {
    const schema = await getEpisodeQuotesSchema();

    const body = await request.json().catch(() => ({}));
    const id = safeNum(body?.id, null);

    const characterNameIn =
      body?.character_name !== undefined ? String(body.character_name || '').trim() : undefined;
    const quoteTextIn =
      body?.quote_text !== undefined ? String(body.quote_text || '').trim() : undefined;

    // ★複数話者
    const speakersIn =
      body?.speaker_names !== undefined ? normalizeSpeakers(body.speaker_names) : undefined;

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, message: 'id が不正です。' }, { status: 400 });
    }
    if (characterNameIn !== undefined && !characterNameIn) {
      return NextResponse.json(
        { ok: false, message: 'character_name は空にできません。' },
        { status: 400 }
      );
    }
    if (quoteTextIn !== undefined && !quoteTextIn) {
      return NextResponse.json(
        { ok: false, message: 'quote_text は空にできません。' },
        { status: 400 }
      );
    }
    if (speakersIn !== undefined && speakersIn.length === 0 && !characterNameIn) {
      return NextResponse.json(
        { ok: false, message: 'speaker_names を空にする場合は character_name を指定してください。' },
        { status: 400 }
      );
    }

    const prev = await db.get(
      `SELECT id, episode, character_name FROM episode_quotes WHERE id = $1`,
      [id]
    );
    if (!prev) {
      return NextResponse.json({ ok: false, message: '対象が見つかりません。' }, { status: 404 });
    }

    const sets = [];
    const params = [];

    // 互換：speaker_names が来たら先頭を character_name に揃える（未指定なら）
    let nextCharacterName = characterNameIn;
    if (speakersIn !== undefined && speakersIn.length > 0 && characterNameIn === undefined) {
      nextCharacterName = speakersIn[0];
    }

    if (nextCharacterName !== undefined) {
      params.push(nextCharacterName);
      sets.push(`character_name = $${params.length}`);
    }

    if (schema?.hasSpeakerNames && speakersIn !== undefined) {
      const spVal = speakerInsertValue(schema, speakersIn.length ? speakersIn : [String(nextCharacterName || prev.character_name || '').trim()]);
      if (spVal.params.length) {
        params.push(spVal.params[0]);
        const p = `$${params.length}`;
        const rhs = spVal.sql.replace('$SPEAKERS', p);
        sets.push(`speaker_names = ${rhs}`);
      } else {
        sets.push(`speaker_names = NULL`);
      }
    }

    if (quoteTextIn !== undefined) {
      params.push(quoteTextIn);
      sets.push(`quote_text = $${params.length}`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ ok: true, row: prev, noop: true }, { status: 200 });
    }

    params.push(id);
    const row = await db.get(
      `
      UPDATE episode_quotes
      SET ${sets.join(', ')}
      WHERE id = $${params.length}
      RETURNING
        id, episode, character_id, character_name, ${speakerSelectExpr(schema)},
        quote_text, sort_index, created_at
      `,
      params
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: '編集に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = (searchParams.get('id') || '').trim();
    const id = Number(idStr);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, message: 'id が不正です。' }, { status: 400 });
    }

    const prev = await db.get(`SELECT id, episode FROM episode_quotes WHERE id = $1`, [id]);
    if (!prev) return NextResponse.json({ ok: true }, { status: 200 });

    await db.run(`DELETE FROM episode_quotes WHERE id = $1`, [id]);

    await renumberEpisode(prev.episode);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: '削除に失敗しました。' }, { status: 500 });
  }
}
