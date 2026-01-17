// file: app/api/admin/whois/reject/route.js
import db from '@/lib/db.js';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const reason = body.reason ? String(body.reason) : null;

    if (!id) {
      return new Response(JSON.stringify({ error: 'id が必要です' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    await db.run(
      `
        update whois_submissions
        set status='rejected', reject_reason = $1, updated_at=now()
        where id=$2
      `,
      [reason, id]
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    console.error('/api/admin/whois/reject error', e);
    return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
