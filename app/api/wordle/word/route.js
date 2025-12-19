// file: app/api/wordle/word/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function readWordsJson() {
  const p = path.join(process.cwd(), 'public', 'wordle', 'words.json');
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const len = Number(searchParams.get('len') || 5);

  if (![5, 6, 7, 8, 9].includes(len)) {
    return NextResponse.json({ error: 'invalid len' }, { status: 400 });
  }

  try {
    const words = readWordsJson();
    const list = words?.[len] ?? [];
    if (!list.length) {
      return NextResponse.json({ error: 'no words for this length' }, { status: 500 });
    }
    // ランダム（※日替わりにしたいならここを日付seed方式に変える）
    const answer = randPick(list);
    return NextResponse.json({ len, answer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: 'words.json not found. run scripts/wordle_xlsx_to_json.cjs first.' },
      { status: 500 }
    );
  }
}
