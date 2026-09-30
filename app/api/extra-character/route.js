// file: app/api/extra-character/route.js

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

let cachedCharacters = null;
let cachedMtime = null;

function loadCharacters() {
  const filePath = path.join(
    process.cwd(),
    'data',
    'extra.xlsx'
  );

  console.log('[extra-character] file path:', filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `extra.xlsx が見つかりません: ${filePath}`
    );
  }

  const stat = fs.statSync(filePath);

  console.log(
    '[extra-character] file size:',
    stat.size
  );

  // 変更されていなければキャッシュを使用
  if (
    cachedCharacters &&
    cachedMtime === stat.mtimeMs
  ) {
    return cachedCharacters;
  }

  // ファイルをBufferとして読み込む
  const fileBuffer = fs.readFileSync(filePath);

  console.log(
    '[extra-character] buffer size:',
    fileBuffer.length
  );

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error(
      'extra.xlsx のファイルサイズが0です。'
    );
  }

  // readFileではなくBufferから読み込む
  const workbook = XLSX.read(fileBuffer, {
    type: 'buffer',
  });

  if (
    !workbook.SheetNames ||
    workbook.SheetNames.length === 0
  ) {
    throw new Error(
      'extra.xlsx にシートがありません。'
    );
  }

  const sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(
      `シート「${sheetName}」を読み込めませんでした。`
    );
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const characters = rows
    .map((row, index) => {
      const name = String(
        row?.[0] ?? ''
      ).trim();

      const description = String(
        row?.[1] ?? ''
      ).trim();

      if (!name || !description) {
        return null;
      }

      return {
        id: index + 1,
        name,
        description,
      };
    })
    .filter(Boolean);

  if (characters.length === 0) {
    throw new Error(
      'extra.xlsx からキャラクターを1件も読み込めませんでした。'
    );
  }

  console.log(
    `[extra-character] loaded ${characters.length} characters`
  );

  cachedCharacters = characters;
  cachedMtime = stat.mtimeMs;

  return characters;
}

export async function GET() {
  try {
    const characters = loadCharacters();

    return NextResponse.json({
      success: true,
      characters,
      count: characters.length,
    });
  } catch (error) {
    console.error(
      '[extra-character] API error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          'extra.xlsx の読み込みに失敗しました。',
      },
      {
        status: 500,
      }
    );
  }
}