// file: app/api/study/subtitles/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'data', 'subtitles.xlsx');

    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'data/subtitles.xlsx が見つかりません。プロジェクト直下の data フォルダに置いてください。',
        },
        { status: 404 }
      );
    }

    // ★ OneDriveや権限・ロックで readFile(path) が落ちることがあるので、
    //   fsでBufferを読み → XLSX.read(buffer) にする
    const buf = fs.readFileSync(xlsxPath);

    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json(
        { ok: false, error: 'Excelのシートが見つかりません' },
        { status: 400 }
      );
    }

    const ws = wb.Sheets[sheetName];

    // 1列目: 話数, 2列目: サブタイトル（ヘッダ無し想定）
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) || [];

    const out = [];
    for (const r of rows) {
      if (!r) continue;
      const ep = Number(r[0]);
      const title = cleanStr(r[1]);
      if (!Number.isFinite(ep) || ep <= 0) continue;
      if (!title) continue;
      out.push({ episode: ep, title });
    }

    out.sort((a, b) => a.episode - b.episode);

    return NextResponse.json({ ok: true, rows: out }, { status: 200 });
  } catch (e) {
    // ★ ここで原因が分かるようにメッセージを少し丁寧にする
    const msg = String(e?.message || e || '');
    console.error('[study/subtitles] error:', e);

    let hint =
      'サブタイトル取得に失敗しました。OneDrive同期中/Excelで開いている/権限/ファイルロックの可能性があります。';
    if (msg.includes('EACCES') || msg.toLowerCase().includes('access')) {
      hint =
        'subtitles.xlsx にアクセスできません（権限 or ロック）。Excelで閉じて、OneDrive同期が落ち着いてから再試行してください。';
    }
    if (msg.includes('EBUSY')) {
      hint =
        'subtitles.xlsx が使用中です（ロック）。Excelで開いていたら閉じてください。';
    }

    return NextResponse.json({ ok: false, error: hint }, { status: 500 });
  }
}
