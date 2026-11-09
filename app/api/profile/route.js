import { NextResponse } from 'next/server';
import { loadVivreProfiles } from '../../../lib/freeGameData.js';

export async function GET() {
  try {
    const items = loadVivreProfiles();
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (error) {
    console.error('[profile] 読み込みエラー:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
