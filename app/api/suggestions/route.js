// file: app/api/suggestions/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

function clip(s, max) {
  const t = cleanStr(s);
  return t.length > max ? t.slice(0, max) : t;
}

function isUuidLike(s) {
  const v = cleanStr(s);
  // 8-4-4-4-12 のuuidだけ通す
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const category = clip(body?.category || 'general', 50) || 'general';
    const text = clip(body?.body, 3000);

    if (!text || text.trim().length < 5) {
      return NextResponse.json(
        { ok: false, message: '内容は5文字以上で入力してください。' },
        { status: 400 }
      );
    }

    // 表示用（信用しすぎない）
        const rawUserId = cleanStr(body?.userId || '');
    const userIdUuid = isUuidLike(rawUserId) ? rawUserId : null;
    const userIdText = rawUserId ? rawUserId : null;
    const userName = clip(body?.userName || '', 50) || null;

    await db.run(
      `
        INSERT INTO suggestions (user_id, user_id_text, user_name, category, body, status)
        VALUES ($1, $2, $3, $4, $5, 'open')
      `,
      [userIdUuid, userIdText, userName, category, text]
    );


    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/suggestions POST] error:', e?.message || e);
    return NextResponse.json(
      { ok: false, message: 'サーバーエラーが発生しました。' },
      { status: 500 }
    );
  }
}
