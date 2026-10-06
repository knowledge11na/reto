// file: app/free/saikoro/api/profile/route.js

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      'data',
      'profile2.xlsx'
    );

    console.log(
      '[saikoro/profile] filePath:',
      filePath
    );

    if (!fs.existsSync(filePath)) {
      console.error(
        '[saikoro/profile] file not found:',
        filePath
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            'profile2.xlsx が見つかりません。',
          path: filePath,
        },
        {
          status: 404,
        }
      );
    }

    const fileBuffer =
      fs.readFileSync(filePath);

    console.log(
      '[saikoro/profile] file size:',
      fileBuffer.length
    );

    const workbook =
      XLSX.read(
        fileBuffer,
        {
          type: 'buffer',
        }
      );

    if (
      !workbook.SheetNames ||
      workbook.SheetNames.length === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'profile2.xlsx にシートがありません。',
        },
        {
          status: 500,
        }
      );
    }

    const sheetName =
      workbook.SheetNames[0];

    const sheet =
      workbook.Sheets[sheetName];

    if (!sheet) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'profile2.xlsx の先頭シートを読み込めませんでした。',
        },
        {
          status: 500,
        }
      );
    }

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: '',
        }
      );

    console.log(
      '[saikoro/profile] rows:',
      rows.length
    );

    const familyKeys = [
      '家族',
      '家族2',
      '家族3',
      '家族4',
      '家族5',
      '家族6',
      '家族7',
      '家族8',
    ];

    const items = [];

    rows.forEach(
      (
        row,
        index
      ) => {
        const name =
          String(
            row['名前'] ?? ''
          ).trim();

        if (!name) {
          return;
        }

        const family = [];

        for (
          const key of familyKeys
        ) {
          const value =
            String(
              row[key] ?? ''
            ).trim();

          if (value) {
            family.push(value);
          }
        }

        items.push({
          id:
            `saikoro-vivre-${index}`,

          number:
            index,

          name,

          chapter:
            String(
              row['初登場話'] ?? ''
            ).trim(),

          age:
            String(
              row['年齢'] ?? ''
            ).trim(),

          height:
            String(
              row['身長'] ?? ''
            ).trim(),

          blood:
            String(
              row['血液型'] ?? ''
            ).trim(),

          bornSea:
            String(
              row['出身'] ?? ''
            ).trim(),

          bornPlace:
            String(
              row['出身2'] ?? ''
            ).trim(),

          gender:
            String(
              row['性別'] ?? ''
            ).trim(),

          family,

          favoriteFood:
            String(
              row['好物'] ?? ''
            ).trim(),
        });
      }
    );

    return NextResponse.json(
      {
        ok: true,
        items,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      '[saikoro/profile] error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}