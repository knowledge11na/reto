import { NextResponse } from 'next/server';
import { loadExtraCharacters } from '../../../lib/freeGameData.js';

export async function GET() {
  try {
    const characters = loadExtraCharacters();
    return NextResponse.json({ success: true, characters, count: characters.length });
  } catch (error) {
    console.error('[extra-character] 読み込みエラー:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
