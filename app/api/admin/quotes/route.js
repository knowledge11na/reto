// file: app/api/admin/quotes/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

export async function GET(request) {
  try {
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
      params.push(`%${char}%`);
      where.push(`character_name ILIKE $${params.length}`);
    }

    const sql = `
      SELECT id, episode, character_id, character_name, quote_text, sort_index, created_at
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
    const body = await request.json().catch(() => ({}));
    const episode = safeNum(body?.episode, null);
    const quoteText = String(body?.quote_text || '').trim();
    const characterIdRaw = body?.character_id ?? null;
    const characterName = String(body?.character_name || '').trim();
    const insertAfterId = safeNum(body?.insert_after_id, null); // ★追加

    if (!Number.isFinite(episode) || episode <= 0) {
      return NextResponse.json(
        { ok: false, message: 'episode は正の整数で指定してください。' },
        { status: 400 }
      );
    }
    if (!characterName) {
      return NextResponse.json(
        { ok: false, message: 'character_name は必須です。' },
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

    let sortIndex = 0;

    // ★間に挿入：指定行の次に入れる
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

    const row = await db.get(
      `
      INSERT INTO episode_quotes
        (episode, character_id, character_name, quote_text, sort_index)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id, episode, character_id, character_name, quote_text, sort_index, created_at
      `,
      [episode, characterId, characterName, quoteText, sortIndex]
    );

    // 念のため正規化
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

// ★編集：キャラ名とセリフを更新（検索結果からも編集できる）
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = safeNum(body?.id, null);
    const characterName = body?.character_name !== undefined ? String(body.character_name || '').trim() : undefined;
    const quoteText = body?.quote_text !== undefined ? String(body.quote_text || '').trim() : undefined;

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, message: 'id が不正です。' }, { status: 400 });
    }
    if (characterName !== undefined && !characterName) {
      return NextResponse.json({ ok: false, message: 'character_name は空にできません。' }, { status: 400 });
    }
    if (quoteText !== undefined && !quoteText) {
      return NextResponse.json({ ok: false, message: 'quote_text は空にできません。' }, { status: 400 });
    }

    const prev = await db.get(
      `SELECT id, episode FROM episode_quotes WHERE id = $1`,
      [id]
    );
    if (!prev) {
      return NextResponse.json({ ok: false, message: '対象が見つかりません。' }, { status: 404 });
    }

    const sets = [];
    const params = [];

    if (characterName !== undefined) {
      params.push(characterName);
      sets.push(`character_name = $${params.length}`);
    }
    if (quoteText !== undefined) {
      params.push(quoteText);
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
      RETURNING id, episode, character_id, character_name, quote_text, sort_index, created_at
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
      return NextResponse.json(
        { ok: false, message: 'id が不正です。' },
        { status: 400 }
      );
    }

    const prev = await db.get(`SELECT id, episode FROM episode_quotes WHERE id = $1`, [id]);
    if (!prev) return NextResponse.json({ ok: true }, { status: 200 });

    await db.run(`DELETE FROM episode_quotes WHERE id = $1`, [id]);

    // 正規化
    await renumberEpisode(prev.episode);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { ok: false, message: '削除に失敗しました。' },
      { status: 500 }
    );
  }
}
