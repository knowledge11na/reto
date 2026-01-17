// file: app/api/whois/missing-characters/route.js
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/[・･\.\-―ー＿_（）()\[\]{}「」『』【】]/g, '')
    .toLowerCase();
}

async function queryRows(sql, params = []) {
  const res = await db.query(sql, params);
  return Array.isArray(res) ? res : res.rows;
}

function splitLines(text) {
  const lines = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < (text || '').length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur !== '') lines.push(cur);
      cur = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cur += ch;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

function detectDelimiter(text) {
  const sample = (text || '').slice(0, 2000);
  const tab = (sample.match(/\t/g) || []).length;
  const comma = (sample.match(/,/g) || []).length;
  return tab > comma ? '\t' : ',';
}

function parseLine(line, delimiter) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < (line || '').length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((s) => String(s ?? '').trim());
}

function readCharsCsv() {
  // envで上書きできるようにしておく（Vercel対策にもなる）
  const envPath = process.env.CHARS_CSV_PATH;

  // 既定：/onepiece_gacha/chars.csv
  const filePath = envPath
    ? envPath
    : path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');

  if (!fs.existsSync(filePath)) {
    const err = new Error(`chars.csv が見つかりません: ${filePath}`);
    err.code = 'CHARS_NOT_FOUND';
    throw err;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const delimiter = detectDelimiter(raw);
  const lines = splitLines(raw);

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const row = parseLine(lines[i], delimiter);

    // header skip
    if (i === 0 && /char_no/i.test(row[0] || '')) continue;

    const char_no = Number(row[0] || 0);
    const name = String(row[1] || '').trim();
    if (!char_no || !name) continue;

    out.push({ char_no, name, name_norm: norm(name) });
  }
  return out;
}

async function safeGetUsedSet() {
  const used = new Set();

  const addRow = (r) => {
    const a = norm(r?.answer || '');
    if (a) used.add(a);
    const alts = Array.isArray(r?.alt_answers) ? r.alt_answers : [];
    for (const x of alts) {
      const nx = norm(x);
      if (nx) used.add(nx);
    }
  };

  // テーブルが無い場合でも落ちないようにする
  const tryQuery = async (sql) => {
    try {
      return await queryRows(sql, []);
    } catch (e) {
      // Postgres: 42P01 = undefined_table
      if (e && (e.code === '42P01' || String(e.message || '').includes('does not exist'))) {
        return [];
      }
      throw e;
    }
  };

  const rowsQ = await tryQuery(`select answer, alt_answers from whois_questions`);
  const rowsS = await tryQuery(
    `select answer, alt_answers from whois_submissions where status in ('pending','approved')`
  );

  for (const r of rowsQ || []) addRow(r);
  for (const r of rowsS || []) addRow(r);

  return used;
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const onlyMissing = url.searchParams.get('onlyMissing') === '1';

    const chars = readCharsCsv();
    const used = await safeGetUsedSet();

    let list = chars.map((c) => ({
      char_no: c.char_no,
      name: c.name,
      exists: used.has(c.name_norm),
    }));

    if (onlyMissing) list = list.filter((x) => !x.exists);

    if (q) {
      const nq = norm(q);
      list = list.filter((x) => norm(x.name).includes(nq) || String(x.char_no) === q);
    }

    const missingCount = chars.reduce((acc, c) => acc + (used.has(c.name_norm) ? 0 : 1), 0);

    return NextResponse.json(
      { total: chars.length, missing: missingCount, list },
      { status: 200 }
    );
  } catch (e) {
    console.error('[whois/missing-characters] error', e);

    // フロントが原因を見れるようにエラーメッセージを返す
    const msg = e?.message || '取得に失敗しました';
    return NextResponse.json(
      { error: msg, code: e?.code || null },
      { status: 500 }
    );
  }
}
