// file: app/api/gacha/sync-chars/route.js
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // サーバー専用キー
);

// CSV を読み込んでパース
function loadCharsFromCsv() {
  const filePath = path.join(process.cwd(), 'onepiece_gacha', 'chars.csv');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);

  return lines.map((line) => {
    const [char_no, name, rarity] = line.split(',');
    return {
      char_no: Number(char_no),
      name: name.trim(),
      base_rarity: Number(rarity),
    };
  });
}

export async function POST() {
  try {
    const chars = loadCharsFromCsv();

    for (const c of chars) {
      const { error } = await supabase
        .from('characters')
        .upsert(
          { char_no: c.char_no, name: c.name, base_rarity: c.base_rarity },
          { onConflict: ['char_no'] }
        );

      if (error) console.error(`Failed to upsert char_no=${c.char_no}`, error);
    }

    return NextResponse.json({ ok: true, message: 'CSV -> Supabase 同期完了' });
  } catch (e) {
    console.error('sync-chars error', e);
    return NextResponse.json({ ok: false, error: 'SYNC_FAILED' }, { status: 500 });
  }
}