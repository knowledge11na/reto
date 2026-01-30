// file: app/api/study/cover/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

export async function GET() {
  try {
    // ✅ プロジェクト内 data/cover.xlsx を読む
    const xlsxPath = path.join(process.cwd(), 'data', 'cover.xlsx');

    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json(
        { ok: false, error: `cover.xlsx が見つかりません: ${xlsxPath}` },
        { status: 404 }
      );
    }

    // ✅ readFileSync → buffer → XLSX.read の方が Windows/OneDriveで安定
    let buf;
    try {
      buf = fs.readFileSync(xlsxPath);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `cover.xlsx を読み込めません: ${xlsxPath}\n` +
            `原因: ${e?.message || String(e)}\n` +
            `対策: Excelで開いていたら閉じる / OneDrive同期完了後に再試行`,
        },
        { status: 500 }
      );
    }

    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const rows = [];
    for (const r of json || []) {
      const vol =
        Number(r.VolumeNumber ?? r.vol ?? r.volume ?? r['巻数'] ?? 0) || 0;
      if (!vol) continue;

      const title = cleanStr(r.title ?? r.Title ?? r['巻タイトル'] ?? '');

      const characters = [];
      for (let i = 1; i <= 22; i++) {
        const v = cleanStr(r[`character${i}`] ?? '');
        if (v) characters.push(v);
      }

      rows.push({ volume: vol, title, characters });
    }

    rows.sort((a, b) => a.volume - b.volume);

    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e) {
    console.error('[study/cover] GET error:', e);
    return NextResponse.json(
      { ok: false, error: e?.message || '取得に失敗しました' },
      { status: 500 }
    );
  }
}
