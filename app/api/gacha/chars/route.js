// file: app/api/gacha/chars/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function loadCharsFromCsv() {
  const filePath = path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');
  const text = fs.readFileSync(filePath, 'utf8');

  const lines = text.split(/\r?\n/);
  const chars = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // CSV: char_no,name,rarity,search_word (4列目は任意)
    const cols = trimmed.split(',');
    if (cols.length < 3) continue;

    const idStr = cols[0];
    const nameRaw = cols[1];
    const rarityStr = cols[2];
    const searchRaw = cols[3]; // 任意

    const id = Number(idStr);
    const rarity = Number(rarityStr);
    const name = (nameRaw ?? '').trim() || `ID${idStr}`;

    if (!Number.isFinite(id) || !Number.isFinite(rarity)) continue;

    let search_word = (searchRaw ?? '').trim();
    if (!search_word) {
      // 4列目が無い/空なら雑に自動生成（最後の単語）
      const s = name.replace(/\s+/g, ' ').trim();
      const parts = s.split(/[・\s]/).filter(Boolean);
      search_word = parts.length ? parts[parts.length - 1] : s;
    }

    chars.push({
      id,         // 図鑑番号（char_no）
      name,
      rarity,     // ベースレア度
      search_word,
    });
  }

  return chars;
}

export async function GET() {
  try {
    const chars = loadCharsFromCsv();
    return NextResponse.json({ ok: true, chars }, { status: 200 });
  } catch (e) {
    console.error('failed to load gacha chars', e);
    return NextResponse.json(
      { ok: false, error: 'FAILED_TO_LOAD_CHARS' },
      { status: 500 }
    );
  }
}
