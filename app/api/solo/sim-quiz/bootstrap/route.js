// file: app/api/solo/sim-quiz/bootstrap/route.js
// ★ あなたが貼った最新版をそのまま活かしつつ、move.json を確実に読む（既にOK）
//   ここは「差分が分かりやすいように」moveDef が空の時の保険ログだけ追加
import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { cookies } from 'next/headers';
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

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const header = lines[0].split(',').map((s) => s.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s) => s.trim());
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j] ?? '';
    }
    rows.push(obj);
  }
  return rows;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function loadJsonFromData(filename, fallbackValue) {
  try {
    const p = path.join(process.cwd(), 'data', filename);
    if (!fs.existsSync(p)) return fallbackValue;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function loadCharsCsv() {
  const p = path.join(process.cwd(), 'data', 'chars.csv');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  return parseCsv(raw);
}

function parseSpCostFromText(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const m = t.match(/（\s*(\d+)\s*）/);
  if (!m) return null;
  return safeNum(m[1], null);
}

const ARC_TAG_COLUMNS = [
  '東の海',
  '偉大なる航路突入',
  'アラバスタ',
  '空島',
  'DBF',
  'W7、エニエス・ロビー',
  'スリラーバーク',
  'シャボンディ諸島',
  '女ヶ島',
  'インペルダウン',
  '頂上戦争',
  '3D2Y',
  '魚人島',
  'パンクハザード',
  'ドレスローザ',
  'ゾウ',
  'WCI',
  '世界会議',
  'ワノ国',
  'エッグヘッド',
  'エルバフ',
  '扉絵',
];

function isCircleMark(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s === '〇' || s === '○' || s === '1' || s.toLowerCase() === 'true';
}

function tagsFromCsvRow(row) {
  const out = [];
  for (const col of ARC_TAG_COLUMNS) {
    if (isCircleMark(row?.[col])) out.push(col);
  }
  return out;
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
    }

    const teamRows = await db.query(
      `
        SELECT
          ut.slot,
          ut.character_id
        FROM user_teams ut
        WHERE ut.user_id = $1
        ORDER BY ut.slot ASC
        LIMIT 5
      `,
      [me.id]
    );

    const slotToCid = new Map();
    for (const r of teamRows || []) {
      const slot = safeNum(r.slot, 0);
      const cid = safeNum(r.character_id, 0);
      if (slot >= 1 && slot <= 5 && cid > 0) slotToCid.set(slot, cid);
    }

    const teamIds = [1, 2, 3, 4, 5]
      .map((s) => slotToCid.get(s) || null)
      .filter((v) => Number.isFinite(v) && v > 0);

    if (teamIds.length === 0) {
      return NextResponse.json({
        ok: true,
        user: { id: me.id, name: me.display_name || me.username },
        units: [],
      });
    }

    const owned = await db.query(
      `
        SELECT
          uc.character_id,
          uc.stars,
          c.char_no,
          c.name,
          c.base_rarity,
          c.related_word
        FROM user_characters uc
        LEFT JOIN characters c
          ON c.id = uc.character_id
        WHERE uc.user_id = $1
          AND uc.character_id = ANY($2::int[])
      `,
      [me.id, teamIds]
    );

    const ownedMap = new Map();
    for (const r of owned || []) {
      ownedMap.set(String(r.character_id), r);
    }

    const csvRows = loadCharsCsv();
    const csvMapByCharNo = new Map();
    for (const r of csvRows) {
      const cn = safeNum(r.char_no, 0);
      if (cn > 0) csvMapByCharNo.set(String(cn), r);
    }

    const moveDef = loadJsonFromData('move.json', {});
    const wazaDef = loadJsonFromData('waza.json', {});

    const units = [];
    for (let slot = 1; slot <= 5; slot++) {
      const cid = slotToCid.get(slot) || null;
      if (!cid) continue;

      const o = ownedMap.get(String(cid));
      if (!o) continue;

      const charNo = String(o.char_no ?? '');
      const baseRow = csvMapByCharNo.get(charNo) || null;

      const hp = safeNum(baseRow?.HP, 100);
      const atk = safeNum(baseRow?.['攻撃力'], 30);
      const def = safeNum(baseRow?.['防御力'], 20);
      const sp = safeNum(baseRow?.SP, 30);

      const moveId = safeNum(baseRow?.move, 0);
      const range = safeNum(baseRow?.range, 1);

      const wazas = [baseRow?.技1, baseRow?.技2, baseRow?.技3, baseRow?.技4]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, 4)
        .map((name) => {
          const w = wazaDef?.[name] || null;
          return {
            name,
            cost: w?.cost ?? parseSpCostFromText(w?.effect ?? '') ?? null,
            effect: w?.effect ?? null,
          };
        });

      const tags = tagsFromCsvRow(baseRow);

      const moveCells = moveDef?.[String(moveId)] || [];
      // ★ ここで moveCells が空なら「まだ未登録」なので front のログに出す
      units.push({
        slot,
        character_id: cid,
        char_no: safeNum(o.char_no, 0),
        name: o.name,
        base_rarity: safeNum(o.base_rarity, 1),
        stars: safeNum(o.stars, 1),

        move_id: moveId,
        move_cells: moveCells,

        range,
        type: baseRow?.type ?? null,

        stats: { hp, atk, def, sp },
        wazas,

        tags,
      });
    }

    return NextResponse.json({
      ok: true,
      user: { id: me.id, name: me.display_name || me.username },
      units,
    });
  } catch (e) {
    console.error('sim-quiz/bootstrap error:', e);
    return NextResponse.json({ ok: false, error: e.message || 'server_error' }, { status: 500 });
  }
}