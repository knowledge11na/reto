// file: app/api/admin/moves/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db.js';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('nb_username')?.value || null;
    if (!username) return null;

    const row = await db.get(
      `
        SELECT id, username, display_name, is_official_author, banned
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

function assertAdmin(me) {
  // 既存の運用に合わせて：is_official_author を「管理OK」に使う
  return !!me?.is_official_author;
}

function getMoveJsonPath() {
  return path.join(process.cwd(), 'data', 'move.json');
}

function readMoveJson() {
  try {
    const p = getMoveJsonPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMoveJson(obj) {
  const p = getMoveJsonPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function safeInt(v, fallback = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeCells(cells) {
  const arr = Array.isArray(cells) ? cells : [];
  const out = [];
  const seen = new Set();

  for (const c of arr) {
    const dx = safeInt(c?.dx, null);
    const dy = safeInt(c?.dy, null);
    if (dx == null || dy == null) continue;

    // 事故防止
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) continue;

    const key = `${dx},${dy}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ dx, dy });
  }
  return out;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
  if (!assertAdmin(me)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const moves = readMoveJson();
  return NextResponse.json({ ok: true, moves }, { status: 200 });
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
  if (!assertAdmin(me)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const moveId = safeInt(body?.move_id, null);
  if (!Number.isFinite(moveId) || moveId <= 0) {
    return NextResponse.json({ ok: false, error: 'move_id_invalid' }, { status: 400 });
  }

  const cells = normalizeCells(body?.cells);

  const all = readMoveJson();
  all[String(moveId)] = cells;
  writeMoveJson(all);

  return NextResponse.json({ ok: true, move_id: moveId, cells }, { status: 200 });
}

export async function DELETE(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
  if (!assertAdmin(me)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const moveId = safeInt(url.searchParams.get('move_id'), null);
  if (!Number.isFinite(moveId) || moveId <= 0) {
    return NextResponse.json({ ok: false, error: 'move_id_invalid' }, { status: 400 });
  }

  const all = readMoveJson();
  delete all[String(moveId)];
  writeMoveJson(all);

  return NextResponse.json({ ok: true }, { status: 200 });
}