// file: scripts/syncCharactersFromCsv.cjs
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const ROOT_DIR = process.cwd();

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
if (!process.env.DATABASE_URL) dotenv.config({ path: path.join(ROOT_DIR, '.env') });

if (!process.env.DATABASE_URL) {
  console.error('[sync] ERROR: DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

function detectDelimiter(sampleLine) {
  if (!sampleLine) return ',';
  if (sampleLine.includes('\t')) return '\t';
  if (sampleLine.includes(';') && !sampleLine.includes(',')) return ';';
  return ',';
}

function parseCsv(text) {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  const firstDataLike = rawLines.find((l) => !/^id\s*[,;\t]/i.test(l)) || rawLines[0];
  const delim = detectDelimiter(firstDataLike);

  const out = [];

  for (const line of rawLines) {
    if (/^id\s*[,;\t]/i.test(line)) continue;

    const cols = line.split(delim).map((c) => (c ?? '').trim());
    if (cols.length < 3) continue;

    const idStr = cols[0];
    const nameRaw = cols[1];
    const rarityStr = cols[2];
    const relatedRaw = cols[3] ?? '';

    const id = Number(idStr);
    const rarity = Number(rarityStr);

    if (!Number.isFinite(id) || id <= 0) continue;
    if (!Number.isFinite(rarity) || rarity <= 0) continue;

    out.push({
      id,
      // ★ char_no は CSVの1列目(=id)を採用（ExcelのA列＝キャラNoの想定）
      char_no: id,
      name: nameRaw || `ID${id}`,
      base_rarity: rarity,
      related_word: relatedRaw.trim() || null,
    });
  }

  console.log('[sync] delimiter detected:', JSON.stringify(delim));
  console.log('[sync] parsed rows:', out.length);
  if (out[0]) console.log('[sync] sample row:', out[0]);

  return out;
}

async function main() {
  const csvPath = path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('[sync] chars.csv not found:', csvPath);
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);

  if (rows.length === 0) {
    console.error('[sync] no rows parsed from csv');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ★安全方針：
    // - INSERT時は char_no を必ず入れる（NOT NULL対策）
    // - UPDATE時は related_word等は更新
    // - char_no は「NULL のときだけ」埋める（unique衝突を避ける）
    const sql = `
      INSERT INTO characters (id, char_no, name, base_rarity, related_word)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET
        name = EXCLUDED.name,
        base_rarity = EXCLUDED.base_rarity,
        related_word = EXCLUDED.related_word,
        char_no = COALESCE(characters.char_no, EXCLUDED.char_no)
    `;

    for (const r of rows) {
      await client.query(sql, [r.id, r.char_no, r.name, r.base_rarity, r.related_word]);
    }

    await client.query('COMMIT');
    console.log('[sync] OK: upserted', rows.length, 'characters');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[sync] FAILED:', e?.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
