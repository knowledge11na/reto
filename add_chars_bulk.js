// add_chars_bulk.js
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ----------------------
// Supabase 設定
// ----------------------
const SUPABASE_URL = 'https://upheytnpkwcnxfbszmhh.supabase.co'; // 自分の Supabase URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwaGV5dG5wa3djbnhmYnN6bWhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU2Njc5NSwiZXhwIjoyMDgwMTQyNzk1fQ.Y5lp62HMgewqXALE1nFCd83nknWWcu-rSYaCi1uDZWw';   // service_role key 推奨
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------------
// CSV 読み込み
// ----------------------
const csvPath = path.resolve(
  'C:/Users/aoba10/OneDrive/Desktop/reto/onepiece_gacha/chars.csv'
);

const text = fs.readFileSync(csvPath, 'utf8');
const lines = text.split(/\r?\n/);

const chars = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const cols = trimmed.split(',');
  if (cols.length < 3) continue;

  const id = Number(cols[0]);
  const name = (cols[1] ?? '').trim() || `ID${cols[0]}`;
  const rarity = Number(cols[2]);
  let search_word = (cols[3] ?? '').trim();

  if (!search_word) {
    const parts = name.split(/[・\s]/).filter(Boolean);
    search_word = parts.length ? parts[parts.length - 1] : name;
  }

  if (!Number.isFinite(id) || !Number.isFinite(rarity)) continue;

  chars.push({ char_no: id, name, base_rarity: rarity, search_word });
}

console.log(`CSV 読み込み完了: ${chars.length} 件`);

// ----------------------
// Supabase に upsert
// ----------------------
async function upsertChars() {
  try {
    // Supabase の upsert は chunk を分けた方が安全
    const chunkSize = 200;
    for (let i = 0; i < chars.length; i += chunkSize) {
      const chunk = chars.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('characters')
        .upsert(chunk, { onConflict: 'char_no' });

      if (error) {
        console.error('挿入エラー:', error);
      } else {
        console.log(`追加対象: ${chunk.length} 件 → 完了`);
      }
    }
    console.log('全件処理完了！');
  } catch (e) {
    console.error('エラー発生:', e);
  }
}

upsertChars();