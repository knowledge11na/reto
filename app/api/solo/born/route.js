// file: app/api/solo/born/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

function detectZone(b) {
  const s = String(b || '');
  if (s.includes('東')) return 'EAST';
  if (s.includes('西')) return 'WEST';
  if (s.includes('南')) return 'SOUTH';
  if (s.includes('北')) return 'NORTH';
  if (s.includes('偉大なる航路') || s.includes('偉大') || s.includes('航路'))
    return 'GRAND';
  return null;
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'data', 'born.xlsx');

    // 存在チェック
    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json({
        ok: false,
        message: `born.xlsx が見つかりません：${xlsxPath}`,
      });
    }

    // ★ Windows/OneDrive/Excelロック対策：readFileではなくBuffer読み
    let buf;
    try {
      buf = fs.readFileSync(xlsxPath);
    } catch (e) {
      const hint =
        'born.xlsx をExcelで開いている/OneDriveでオンラインのみ/権限 の可能性。Excelを閉じて、ファイルを「このデバイス上に常に保持」にして再試行してね。';
      return NextResponse.json({
        ok: false,
        message: `born.xlsx を読み取れませんでした。\n${hint}\npath=${xlsxPath}\nerror=${String(
          e?.message || e
        )}`,
      });
    }

    const xlsx = await import('xlsx');
    const wb = xlsx.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json({
        ok: false,
        message: 'born.xlsx のシートが見つかりません',
      });
    }

    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

    // 期待：A列=名前, B列=出身
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = cleanStr(r[0]);
      const born = cleanStr(r[1]);
      if (!name || !born) continue;
      const zone = detectZone(born);
      if (!zone) continue;
      list.push({ name, born, zone });
    }

    if (list.length === 0) {
      return NextResponse.json({
        ok: false,
        message:
          'born.xlsx から有効データが取れませんでした（A列=名前 / B列=出身 が入ってるか確認してね）',
      });
    }

    return NextResponse.json({ ok: true, list });
  } catch (e) {
    console.error(e);
    return NextResponse.json({
      ok: false,
      message: `born データの読み込みに失敗しました: ${String(e?.message || e)}`,
    });
  }
}
