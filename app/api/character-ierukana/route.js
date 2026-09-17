// file: app/api/character-ierukana/route.js

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === ',' || char === '\t') && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);

  return result;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'chars.csv');

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          error: 'data/chars.csv が見つかりません。',
        },
        { status: 404 }
      );
    }

    const text = fs.readFileSync(filePath, 'utf8');

    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return NextResponse.json(
        {
          error: 'chars.csv が空です。',
        },
        { status: 400 }
      );
    }

    const characters = [];

    for (let i = 0; i < lines.length; i++) {
      const columns = parseCSVLine(lines[i]);

      // ヘッダー行を飛ばす
      if (
        i === 0 &&
        (
          normalize(columns[0]) === 'char_no' ||
          normalize(columns[0]) === 'no' ||
          normalize(columns[0]) === 'キャラ番号'
        )
      ) {
        continue;
      }

      if (columns.length < 4) continue;

      const charNoText = String(columns[0] ?? '').trim();
      const name = String(columns[1] ?? '').trim();
      const relatedWord = String(columns[3] ?? '').trim();

      const charNo = Number(charNoText);

      if (!Number.isInteger(charNo) || charNo <= 0) {
        continue;
      }

      if (!name) {
        continue;
      }

      characters.push({
        charNo,
        name,
        relatedWord,
        normalizedName: normalize(name),
        normalizedRelatedWord: normalize(relatedWord),
      });
    }

    // キャラクターナンバー順
    characters.sort((a, b) => a.charNo - b.charNo);

    return NextResponse.json(
      {
        characters,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('character-ierukana API error:', error);

    return NextResponse.json(
      {
        error: 'キャラクターデータの読み込みに失敗しました。',
      },
      { status: 500 }
    );
  }
}