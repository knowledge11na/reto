// file: app/api/cpu/rival/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const RIVAL_XLSX = path.join(process.cwd(), 'data', 'rival.xlsx');

// それっぽい候補は優先して探す（見つからなければ data/*.xlsx を総当たり）
const CHAR_XLSX_CANDIDATES = [
  path.join(process.cwd(), 'data', 'characters.xlsx'),
  path.join(process.cwd(), 'data', 'character.xlsx'),
  path.join(process.cwd(), 'data', 'chara.xlsx'),
  path.join(process.cwd(), 'data', 'char.xlsx'),
];

let _charMasterCache = null;

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function randInt(lo, hi) {
  const a = Math.floor(Number(lo));
  const b = Math.floor(Number(hi));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1500;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (min === max) return min;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function normalizeHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/　/g, '');
}

function normalizeName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/　/g, '');
}

function sheetHasCharMaster(ws) {
  const headerRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const header = Array.isArray(headerRows?.[0]) ? headerRows[0] : [];
  const hdr = new Set(header.map(normalizeHeader));

  const hasCharNo = hdr.has('char_no') || hdr.has('character_no') || hdr.has('id');
  const hasRarity = hdr.has('base_rarity') || hdr.has('base_rarit') || hdr.has('rarity');
  return hasCharNo && hasRarity;
}

function detectCharacterMasterXlsx() {
  // 1) 候補ファイル優先
  for (const file of CHAR_XLSX_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (ws && sheetHasCharMaster(ws)) return file;
    } catch {
      // ignore
    }
  }

  // 2) data/*.xlsx 総当たり
  try {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) return null;

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.xlsx'))
      .map((f) => path.join(dir, f));

    for (const file of files) {
      try {
        const buf = fs.readFileSync(file);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (ws && sheetHasCharMaster(ws)) return file;
      } catch {
        // ignore
      }
    }
    return null;
  } catch {
    return null;
  }
}

function loadCharacterMasterFromXlsx() {
  if (_charMasterCache) return _charMasterCache;

  const file = detectCharacterMasterXlsx();
  if (!file) {
    _charMasterCache = { source: null, map: new Map(), nameMap: new Map() };
    return _charMasterCache;
  }

  try {
    const buf = fs.readFileSync(file);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const map = new Map(); // key: char_no / id
    const nameMap = new Map(); // key: normalized name

    for (const r of rows) {
      const id =
        safeNum(r.char_no, null) ??
        safeNum(r.character_no, null) ??
        safeNum(r.id, null);

      const rarity =
        safeNum(r.base_rarity, null) ??
        safeNum(r.base_rarit, null) ??
        safeNum(r.rarity, null);

      const name = String(r.name || r.character_name || r.title || '').trim();

      if (Number.isFinite(id)) {
        map.set(Number(id), {
          rarity: Number.isFinite(rarity) ? rarity : null,
          name: name || null,
        });
      }

      const nk = normalizeName(name);
      if (nk) {
        const prev = nameMap.get(nk);
        const currR = Number.isFinite(rarity) ? Number(rarity) : null;
        const prevR = prev && Number.isFinite(prev.rarity) ? Number(prev.rarity) : null;
        if (!prev || (currR && (!prevR || currR > prevR))) {
          nameMap.set(nk, {
            rarity: Number.isFinite(rarity) ? rarity : null,
            name: name || null,
          });
        }
      }
    }

    _charMasterCache = { source: path.basename(file), map, nameMap };
    return _charMasterCache;
  } catch {
    _charMasterCache = { source: null, map: new Map(), nameMap: new Map() };
    return _charMasterCache;
  }
}

function fallbackRivals() {
  return [{ name: 'CPUミドル', rateLow: 1400, rateHigh: 1600, accuracy: 0.4, avgTimeSec: 50, teamIds: [] }];
}

function loadRivalsFromXlsx() {
  if (!fs.existsSync(RIVAL_XLSX)) {
    console.warn('[cpu/rival] file not found:', RIVAL_XLSX);
    return { rivals: fallbackRivals(), source: 'fallback:not_found' };
  }

  let wb;
  try {
    const buf = fs.readFileSync(RIVAL_XLSX);
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch (e) {
    console.warn('[cpu/rival] XLSX.read(buffer) failed:', RIVAL_XLSX, e);
    return { rivals: fallbackRivals(), source: 'fallback:read_failed' };
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const rivals = rows
    .map((r) => {
      const name = String(r.player || r.name || '').trim();
      const rateLow = safeNum(r.ratelaw ?? r.rateLow ?? r.low, 0);
      const rateHigh = safeNum(r.ratehigh ?? r.rateHigh ?? r.high, 9999);
      const accuracy = safeNum(r.Accuracyrate ?? r.accuracy ?? r.acc, 0.4);
      const avgTimeSec = safeNum(r.time ?? r.avgTimeSec ?? r.sec, 50);

      const teamIds = [
        safeNum(r.team1, null),
        safeNum(r.team2, null),
        safeNum(r.team3, null),
        safeNum(r.team4, null),
        safeNum(r.team5, null),
      ].filter((x) => Number.isFinite(x));

      if (!name) return null;
      return { name, rateLow, rateHigh, accuracy, avgTimeSec, teamIds };
    })
    .filter(Boolean);

  if (rivals.length === 0) {
    console.warn('[cpu/rival] xlsx parsed but empty');
    return { rivals: fallbackRivals(), source: 'fallback:empty' };
  }

  return { rivals, source: 'xlsx' };
}

async function resolveCharactersByIds(ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  if (clean.length === 0) return [];

  // ===== 1) characters を teamIds で直接引けるか試す =====
  {
    const charColsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='characters'
    `);
    const charCols = new Set((charColsRes.rows || []).map((r) => String(r.column_name)));
    const hasC = (c) => charCols.has(c);

    const keyCol = hasC('char_no') ? 'char_no' : hasC('character_no') ? 'character_no' : 'id';

    const nameExpr = hasC('name')
      ? 'name'
      : hasC('character_name')
      ? 'character_name'
      : hasC('title')
      ? 'title'
      : `${keyCol}::text`;

    const rarityExprParts = [];
    if (hasC('base_rarity')) rarityExprParts.push('base_rarity');
    if (hasC('rarity')) rarityExprParts.push('rarity');
    if (hasC('rarity_tier')) rarityExprParts.push('rarity_tier');
    if (hasC('rarity_level')) rarityExprParts.push('rarity_level');
    const rarityExpr = rarityExprParts.length ? `COALESCE(${rarityExprParts.join(', ')}, 1)` : '1';

    const sql = `
      SELECT
        ${keyCol} AS id,
        ${nameExpr} AS name,
        ${rarityExpr} AS rarity,
        ${rarityExpr} AS base_rarity,
        ${rarityExpr} AS star
      FROM characters
      WHERE ${keyCol} = ANY($1::int[])
    `;
    const { rows } = await pool.query(sql, [clean]);

    if (rows.length >= Math.min(clean.length, 3)) {
      const byId = new Map(rows.map((r) => [Number(r.id), r]));
      const out = clean.map((id) => byId.get(id)).filter(Boolean);

      const okName = out.some((r) => r.name && !/^\d+$/.test(String(r.name).trim()));
      const okRarity = out.some((r) => Number(r.rarity) > 1);
      if (okName || okRarity) return out;
    }
  }

  // ===== 2) user_characters.id だったケース：JOIN して characters から名前/レア度を取る =====
  {
    const hasUcRes = await pool.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name='user_characters'
      LIMIT 1
    `);
    if ((hasUcRes.rows || []).length === 0) return [];

    const ucColsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_characters'
    `);
    const ucCols = new Set((ucColsRes.rows || []).map((r) => String(r.column_name)));
    const hasU = (c) => ucCols.has(c);

    const fkCol =
      (hasU('char_no') && 'char_no') ||
      (hasU('character_no') && 'character_no') ||
      (hasU('character_id') && 'character_id') ||
      (hasU('char_id') && 'char_id') ||
      null;

    if (!fkCol) {
      return clean.map((id) => ({ id, name: String(id), rarity: 1, base_rarity: 1, star: 1 }));
    }

    const charColsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='characters'
    `);
    const charCols = new Set((charColsRes.rows || []).map((r) => String(r.column_name)));
    const hasC = (c) => charCols.has(c);

    const joinKey =
      fkCol.endsWith('_id')
        ? 'id'
        : hasC('char_no')
        ? 'char_no'
        : hasC('character_no')
        ? 'character_no'
        : 'id';

    const nameExpr = hasC('name')
      ? 'c.name'
      : hasC('character_name')
      ? 'c.character_name'
      : hasC('title')
      ? 'c.title'
      : `c.${joinKey}::text`;

    const rarityExprParts = [];
    if (hasC('base_rarity')) rarityExprParts.push('c.base_rarity');
    if (hasC('rarity')) rarityExprParts.push('c.rarity');
    if (hasC('rarity_tier')) rarityExprParts.push('c.rarity_tier');
    if (hasC('rarity_level')) rarityExprParts.push('c.rarity_level');
    const rarityExpr = rarityExprParts.length ? `COALESCE(${rarityExprParts.join(', ')}, 1)` : '1';

// ===== star（CPU用：基本は rarity を使う）=====
const starExprParts = [];
if (hasC('current_star')) starExprParts.push('c.current_star');
if (hasC('star')) starExprParts.push('c.star');
if (hasC('stars')) starExprParts.push('c.stars');
if (hasC('current_stars')) starExprParts.push('c.current_stars');
if (hasC('awakening')) starExprParts.push('c.awakening');
if (hasC('awaken')) starExprParts.push('c.awaken');
if (hasC('base_star')) starExprParts.push('c.base_star');
if (hasC('base_stars')) starExprParts.push('c.base_stars');

const starExpr =
  starExprParts.length > 0
    ? `COALESCE(${starExprParts.join(', ')}, ${rarityExpr})`
    : `${rarityExpr}`;


const sql = `
  SELECT
    uc.id AS id,
    ${nameExpr} AS name,
    ${rarityExpr} AS rarity,
    ${rarityExpr} AS base_rarity,
    ${starExpr} AS star
  FROM user_characters uc
  JOIN characters c
    ON c.${joinKey} = uc.${fkCol}
  WHERE uc.id = ANY($1::int[])
`;


    const { rows } = await pool.query(sql, [clean]);

    // Excelで最終補完（DBが1/NULLっぽいときだけ）
    const master = loadCharacterMasterFromXlsx();

    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const out = [];

    for (const requestedId of clean) {
      const r = byId.get(requestedId);
      if (!r) continue;

      const dbR = safeNum(r.rarity, null);

      // user_characters.id ではなく名前でマスター参照（保険）
      const nk = normalizeName(r.name);
      const m = nk ? master.nameMap.get(nk) : null;

      const xR = m ? safeNum(m.rarity, null) : null;
      if ((dbR === null || dbR <= 1) && xR && xR > 1) {
        r.rarity = xR;
        r.base_rarity = xR;
      }

      if ((!r.name || /^\d+$/.test(String(r.name).trim())) && m?.name) {
        r.name = m.name;
      }

      out.push(r);
    }

    return out;
  }
}

function pickCpuByRating(rivals, myRating) {
  const r = Number(myRating);
  const candidates = rivals.filter((x) => r >= x.rateLow && r <= x.rateHigh);
  const poolArr = candidates.length ? candidates : rivals;

  const picked = poolArr[Math.floor(Math.random() * poolArr.length)];
  const cpuRating = randInt(picked.rateLow, picked.rateHigh);

  return { ...picked, rating: cpuRating };
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const myRating = safeNum(url.searchParams.get('my_rating'), 1500);

    const { rivals, source } = loadRivalsFromXlsx();
    const cpu = pickCpuByRating(rivals, myRating);

    const master = loadCharacterMasterFromXlsx();
    const cpuTeam = await resolveCharactersByIds(cpu.teamIds || []);

    return NextResponse.json({
      ok: true,
      source,
      cpu: {
        name: cpu.name,
        rating: cpu.rating ?? 1500,
        accuracy: cpu.accuracy ?? 0.4,
        avgTimeSec: cpu.avgTimeSec ?? 50,
        team: cpuTeam,
        charMasterSource: master.source,
      },
    });
  } catch (e) {
    console.error('[cpu/rival] fatal', e);
    return NextResponse.json({ ok: false, error: 'cpu rival failed' }, { status: 500 });
  }
}
