// file: app/api/wordle/list/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function readWordsJson() {
  const p = path.join(process.cwd(), 'public', 'wordle', 'words.json');
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
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
    // 大きい可能性があるのでキャッシュOK（更新したら再デプロイ/再生成でOK）
    return NextResponse.json({ len, list }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (e) {
    return NextResponse.json(
      { error: 'words.json not found. run scripts/wordle_xlsx_to_json.cjs first.' },
      { status: 500 }
    );
  }
}
