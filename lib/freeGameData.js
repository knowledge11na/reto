import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

let extraCache = null;
let extraMtime = null;

function readRows(file, options = {}) {
  const buffer = fs.readFileSync(path.join(process.cwd(), 'data', file));
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames.length) throw new Error(`${file} にシートがありません。`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1, defval: '', ...options,
  });
}

export function loadExtraCharacters() {
  const mtime = fs.statSync(path.join(process.cwd(), 'data', 'extra.xlsx')).mtimeMs;
  if (extraCache && mtime === extraMtime) return extraCache;
  const characters = readRows('extra.xlsx', { raw: false }).map((row, index) => ({
    id: index + 1,
    name: String(row[0] ?? '').trim(),
    description: String(row[1] ?? '').trim(),
  })).filter((character) => character.name && character.description);
  if (!characters.length) throw new Error('extra.xlsx にキャラクターがありません。');
  extraCache = characters;
  extraMtime = mtime;
  return characters;
}

export function loadVivreProfiles() {
  const rows = readRows('profile.xlsx');
  const profiles = rows.slice(1).filter((row) => row[1]).map((row) => {
    const text = (index) => row[index] === '' || row[index] == null ? '不明' : String(row[index]).trim();
    return {
      number: Number(row[0]), name: String(row[1]).trim(), chapter: text(2), age: text(3),
      height: text(4), blood: text(5), bornSea: text(6), bornPlace: text(7),
      gender: text(8),
      family: row.slice(9, 17).map((value) => String(value ?? '').trim()).filter((value) => value && value !== '不明'),
    };
  });
  if (profiles.length < 2) throw new Error('profile.xlsx のキャラクターが不足しています。');
  return profiles;
}
