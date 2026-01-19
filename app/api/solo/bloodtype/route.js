// file: app/api/solo/bloodtype/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

function normalizeBlood(s) {
  // 空白除去 + 全角マイナス/ハイフン揺れ吸収
  return cleanStr(s)
    .replace(/\s+/g, '')
    .replace(/[−ー―‐-‒–—]/g, '-');
}

function detectZoneByBlood(bloodRaw) {
  const b = normalizeBlood(bloodRaw);

  // EAST  -> X
  // WEST  -> F
  // NORTH -> S
  // SOUTH -> XF
  // GRAND -> S型RH-
  if (b === 'X') return 'EAST';
  if (b === 'F') return 'WEST';
  if (b === 'S') return 'NORTH';
  if (b === 'XF') return 'SOUTH';

  // 「S型RH-」「S型RH−」などを吸収済み
  if (b === 'S型RH-') return 'GRAND';

  return null;
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'data', 'bloodtype.xlsx');

    // 存在チェック
    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json({
        ok: false,
        message: `bloodtype.xlsx が見つかりません：${xlsxPath}`,
      });
    }

    // ★ Windows/OneDrive/Excelロック対策：readFileではなくBuffer読み
    let buf;
    try {
      buf = fs.readFileSync(xlsxPath);
    } catch (e) {
      const hint =
        'bloodtype.xlsx をExcelで開いている/OneDriveでオンラインのみ/権限 の可能性。Excelを閉じて、ファイルを「このデバイス上に常に保持」にして再試行してね。';
      return NextResponse.json({
        ok: false,
        message: `bloodtype.xlsx を読み取れませんでした。\n${hint}\npath=${xlsxPath}\nerror=${String(
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
        message: 'bloodtype.xlsx のシートが見つかりません',
      });
    }

    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

    // 期待：A列=名前, B列=血液型
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const name = cleanStr(r[0]);
      const blood = cleanStr(r[1]);
      if (!name || !blood) continue;

      const zone = detectZoneByBlood(blood);
      if (!zone) continue;

      list.push({ name, blood, zone });
    }

    if (list.length === 0) {
      return NextResponse.json({
        ok: false,
        message:
          'bloodtype.xlsx から有効データが取れませんでした（A列=名前 / B列=血液型 が入ってるか確認してね）',
      });
    }

    return NextResponse.json({ ok: true, list });
  } catch (e) {
    console.error('[solo-bloodtype] error', e);
    return NextResponse.json({
      ok: false,
      message: `bloodtype データの読み込みに失敗しました: ${String(e?.message || e)}`,
    });
  }
}
