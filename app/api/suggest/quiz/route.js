// file: app/api/suggest/quiz/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

// --------- utils ----------
function rndInt(n) {
  return Math.floor(Math.random() * n);
}
function pickOne(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[rndInt(arr.length)];
}
function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cleanStr(v) {
  return String(v ?? '').trim();
}
function cleanHeader(v) {
  return cleanStr(v).replace(/^\uFEFF/, '').toLowerCase();
}
function toNum(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}
function firstExistingPath(candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}
function canReadFile(p) {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ★ api/waza と同じ「セル掃除」
// ー だけは空扱い
function cleanCell(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s === 'ー') return '';
  return s;
}

// ★ ヘッダっぽい行を除外（waza用）
function looksLikeHeaderWaza(row) {
  const a = cleanCell(row?.[0]);
  const b = cleanCell(row?.[1]);
  return (
    a.includes('技名') ||
    a === '技' ||
    b.includes('使用') ||
    b.includes('キャラ') ||
    a.includes('タイトル')
  );
}

// ★ ヘッダっぽい行を除外（subtitles用）
function looksLikeHeaderSub(row) {
  const a = cleanCell(row?.[0]);
  const b = cleanCell(row?.[1]);
  return (
    a.includes('話') ||
    a.includes('話数') ||
    b.includes('サブ') ||
    b.includes('タイトル')
  );
}

// CSV（クォート対応の超軽量）
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      const hasAny = row.some((c) => String(c ?? '').trim() !== '');
      if (hasAny) rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  const hasAny = row.some((c) => String(c ?? '').trim() !== '');
  if (hasAny) rows.push(row);

  return rows;
}

// --------- data cache ----------
const CACHE_TTL_MS = 15 * 1000;
let cache = {
  loadedAt: 0,
  subtitles: [],
  waza: [],
  wazaPlaces: [],
  chars: [],
  errors: [],
  resolved: {
    subtitlesPath: null,
    wazaPath: null,
    charsPath: null,
  },
};

function resetCache() {
  cache.loadedAt = 0;
  cache.subtitles = [];
  cache.waza = [];
  cache.wazaPlaces = [];
  cache.chars = [];
  cache.errors = [];
  cache.resolved = { subtitlesPath: null, wazaPath: null, charsPath: null };
}

function readXlsxRowsByBuffer(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) || [];
  return rows;
}

function loadAllData(force = false) {
  const now = Date.now();
  if (!force && cache.loadedAt && now - cache.loadedAt < CACHE_TTL_MS) return;

  resetCache();

  // 1) subtitles.xlsx（buffer方式に統一）
  try {
    const candidates = [
      path.join(process.cwd(), 'data', 'subtitles.xlsx'),
      path.join(process.cwd(), 'subtitles.xlsx'),
      path.join(process.cwd(), 'data', 'subtitle.xlsx'),
      path.join(process.cwd(), 'data', 'Subtitles.xlsx'),
    ];
    const p = firstExistingPath(candidates);
    cache.resolved.subtitlesPath = p || null;

    if (!p) {
      cache.errors.push('subtitles.xlsx が見つかりません（候補: data/ など）');
    } else if (!canReadFile(p)) {
      cache.errors.push(`subtitles.xlsx 読み取り不可: ${p}`);
    } else {
      const rows = readXlsxRowsByBuffer(p);
      if (!rows) {
        cache.errors.push('subtitles.xlsx sheet not found');
      } else {
        const subs = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || [];

          // ヘッダ行除外（先頭がヘッダなら飛ばす）
          if (i === 0 && looksLikeHeaderSub(row)) continue;

          const ep = toNum(cleanCell(row?.[0])); // A
          const title = cleanCell(row?.[1]); // B

          if (ep && title) subs.push({ ep, title });
        }
        cache.subtitles = subs;
      }
    }
  } catch (e) {
    cache.errors.push(
      `subtitles.xlsx 読み込み失敗: ${String(e?.message || e)}`
    );
  }

  // 2) waza.xlsx（api/waza と同じ buffer方式＋ヘッダ除外＋「ー」空扱い）
  try {
    const candidates = [
      path.join(process.cwd(), 'data', 'waza.xlsx'),
      path.join(process.cwd(), 'waza.xlsx'),
      path.join(process.cwd(), 'data', 'Waza.xlsx'),
      path.join(process.cwd(), 'data', 'waza-data.xlsx'),
    ];
    const p = firstExistingPath(candidates);
    cache.resolved.wazaPath = p || null;

    if (!p) {
      cache.errors.push('waza.xlsx が見つかりません（候補: data/ など）');
    } else if (!canReadFile(p)) {
      cache.errors.push(`waza.xlsx 読み取り不可: ${p}`);
    } else {
      const rows = readXlsxRowsByBuffer(p);
      if (!rows) {
        cache.errors.push('waza.xlsx sheet not found');
      } else {
        const w = [];
        const places = new Set();

        // A:技名 B:使用者 C:食らった D:話数 E:効果音 F:場所
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || [];

          if (i === 0 && looksLikeHeaderWaza(row)) continue;

          const name = cleanCell(row?.[0]); // A
          const place = cleanCell(row?.[5]); // F

          // 技名が無い行は捨てる
          if (!name) continue;

          w.push({ name, place: place || '' });
          if (place) places.add(place);
        }

        cache.waza = w;
        cache.wazaPlaces = Array.from(places);
      }
    }
  } catch (e) {
    cache.errors.push(`waza.xlsx 読み込み失敗: ${String(e?.message || e)}`);
  }

  // 3) chars.csv
  try {
    const candidates = [
      path.join(process.cwd(), 'onepiece_gacha', 'chars.csv'),
      path.join(process.cwd(), 'data', 'chars.csv'),
      path.join(process.cwd(), 'chars.csv'),
    ];
    const p = firstExistingPath(candidates);
    cache.resolved.charsPath = p || null;

    if (!p) {
      cache.errors.push('chars.csv が見つかりません（候補: onepiece_gacha/ など）');
    } else if (!canReadFile(p)) {
      cache.errors.push(`chars.csv 読み取り不可: ${p}`);
    } else {
      const csvText = fs.readFileSync(p, 'utf-8');
      const rows = parseCsv(csvText);

      const header = rows[0] || [];
      const nameIdx = header.findIndex((h) => cleanHeader(h) === 'name');

      const out = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const nm = nameIdx >= 0 ? cleanStr(r?.[nameIdx]) : cleanStr(r?.[1]);
        if (nm) out.push(nm);
      }
      cache.chars = out;
    }
  } catch (e) {
    cache.errors.push(`chars.csv 読み込み失敗: ${String(e?.message || e)}`);
  }

  cache.loadedAt = Date.now();
}

// --------- suggestion makers ----------
function makeSubtitleSuggestion() {
  const item = pickOne(cache.subtitles);
  if (!item) {
    return {
      kind: 'subtitles',
      title: '話数・サブタイトル案（データなし）',
      idea: ['subtitles.xlsx が見つからない / 読めない / 形式が違うかも'],
    };
  }

  const { ep, title } = item;

  return {
    kind: 'subtitles',
    title: `第${ep}話「${title}」から作問`,
    idea: [
      `この回に登場した「人物/場所/出来事」を1つ選んで単一選択にする`,
      `セリフ系：この回で印象的なセリフ問題`,
      `並び替え：この回の出来事を時系列に並び替え`,
      `記述：この回で起きた事件名/固有名詞/技を答えさせる`,
    ],
  };
}


function makeWazaSuggestion() {
  const item = pickOne(cache.waza);
  if (!item) {
    return {
      kind: 'waza',
      title: '技から作問（データなし）',
      idea: ['waza.xlsx が見つからない / 読めない / 形式が違うかも'],
    };
  }

  return {
    kind: 'waza',
    title: `技「${item.name}」から作問`,
    idea: [
      `場所：この技が使われた場所はどこ？（何階や特定の場所）`,
      `技順：使用者を見てそのキャラが使う技の順番を問う問題にする`,
      `回数系：複数回出た技を探して「どれが一番多い？」などにする`,
    ],
  };
}

function makeCharSuggestion() {
  const ch = pickOne(cache.chars);
  if (!ch) {
    return {
      kind: 'char',
      title: 'キャラから作問（データなし）',
      idea: ['chars.csv が見つからない / 読めない / 中身0件 / 形式が違うかも'],
    };
  }

  return {
    kind: 'char',
    title: `キャラ「${ch}」から作問`,
    idea: [
      `初登場（肩書き/セリフ）を問う`,
      `セリフ（“”書きのセリフ/誰のセリフ？/誰の事を指す）を問う`,
      `特徴（口癖/武器/能力/呼び方）を問う`,
      `シーン：特徴的な場面を見つけそれを問う`,
      `技：このキャラが使った技順や使用した場所などを問う`,
    ],
  };
}


// --------- route ----------
export async function GET(request) {
  const url = new URL(request.url);
  const kind = cleanStr(url.searchParams.get('kind') || 'any').toLowerCase();
  const force = url.searchParams.get('reload') === '1';

  loadAllData(force);

  const makers = [];
  if (kind === 'subtitles') makers.push(makeSubtitleSuggestion);
  else if (kind === 'waza') makers.push(makeWazaSuggestion);
  else if (kind === 'char') makers.push(makeCharSuggestion);
  else makers.push(makeSubtitleSuggestion, makeWazaSuggestion, makeCharSuggestion);

  const maker = pickOne(makers);
  const result = maker ? maker() : null;

  return NextResponse.json({
    ok: true,
    kind,
    result,
    meta: {
      subtitles: cache.subtitles.length,
      waza: cache.waza.length,
      chars: cache.chars.length,
      errors: cache.errors,
      resolved: cache.resolved,
      loadedAt: cache.loadedAt,
    },
  });
}
