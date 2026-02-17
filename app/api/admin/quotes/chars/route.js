// file: app/api/admin/quotes/chars/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db.js';

export const runtime = 'nodejs';

// ローカル用（今まで通り）
const ABS_CSV = 'C:\\Users\\aoba10\\OneDrive\\Desktop\\reto\\onepiece_gacha\\chars.csv';

// 本番用のフォールバック（どっちかを使う）
const REL_CSV = path.join(process.cwd(), 'data', 'chars.csv'); // ← repoに置く場合
// さらに最終フォールバック：DB（quote_characters）を使う

function parseCsv(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);

  let start = 0;
  if (lines[0] && !/^\s*\d+/.test(lines[0])) start = 1;

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const line = (lines[i] || '').trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 2) continue;

    const id = Number(cols[0]);
    const name = (cols[1] || '').trim();
    if (!Number.isFinite(id) || !name) continue;

    rows.push({ id, char_no: id, name });
  }

  rows.sort((a, b) => (a.char_no ?? 9999999) - (b.char_no ?? 9999999));
  return rows;
}

function loadAllFromCsvIfExists(filePath) {
  try {
    if (!filePath) return null;
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    return parseCsv(text);
  } catch {
    return null;
  }
}

async function loadAllFromDb() {
  try {
    // quote_characters が無い/空でも落ちないように
    const rows = await db.query(
      `SELECT id, char_no, name FROM quote_characters ORDER BY char_no NULLS LAST, id ASC LIMIT 100000`
    );
    return (rows || []).map((r) => ({
      id: r.id ?? r.char_no,
      char_no: r.char_no ?? null,
      name: r.name,
    }));
  } catch {
    return [];
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

    // ① 絶対パス（ローカル）
    let all = loadAllFromCsvIfExists(ABS_CSV);

    // ② リポジトリ内 data/chars.csv（本番）
    if (!all || all.length === 0) {
      all = loadAllFromCsvIfExists(REL_CSV);
    }

    // ③ DB（本番の最終保険）
    if (!all || all.length === 0) {
      all = await loadAllFromDb();
    }

    if (!q) {
      return NextResponse.json(
        { ok: true, rows: all.slice(0, limit), total: all.length, source: all.length ? 'loaded' : 'empty' },
        { status: 200 }
      );
    }

    const qq = q.toLowerCase();
    const hit = [];
    for (const r of all) {
      if (String(r.name || '').toLowerCase().includes(qq)) {
        hit.push(r);
        if (hit.length >= limit) break;
      }
    }

    return NextResponse.json(
      { ok: true, rows: hit, total: all.length, source: 'loaded' },
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ一覧取得失敗' }, { status: 500 });
  }
}

// 重要：本番でCSV追記は基本できない（Vercelのファイルは永続化されない）ので、POSTはDBへ保存にする
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    let charNo = body?.char_no;

    if (!name) {
      return NextResponse.json({ ok: false, message: 'name は必須です。' }, { status: 400 });
    }

    // 既存チェック（DB）
    const existed = await db.get(`SELECT id, char_no, name FROM quote_characters WHERE name = $1`, [name]);
    if (existed) return NextResponse.json({ ok: true, row: existed, existed: true }, { status: 200 });

    if (charNo === undefined || charNo === null || charNo === '') {
      const mx = await db.get(`SELECT COALESCE(MAX(char_no), 0) AS m FROM quote_characters`);
      charNo = Number(mx?.m || 0) + 1;
    } else {
      charNo = Number(charNo);
      if (!Number.isFinite(charNo) || charNo <= 0) {
        return NextResponse.json({ ok: false, message: 'char_no は正の整数で指定してください。' }, { status: 400 });
      }
    }

    const row = await db.get(
      `INSERT INTO quote_characters (char_no, name) VALUES ($1, $2) RETURNING id, char_no, name`,
      [charNo, name]
    );

    return NextResponse.json({ ok: true, row, existed: false }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ追加失敗' }, { status: 500 });
  }
}
