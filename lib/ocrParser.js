// file: lib/ocrParser.js

// 1問分のテキストをフォーム用オブジェクトに変換する
// 戻り値：{
//   questionType: 'single' | 'multi' | 'order' | 'text',
//   question: string,
//   correctChoices: string[],
//   wrongChoices: string[],
//   orderChoices: string[],
//   textAnswer: string,
// }
export function parseOneBlock(blockTextRaw) {
  const blockText = (blockTextRaw || '').replace(/\r/g, '');
  const lines = blockText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return null;

  // ---------- 1. タイプ判定 ----------
  const joined = lines.join(' ');
  let questionType = 'text';

  if (joined.includes('並び替え')) {
    questionType = 'order';
  } else if (joined.includes('複数選択問題')) {
    questionType = 'multi';
  } else if (joined.includes('選択問題')) {
    questionType = 'single';
  } else {
    questionType = 'text';
  }

  // ---------- 2. A行（回答） ----------
  let answerLineIndex = -1;
  let answerRaw = '';

  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^[AaＡ]\s*(.+)$/);
    if (m) {
      answerLineIndex = i;
      answerRaw = m[1].trim();
      break;
    }
  }

  if (answerLineIndex === -1) {
    // A行が取れなかったら記述扱い
    questionType = 'text';
  }

  // ---------- 3. 選択肢 "1.～～" 行 ----------
  const optionRegex = /^(\d+)[\.\．]?\s*(.+)$/; // 1.〇〇 / 1〇〇 など
  const optionLines = [];

  lines.forEach((line, idx) => {
    if (answerLineIndex !== -1 && idx >= answerLineIndex) return;
    const m = line.match(optionRegex);
    if (!m) return;
    const num = parseInt(m[1], 10);
    const text = (m[2] || '').trim();
    if (!text) return;

    optionLines.push({ num, text, lineIndex: idx });
  });

  optionLines.sort((a, b) => a.num - b.num);
  const optionTexts = optionLines.map((o) => o.text);

  // ---------- 4. 問題文 ----------
  const questionLines = [];

  lines.forEach((line, idx) => {
    if (answerLineIndex !== -1 && idx >= answerLineIndex) return;
    if (optionRegex.test(line)) return; // 選択肢行は除外

    if (
      line === 'Q' ||
      line === 'Ｑ' ||
      line.includes('【選択問題】') ||
      line.includes('【複数選択問題】') ||
      line.includes('【並び替え】') ||
      line.includes('選択終了する場合は') // 説明文も除外
    ) {
      return;
    }

    questionLines.push(line);
  });

  const question = questionLines.join('\n').trim();

  // ---------- 5. Aの数字を解析 ----------
  const digits = (answerRaw.match(/\d+/g) || []).join('');
  const digitList = digits
    .split('')
    .map((d) => parseInt(d, 10))
    .filter((n) => Number.isFinite(n));

  // ---------- 6. タイプごとの変換 ----------

  // 並び替え
  if (questionType === 'order') {
    const orderChoices = [];
    if (digitList.length && optionTexts.length) {
      digitList.forEach((d) => {
        const idx = d - 1;
        if (idx >= 0 && idx < optionTexts.length) {
          orderChoices.push(optionTexts[idx]);
        }
      });
    }

    return {
      questionType: 'order',
      question,
      correctChoices: [''],
      wrongChoices: [''],
      orderChoices: orderChoices.length ? orderChoices : optionTexts,
      textAnswer: '',
    };
  }

  // 単一選択
  if (questionType === 'single' && optionTexts.length && digitList.length) {
    const correctIdx = digitList[0] - 1;
    const correct = optionTexts[correctIdx] || '';
    const wrong = optionTexts.filter((_, i) => i !== correctIdx);

    return {
      questionType: 'single',
      question,
      correctChoices: correct ? [correct] : [''],
      wrongChoices: wrong.length ? wrong : [''],
      orderChoices: [''],
      textAnswer: '',
    };
  }

  // 複数選択
  if (questionType === 'multi' && optionTexts.length && digitList.length) {
    const correctIdxSet = new Set(digitList.map((d) => d - 1));
    const correct = optionTexts.filter((_, i) => correctIdxSet.has(i));
    const wrong = optionTexts.filter((_, i) => !correctIdxSet.has(i));

    return {
      questionType: 'multi',
      question,
      correctChoices: correct.length ? correct : [''],
      wrongChoices: wrong.length ? wrong : [''],
      orderChoices: [''],
      textAnswer: '',
    };
  }

  // 記述問題（選択肢なし or タイプ判定できない）
  return {
    questionType: 'text',
    question,
    correctChoices: [''],
    wrongChoices: [''],
    orderChoices: [''],
    textAnswer: answerRaw || '',
  };
}

// OCRテキスト全体 → 1問ごとの配列
export function parseAllQuestionsFromOcrText(bigText) {
  if (!bigText) return [];

  const normalized = bigText.replace(/\r/g, '');
  // Q / Ｑ を境に分割
  const rawBlocks = normalized
    .split(/\n[QＱ]\s*/g)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const results = [];

  rawBlocks.forEach((block) => {
    const withQ = 'Q\n' + block; // 先頭にQを付け直す
    const parsed = parseOneBlock(withQ);
    if (parsed && parsed.question) {
      results.push(parsed);
    }
  });

  return results;
}
