import { NextResponse } from 'next/server';
import fs from 'fs';

export const runtime = 'nodejs';

// 変更しない（あなたの絶対パス縛り）
const CSV_PATH = 'C:\\Users\\aoba10\\OneDrive\\Desktop\\reto\\onepiece_gacha\\chars.csv';

function ensureFileExists() {
  if (fs.existsSync(CSV_PATH)) return;

  // 無いなら最小ヘッダで作る（既にあるなら何もしない）
  fs.writeFileSync(CSV_PATH, 'char_no,name\n', 'utf8');
}

function readLines() {
  ensureFileExists();
  const text = fs.readFileSync(CSV_PATH, 'utf8');

  // BOM除去
  const cleaned = text.replace(/^\uFEFF/, '');
  return cleaned.split(/\r?\n/);
}

function parseCsvRows() {
  const lines = readLines();

  // 1行目がヘッダっぽいなら飛ばす
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

function escapeCsvCell(s) {
  // name にカンマや改行が入る可能性を考慮してCSVエスケープ
  const x = String(s ?? '');
  if (/[,"\r\n]/.test(x)) {
    return `"${x.replace(/"/g, '""')}"`;
  }
  return x;
}

function appendRow(charNo, name) {
  ensureFileExists();

  // ファイル末尾が改行で終わってなければ足す
  const buf = fs.readFileSync(CSV_PATH);
  const endsWithNewline =
    buf.length === 0 ? true : buf[buf.length - 1] === 0x0a || buf[buf.length - 1] === 0x0d;

  const line = `${charNo},${escapeCsvCell(name)}\n`;
  fs.appendFileSync(CSV_PATH, (endsWithNewline ? '' : '\n') + line, 'utf8');
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

    const all = parseCsvRows();

    if (!q) {
      // 全件返すと重い＆UIで意味がないので先頭だけ
      return NextResponse.json(
        { ok: true, rows: all.slice(0, limit), total: all.length },
        { status: 200 }
      );
    }

    const qq = q.toLowerCase();
    const hit = [];
    for (const r of all) {
      if (r.name.toLowerCase().includes(qq)) {
        hit.push(r);
        if (hit.length >= limit) break;
      }
    }

    return NextResponse.json({ ok: true, rows: hit, total: all.length }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ一覧取得失敗' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    let charNo = body?.char_no;

    if (!name) {
      return NextResponse.json({ ok: false, message: 'name は必須です。' }, { status: 400 });
    }

    const all = parseCsvRows();

    // 既にいるならそれを返す（重複防止）
    const existed = all.find((r) => r.name === name);
    if (existed) {
      return NextResponse.json({ ok: true, row: existed, existed: true }, { status: 200 });
    }

    // char_no 未指定なら最大+1
    if (charNo === undefined || charNo === null || charNo === '') {
      const maxNo = all.reduce((m, r) => Math.max(m, Number(r.char_no) || 0), 0);
      charNo = maxNo + 1;
    } else {
      charNo = Number(charNo);
      if (!Number.isFinite(charNo) || charNo <= 0) {
        return NextResponse.json(
          { ok: false, message: 'char_no は正の整数で指定してください。' },
          { status: 400 }
        );
      }
      // その番号が既に使われてたら弾く（事故防止）
      const used = all.find((r) => Number(r.char_no) === charNo);
      if (used) {
        return NextResponse.json(
          { ok: false, message: `char_no=${charNo} は既に使用されています（${used.name}）` },
          { status: 400 }
        );
      }
    }

    appendRow(charNo, name);

    const row = { id: charNo, char_no: charNo, name };
    return NextResponse.json({ ok: true, row, existed: false }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: 'キャラ追加失敗' }, { status: 500 });
  }
}
