// file: app/api/tenipuri/waza/route.js

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  console.log('=================================');
  console.log('[tenipuri/waza] GET START');
  console.log('=================================');

  try {
    const filePath = path.join(
      process.cwd(),
      'data',
      'tenipuriwaza.xlsx'
    );

    console.log('[tenipuri/waza] cwd =', process.cwd());
    console.log('[tenipuri/waza] filePath =', filePath);

    // ---------------------------------------------------------
    // ファイル存在確認
    // ---------------------------------------------------------

    if (!fs.existsSync(filePath)) {
      console.error(
        '[tenipuri/waza] FILE NOT FOUND:',
        filePath
      );

      return NextResponse.json(
        {
          ok: false,
          error: `Excelファイルが見つかりません。\n${filePath}`,
        },
        { status: 404 }
      );
    }

    console.log('[tenipuri/waza] file exists');

    // ---------------------------------------------------------
    // Excel読み込み
    // ---------------------------------------------------------

    const buffer = fs.readFileSync(filePath);

    console.log(
      '[tenipuri/waza] buffer size =',
      buffer.length
    );

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
    });

    console.log(
      '[tenipuri/waza] sheets =',
      workbook.SheetNames
    );

    if (!workbook.SheetNames.length) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Excelにシートがありません。',
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 先頭シート
    // ---------------------------------------------------------

    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return NextResponse.json(
        {
          ok: false,
          error: `シート「${sheetName}」を読み込めませんでした。`,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 行データ
    // ---------------------------------------------------------

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    console.log(
      '[tenipuri/waza] rows =',
      rows.length
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Excelにデータがありません。',
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // Excel
    //
    // 越前リョーマ	佐々部	1	ツイストサーブ
    // 柿ノ木坂テニスガーデン・練習用コート	右	エース
    // ---------------------------------------------------------

    const waza = rows
      .slice(1)
      .filter((row) => {
        return row.some(
          (value) =>
            String(value ?? '').trim() !== ''
        );
      })
      .map((row, index) => {
        return {
          id: index + 1,

          hitter: String(
            row[0] ?? ''
          ).trim(),

          target: String(
            row[1] ?? ''
          ).trim(),

          episode: String(
            row[2] ?? ''
          ).trim(),

          technique: String(
            row[3] ?? ''
          ).trim(),

          location: String(
            row[4] ?? ''
          ).trim(),

          hand: String(
            row[5] ?? ''
          ).trim(),

          result: String(
            row[6] ?? ''
          ).trim(),
        };
      });

    console.log(
      '[tenipuri/waza] SUCCESS:',
      waza.length
    );

    // 最初の3件だけ確認
    console.log(
      '[tenipuri/waza] sample:',
      waza.slice(0, 3)
    );

    return NextResponse.json({
      ok: true,
      waza,
    });

  } catch (error) {
    console.error(
      '[tenipuri/waza] ERROR:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          `Excel読み込みエラー：${
            error?.message ||
            String(error)
          }`,
      },
      { status: 500 }
    );
  }
}