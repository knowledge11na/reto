// file: app/api/gacha/chars/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 念のためキャッシュされないように（なくても動く）
export const dynamic = 'force-dynamic';

function loadCharsFromCsv() {
  // onepiece_gacha/chars.csv を読む
  const filePath = path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');
  const text = fs.readFileSync(filePath, 'utf8');

  const lines = text.split(/\r?\n/);
  const chars = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // カンマ区切り（タブ区切りじゃない前提）
    const cols = trimmed.split(',');
    if (cols.length < 3) continue;

    const idStr = cols[0];
    const nameRaw = cols[1];
    const rarityStr = cols[2];

    const id = Number(idStr);
    const rarity = Number(rarityStr);
    const name = (nameRaw ?? '').trim() || `ID${idStr}`;

    if (!Number.isFinite(id) || !Number.isFinite(rarity)) continue;

    chars.push({
      id,       // 図鑑番号として使う
      name,
      rarity,   // ★の数
    });
  }

  return chars;
}

export async function GET() {
  try {
    const chars = loadCharsFromCsv();

    return NextResponse.json(
      {
        ok: true,
        chars,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('failed to load gacha chars', e);
    return NextResponse.json(
      { ok: false, error: 'FAILED_TO_LOAD_CHARS' },
      { status: 500 }
    );
  }
}
