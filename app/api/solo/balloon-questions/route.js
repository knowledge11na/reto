// file: app/api/solo/balloon-questions/route.js
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ===== utils =====
function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// （）内の文は無視
function stripParens(s) {
  return (s || '').toString().replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
}

// 記号・空白は有無を問わない（＝全部消す） ※中黒含む
function normalizeLoose(s) {
  return stripParens(s)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(
      /[・、，,./／\u30fb\u3001\u3002\-ー―—_~!！?？:：;；"'“”‘’\[\]{}()（）<>＜＞@#＃$％%^&＆*＋+=|｜\\]/g,
      ''
    );
}

// 複数回答の分解（・ や 、 や / など）
function splitAnswersLoose(s) {
  const base = stripParens(s || '').trim();
  if (!base) return [];
  const parts = base.split(/[・、，,\/／]+/g).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [base];
}

// 数字だけ比較（年齢/身長/懸賞金用）
function normalizeDigits(s) {
  return stripParens(s).toString().replace(/[^\d]/g, ''); // 数字以外全部捨てる
}

// otherの「船」だけ：中黒の有無を厳密（半角/全角は同一扱い）
function normalizeDotChar(s) {
  // ・と･は同一扱い（全部「・」に寄せる）
  return (s || '').toString().replace(/･/g, '・');
}

// ===== Excel read =====
function readXlsx(filePath) {
  // npm i xlsx 必須
  // eslint-disable-next-line global-require
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
}

/**
 * mode別に rows を question へ
 * - food/height/age/bounty: A=キャラ名, B=答え
 * - other:
 *   - 2列なら A=キャラ名, B=答え（従来通り）
 *   - 3列以上なら A=種別（例: 船/趣味/その他）, B=出題テキスト, C=答え
 *     （あなたの「A列に船」ルールはこっちを想定）
 */
function buildQuestionsFromSheet(data, mode) {
  const questions = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!r || r.length < 2) continue;

    // other 3列形式: [kind, text, answer]
    if (mode === 'other' && r.length >= 3) {
      const kind = String(r[0] ?? '').trim(); // 船 / 趣味 / その他...
      const text = String(r[1] ?? '').trim(); // 表示（キャラ名や船名など）
      const answerText = String(r[2] ?? '').trim();
      if (!text || !answerText) continue;

      const isShip = kind === '船';

      questions.push({
        id: `row-${i + 1}`,
        text,
        answerText,
        mode,
        meta: { kind, isShip },

        // 判定用
        judge: buildJudgePayload(mode, answerText, { isShip }),
      });
      continue;
    }

    // 基本2列形式: [text, answer]
    const text = String(r[0] ?? '').trim();
    const answerText = String(r[1] ?? '').trim();
    if (!text || !answerText) continue;

    questions.push({
      id: `row-${i + 1}`,
      text,
      answerText,
      mode,
      meta: {},

      judge: buildJudgePayload(mode, answerText, {}),
    });
  }

  return questions;
}

function buildJudgePayload(mode, answerText, meta) {
  // 年齢/身長/懸賞金：数字以外無視（（）も無視）
  if (mode === 'age' || mode === 'height' || mode === 'bounty') {
    const digits = normalizeDigits(answerText);
    return {
      type: 'digits',
      digits, // 例: "55億6480万" -> "556480"
    };
  }

  // other：船だけ中黒の有無を厳密（半角/全角は同一扱い）
  if (mode === 'other' && meta?.isShip) {
    const ans = normalizeDotChar(stripParens(answerText)).trim();
    return {
      type: 'ship-dot-strict',
      answer: ans, // 中黒の有無はそのまま保持（ただし半角は全角へ）
    };
  }

  // food / other(船以外)：好物ルール（（）無視・記号無視・複数順不同）
  const parts = splitAnswersLoose(answerText).map(normalizeLoose).filter(Boolean);
  return {
    type: 'loose-parts',
    parts,
  };
}

function fileNameByMode(mode) {
  if (mode === 'food') return 'koubutu.xlsx';
  if (mode === 'height') return 'height.xlsx';
  if (mode === 'age') return 'age.xlsx';
  if (mode === 'bounty') return 'bounty.xlsx';
  if (mode === 'other') return 'other.xlsx';
  return 'koubutu.xlsx';
}

export async function GET(req) {
  try {
    // eslint-disable-next-line global-require
    const path = require('node:path');
    // eslint-disable-next-line global-require
    const fs = require('node:fs');

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'food').toString();

    const fileName = fileNameByMode(mode);
    const filePath = path.join(process.cwd(), 'data', fileName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          ok: false,
          error: `data/${fileName} が見つかりません。Next.jsプロジェクト直下の data/ に置いてください。`,
          debug: { filePath },
        },
        { status: 404 }
      );
    }

    const sheet = readXlsx(filePath);
    const rows = buildQuestionsFromSheet(sheet, mode);

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: 'Excelから読み取れませんでした（列構成を確認して）' },
        { status: 400 }
      );
    }

    // ゲーム側でランダムに使うのでシャッフルして返す
    const questions = shuffle(rows);

    return NextResponse.json({ ok: true, mode, questions }, { status: 200 });
  } catch (e) {
    console.error('[balloon-questions] error', e);
    return NextResponse.json({ ok: false, error: '内部エラー' }, { status: 500 });
  }
}
