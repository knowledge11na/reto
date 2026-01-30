// file: app/api/study/waza/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'data', 'Swaza.xlsx');

    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json(
        { ok: false, error: 'data/Swaza.xlsx が見つかりません。' },
        { status: 404 }
      );
    }

    const XLSX = await import('xlsx');

    // ★ readFileではなくBufferで読む（OneDrive/Excelロック耐性）
    const buf = fs.readFileSync(xlsxPath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json({ ok: false, error: 'Excelのシートが見つかりません' }, { status: 400 });
    }

    const ws = wb.Sheets[sheetName];

    // ヘッダあり想定で読む（列名を使う）
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const out = [];
    for (const r of json) {
      // ここは Excel の列名に合わせる（画像/貼り付けの通り）
      const who = cleanStr(r['誰が']);
      const whom = cleanStr(r['誰に']);
      const episode = Number(r['話数']);
      const scene = cleanStr(r['シーン　or　技補足']);
      const waza_name = cleanStr(r['技名']);
      const se = cleanStr(r['効果音']);
      const place_hit = cleanStr(r['当たった場所']);
      const place_use = cleanStr(r['使った場所']);

      if (!Number.isFinite(episode) || episode <= 0) continue;
      if (!waza_name) continue;

      out.push({ episode, who, whom, scene, waza_name, se, place_hit, place_use });
    }

    out.sort((a, b) => a.episode - b.episode);

    return NextResponse.json({ ok: true, rows: out }, { status: 200 });
  } catch (e) {
    console.error('[study/waza] error:', e);
    return NextResponse.json({ ok: false, error: '技データ取得に失敗しました' }, { status: 500 });
  }
}
