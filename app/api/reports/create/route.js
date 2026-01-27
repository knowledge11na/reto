// file: app/api/reports/create/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db.js';
import { createQuestionReport } from '@/lib/reports.js';

export const runtime = 'nodejs';

async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('nb_username')?.value || null;
    if (!username) return null;

    const row = await db.get(
      `
        SELECT id, username, display_name, banned
        FROM users
        WHERE username = $1
      `,
      [username]
    );

    if (!row || row.banned) return null;
    return row;
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const {
      question_id,
      comment,
      source_mode, // 'rate' | 'rate-ai' | 'challenge' など
      battle_id = null,
      challenge_run_id = null,
    } = body;

    // 必須チェック
    if (!question_id || !comment || !source_mode) {
      return NextResponse.json(
        { error: 'question_id / source_mode / comment は必須です' },
        { status: 400 }
      );
    }

    // ★ここが重要：送信者はサーバー側で確定する（フロントからは信用しない）
    const me = await getCurrentUser();
    const reported_by_user_id = me ? Number(me.id) : null;

    const created = await createQuestionReport({
      question_id: Number(question_id),
      reported_by_user_id,
      source_mode: String(source_mode),
      battle_id: battle_id == null ? null : Number(battle_id),
      challenge_run_id: challenge_run_id == null ? null : Number(challenge_run_id),
      comment: String(comment),
    });

    return NextResponse.json(
      {
        report: created,
        reporter: me
          ? { id: Number(me.id), username: me.username, display_name: me.display_name }
          : null,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/reports/create error:', err);
    return NextResponse.json(
      { error: '問題不備報告の登録に失敗しました' },
      { status: 500 }
    );
  }
}
