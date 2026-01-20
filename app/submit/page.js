// file: app/submit/page.js
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeSuggestModal from '@/components/ThemeSuggestModal';

const TAGS_STORY = [
  '東の海',
  '偉大なる航路突入',
  'アラバスタ',
  '空島',
  'DBF',
  'W7、エニエス・ロビー',
  'スリラーバーク',
  'シャボンディ諸島',
  '女ヶ島',
  'インペルダウン',
  '頂上戦争',
  '3D2Y',
  '魚人島',
  'パンクハザード',
  'ドレスローザ',
  'ゾウ',
  'WCI',
  '世界会議',
  'ワノ国',
  'エッグヘッド',
  'エルバフ',
];

const TAGS_OTHER = [
  'SBS',
  'ビブルカード',
  '扉絵',
  '技',
  '巻跨ぎ',
  'セリフ',
  '表紙',
  'サブタイトル',
  'その他',
];

function cleanArray(arr) {
  return (arr || []).map((s) => String(s ?? '').trim()).filter((s) => s.length > 0);
}

// ──────────────────────────────
// CSV / TSV 解析用ユーティリティ
// ──────────────────────────────

// テキスト全体を「クォート内の改行は維持しつつ」行に分割
function splitCsvLines(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < (text || '').length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // 連続する "" はエスケープされた "
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim() !== '') lines.push(current);
      current = '';
      // \r\n の場合に二重処理しない
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }

  if (current.trim() !== '') lines.push(current);
  return lines;
}

// 1行をセル配列に分割（区切り：カンマ or タブ / " で囲まれた部分対応）
function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < (line || '').length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// 区切り推定：タブが多ければTSV扱い、なければCSV
function detectDelimiter(text) {
  const t = text || '';
  const sample = t.slice(0, 2000);
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}

// 質問テキスト/選択肢から画像URL部分を除去
function stripImagePart(str) {
  if (!str) return '';
  const first = String(str).split('|')[0];
  return first.trim();
}

// 末尾に suffix を付ける（すでに付いてたら二重で付けない）
function appendSuffixOnce(text, suffix) {
  const t = (text || '').trim();
  if (!t) return t;
  if (!suffix) return t;
  if (t.endsWith(suffix)) return t;
  return t + suffix;
}

/**
 * CSV/TSV テキスト → 「サイト用の下書き質問」配列に変換
 *
 * 対応フォーマット：
 * A) アプリ形式（7列以上）
 *   questionId,question,answers,wrong,explanation,ordered,generatedWrongChoices
 *
 * B) 2列形式（Excel想定）
 *   question,answer
 *   または TSV（タブ区切り）もOK
 */
function parseImportedQuestions(csvText, opts = {}) {
  const { addNumericSuffix = false } = opts;

  const lines = splitCsvLines(csvText || '');
  if (!lines.length) return [];

  const delimiter = detectDelimiter(csvText || '');

  // ヘッダ判定（アプリ形式）
  let startIdx = 0;
  const headerLower = (lines[0] || '').toLowerCase();
  const looksLikeAppHeader =
    headerLower.includes('questionid') && headerLower.includes('question');

  if (looksLikeAppHeader) startIdx = 1;

  const imported = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const cells = parseDelimitedLine(line, delimiter).map((c) =>
      typeof c === 'string' ? c.trim() : c
    );

    // ──────────────────────────────
    // B) 2列形式（question,answer）
    // ──────────────────────────────
    if (!looksLikeAppHeader && cells.length <= 3) {
      const qRaw = cells[0] ?? '';
      const aRaw = cells[1] ?? '';
      const questionText0 = stripImagePart(qRaw);
      const answerText0 = stripImagePart(aRaw);

      if (!questionText0) continue;
      if (!answerText0) continue;

      const questionText = addNumericSuffix
        ? appendSuffixOnce(questionText0, '（数字のみで回答）')
        : questionText0;

      imported.push({
        _sourceId: '',
        _explanation: '',
        questionType: 'text',
        question: questionText,
        textAnswer: answerText0.trim(),
        altTextAnswers: [''],
        correctChoices: [''],
        wrongChoices: [''],
        orderChoices: [''],
      });
      continue;
    }

    // ──────────────────────────────
    // A) アプリ形式（7列以上想定）
    // ──────────────────────────────
    while (cells.length < 7) cells.push('');

    const [
      questionId,
      questionRaw,
      answersRaw,
      wrongRaw,
      explanation,
      orderedRaw,
      generatedWrongChoicesRaw,
    ] = cells;

    const questionText0 = stripImagePart(questionRaw);
    if (!questionText0) continue;

    const questionText = addNumericSuffix
      ? appendSuffixOnce(questionText0, '（数字のみで回答）')
      : questionText0;

    const answersText = stripImagePart(answersRaw);
    const wrongText = stripImagePart(wrongRaw);

    const answersList = (answersText || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const wrongList = (wrongText || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    let questionType = 'text';

    if (
      questionText.includes('並び替え') ||
      questionText.includes('並びかえ') ||
      questionText.includes('順番に並べ') ||
      questionText.includes('順に並べ')
    ) {
      questionType = 'order';
    } else if (wrongList.length > 0) {
      if (answersList.length > 1) questionType = 'multi';
      else questionType = 'single';
    } else {
      questionType = 'text';
    }

    const item = {
      _sourceId: questionId,
      _explanation: explanation,
      questionType,
      question: questionText,
      textAnswer: '',
      altTextAnswers: [''],
      correctChoices: [''],
      wrongChoices: [''],
      orderChoices: [''],
    };

    if (questionType === 'text') {
      item.textAnswer = (answersText || '').trim();
      item.altTextAnswers = [''];
    } else if (questionType === 'single') {
      item.correctChoices =
        answersList.length > 0 ? answersList : answersText ? [answersText] : [''];
      item.wrongChoices = wrongList.length > 0 ? wrongList : [''];
    } else if (questionType === 'multi') {
      item.correctChoices =
        answersList.length > 0 ? answersList : answersText ? [answersText] : [''];
      item.wrongChoices = wrongList.length > 0 ? wrongList : [''];
    } else if (questionType === 'order') {
      item.orderChoices =
        answersList.length > 0 ? answersList : answersText ? [answersText] : [''];
    }

    imported.push(item);
  }

  return imported;
}

// ローカルストレージ用キー
const IMPORT_QUEUE_KEY = 'submit_import_queue_v1';
const IMPORT_INDEX_KEY = 'submit_import_index_v1';

export default function SubmitPage() {
  const [questionType, setQuestionType] = useState('single'); // single | multi | text | order
  const [question, setQuestion] = useState('');

  // 記述用
  const [textAnswer, setTextAnswer] = useState('');
  const [altTextAnswers, setAltTextAnswers] = useState(['']);

  // 単一 / 複数選択用
  const [correctChoices, setCorrectChoices] = useState(['']);
  const [wrongChoices, setWrongChoices] = useState(['']);

  // 並び替え用（正解順）
  const [orderChoices, setOrderChoices] = useState(['']);

  const [selectedTags, setSelectedTags] = useState([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 類似チェック用
  const [duplicates, setDuplicates] = useState([]);
  const [confirmMode, setConfirmMode] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);

  // ★ 類似チェックを飛ばす（高速投稿）
  const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);

  // 「前の条件を引き継ぐ」設定
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryConfig, setCarryConfig] = useState({
    keepQuestion: false,
    keepQuestionType: false,
    keepAnswerContent: false,
    keepAnswerBoxes: false,
    keepTags: false,
  });

  // CSV からの「問題ストック」
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importQueue, setImportQueue] = useState([]);
  const [importIndex, setImportIndex] = useState(0);
  const [importInfo, setImportInfo] = useState('');

  // ★ 通常投稿に戻したら「投稿しても自動で次のCSV問題に進まない」ためのフラグ
  const [importAutoFillPaused, setImportAutoFillPaused] = useState(false);

  // ★ 2列CSV用：問題文末尾へ（数字のみで回答）を付ける
  const [importAddNumericSuffix, setImportAddNumericSuffix] = useState(true);

  const toggleCarry = (key) => {
    setCarryConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleArrayChange = (index, value, setter) => {
    setter((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const addArrayRow = (setter) => {
    setter((prev) => [...prev, '']);
  };

  const removeArrayRow = (index, setter) => {
    setter((prev) => {
      if (prev.length <= 1) return prev;
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  // ──────────────────────────────
  // 投稿後リセット（引き継ぎ設定を反映）
  // ──────────────────────────────
  const resetForm = () => {
    setDuplicates([]);
    setConfirmMode(false);

    const altLen = altTextAnswers.length || 1;
    const correctLen = correctChoices.length || 1;
    const wrongLen = wrongChoices.length || 1;
    const orderLen = orderChoices.length || 1;

    if (!carryConfig.keepQuestion) setQuestion('');
    if (!carryConfig.keepQuestionType) setQuestionType('single');

    if (carryConfig.keepAnswerContent) {
      // 何もしない
    } else if (carryConfig.keepAnswerBoxes) {
      setTextAnswer('');
      setAltTextAnswers(Array(altLen).fill(''));
      setCorrectChoices(Array(correctLen).fill(''));
      setWrongChoices(Array(wrongLen).fill(''));
      setOrderChoices(Array(orderLen).fill(''));
    } else {
      setTextAnswer('');
      setAltTextAnswers(['']);
      setCorrectChoices(['']);
      setWrongChoices(['']);
      setOrderChoices(['']);
    }

    if (!carryConfig.keepTags) setSelectedTags([]);
  };

  // ──────────────────────────────
  // CSV から読み込んだ 1問をフォームに反映
  // ──────────────────────────────
  const applyImportedQuestion = (item) => {
    if (!item) return;

    setQuestionType(item.questionType || 'text');
    setQuestion(item.question || '');

    setTextAnswer(item.textAnswer || '');
    setAltTextAnswers(
      Array.isArray(item.altTextAnswers) && item.altTextAnswers.length > 0
        ? item.altTextAnswers
        : ['']
    );
    setCorrectChoices(
      Array.isArray(item.correctChoices) && item.correctChoices.length > 0
        ? item.correctChoices
        : ['']
    );
    setWrongChoices(
      Array.isArray(item.wrongChoices) && item.wrongChoices.length > 0
        ? item.wrongChoices
        : ['']
    );
    setOrderChoices(
      Array.isArray(item.orderChoices) && item.orderChoices.length > 0
        ? item.orderChoices
        : ['']
    );
  };

  // ──────────────────────────────
  // 類似問題チェックだけを行う
  // ──────────────────────────────
  const runDuplicateCheck = async (payload) => {
    try {
      setCheckingDup(true);
      setMessage('');

      const res = await fetch('/api/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: payload.type,
          question: payload.question,
          options: payload.options,
          answer: payload.answer,
        }),
      });

      if (!res.ok) {
        setMessage(
          '類似問題チェックに失敗しました。チェックを飛ばすか、時間をおいて再度お試しください。'
        );
        return null;
      }

      const data = await res.json().catch(() => ({}));
      return data.duplicates || [];
    } catch (e) {
      console.error(e);
      setMessage(
        '類似問題チェックでエラーが出ました。チェックを飛ばすか、時間をおいて再度お試しください。'
      );
      return null;
    } finally {
      setCheckingDup(false);
    }
  };

  // ──────────────────────────────
  // 共通：payload を作る
  // ──────────────────────────────
  const buildPayload = () => {
    const qText = question.trim();
    if (!qText) return { error: '問題文を入力してください。' };
    if (selectedTags.length === 0) return { error: 'タグを最低1つ選んでください。' };

    let options = [];
    let answer = '';
    let altAnswers = [];

    if (questionType === 'text') {
      const mainAns = textAnswer.trim();
      if (!mainAns) return { error: '正解を入力してください。' };
      const alts = cleanArray(altTextAnswers);
      options = [];
      answer = mainAns;
      altAnswers = alts;
    } else if (questionType === 'single') {
      const correct = cleanArray(correctChoices);
      const wrong = cleanArray(wrongChoices);

      if (correct.length !== 1)
        return { error: '単一選択は「解答」をちょうど1つにしてください。' };
      if (wrong.length === 0)
        return { error: '不正解の選択肢を1つ以上入力してください。' };

      options = [...correct, ...wrong];
      answer = correct[0];
      altAnswers = [];
    } else if (questionType === 'multi') {
      const correct = cleanArray(correctChoices);
      const wrong = cleanArray(wrongChoices);

      if (correct.length < 1)
        return { error: '複数選択は「解答」を1つ以上入力してください。' };

      options = [...correct, ...wrong];
      answer = correct.join('||');
      altAnswers = [];
    } else if (questionType === 'order') {
      const order = cleanArray(orderChoices);
      if (order.length < 2)
        return { error: '並び替えは2つ以上の項目を入力してください。' };

      options = order;
      answer = order.join('||');
      altAnswers = [];
    } else {
      return { error: '不明な問題タイプです。' };
    }

    return {
      payload: {
        type: questionType,
        question: qText,
        options,
        answer,
        altAnswers,
        tags: selectedTags,
      },
    };
  };

  // ──────────────────────────────
  // フォーム送信（チェックONなら高速投稿）
  // ──────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || checkingDup) return;

    setMessage('');
    setDuplicates([]);

    const built = buildPayload();
    if (built.error) {
      setMessage(built.error);
      return;
    }
    const payload = built.payload;

    // ★ 高速モード：類似チェックを完全にスキップ＆確認モードも解除
    if (skipDuplicateCheck) {
      setConfirmMode(false);
    } else {
      // 通常モード：確認前は類似チェック
      if (!confirmMode) {
        const dups = await runDuplicateCheck(payload);
        if (dups && dups.length > 0) {
          setDuplicates(dups);
          setConfirmMode(true);
          setMessage(
            '類似問題があります。下の一覧を確認して、それでも投稿する場合はもう一度「この内容で投稿する」を押してください。'
          );
          return;
        }
      }
    }

    try {
      setSubmitting(true);

      const url = skipDuplicateCheck
        ? '/api/submit-question-fast'
        : '/api/submit-question';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('submit error', data);
        setMessage('送信に失敗しました。時間をおいて再度お試しください。');
        return;
      }

      setMessage('問題を送信しました。承認されると本番に反映されます。');
      resetForm();

      if (
        !importAutoFillPaused &&
        importQueue.length > 0 &&
        importIndex < importQueue.length
      ) {
        const nextItem = importQueue[importIndex];
        applyImportedQuestion(nextItem);
        const nextIndex = importIndex + 1;
        setImportIndex(nextIndex);
        setImportInfo(`読み込み済み: ${nextIndex} / ${importQueue.length} 問`);
      }
    } catch (err) {
      console.error(err);
      setMessage('送信中にエラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  // ──────────────────────────────
  // CSV 読み込み系のハンドラ
  // ──────────────────────────────
  const handleImportAdd = () => {
    const list = parseImportedQuestions(importText || '', {
      addNumericSuffix: importAddNumericSuffix,
    });

    if (!list.length) {
      setImportInfo('読み込める問題がありませんでした。');
      return;
    }

    setImportQueue((prev) => {
      const next = [...prev, ...list];
      setImportInfo(
        `${list.length}問をストックに追加しました。（ストック合計 ${next.length}問）`
      );
      return next;
    });
  };

  const handleImportNext = () => {
    setImportAutoFillPaused(false);

    if (importQueue.length === 0) {
      setImportInfo(
        'ストックが空です。CSV/TSVを貼り付けて「ストックに追加」を押してください。'
      );
      return;
    }
    if (importIndex >= importQueue.length) {
      setImportInfo('ストックの問題は全てフォームに流し込みました。');
      return;
    }
    const item = importQueue[importIndex];
    applyImportedQuestion(item);
    const nextIndex = importIndex + 1;
    setImportIndex(nextIndex);
    setImportInfo(`読み込み済み: ${nextIndex} / ${importQueue.length} 問`);
  };

  const handleImportPrev = () => {
    setImportAutoFillPaused(false);

    if (importQueue.length === 0) {
      setImportInfo(
        'ストックが空です。CSV/TSVを貼り付けて「ストックに追加」を押してください。'
      );
      return;
    }
    if (importIndex <= 1) {
      const item = importQueue[0];
      applyImportedQuestion(item);
      setImportIndex(1);
      setImportInfo(`読み込み済み: 1 / ${importQueue.length} 問（先頭の問題を表示中）`);
      return;
    }

    const prevIndex = importIndex - 1;
    const item = importQueue[prevIndex - 1];
    applyImportedQuestion(item);
    setImportIndex(prevIndex);
    setImportInfo(
      `読み込み済み: ${prevIndex} / ${importQueue.length} 問（1つ前の問題に戻りました）`
    );
  };

  const handleSwitchToNormal = () => {
    setImportAutoFillPaused(true);

    setQuestionType('single');
    setQuestion('');
    setTextAnswer('');
    setAltTextAnswers(['']);
    setCorrectChoices(['']);
    setWrongChoices(['']);
    setOrderChoices(['']);
    setDuplicates([]);
    setConfirmMode(false);
    setMessage('CSVからの進捗は保存されています。通常の投稿モードに切り替えました。');
  };

  const handleClearImportQueue = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('読み込んだ問題ストックをすべて削除します。よろしいですか？');
      if (!ok) return;
    }

    setImportQueue([]);
    setImportIndex(0);
    setImportText('');
    setImportInfo('問題ストックをすべて削除しました。');

    try {
      window.localStorage.removeItem(IMPORT_QUEUE_KEY);
      window.localStorage.removeItem(IMPORT_INDEX_KEY);
    } catch (e) {
      console.error('failed to clear import queue', e);
    }
  };

  // ──────────────────────────────
  // ★ ストック＆進捗を localStorage に保存・復元
  // ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const qStr = window.localStorage.getItem(IMPORT_QUEUE_KEY);
      const idxStr = window.localStorage.getItem(IMPORT_INDEX_KEY);

      if (qStr) {
        const parsed = JSON.parse(qStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const idxRaw = parseInt(idxStr ?? '0', 10);
          const idx = Number.isNaN(idxRaw) ? 0 : idxRaw;

          setImportQueue(parsed);
          setImportIndex(idx);
          setImportInfo(
            `前回のストックを復元しました。全 ${parsed.length} 問 / 次のインデックス: ${
              idx + 1
            }`
          );
        }
      }
    } catch (e) {
      console.error('failed to restore import queue', e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (importQueue.length > 0) {
        window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(importQueue));
        window.localStorage.setItem(IMPORT_INDEX_KEY, String(importIndex));
      } else {
        window.localStorage.removeItem(IMPORT_QUEUE_KEY);
        window.localStorage.removeItem(IMPORT_INDEX_KEY);
      }
    } catch (e) {
      console.error('failed to save import queue', e);
    }
  }, [importQueue, importIndex]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* ヘッダー：タイトル + ボタン群 */}
        <header className="flex items-center justify-between mb-2">
          <h1 className="text-lg sm:text-xl font-bold">問題投稿</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="border border-emerald-400 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-900 text-emerald-100 shadow-sm"
            >
              問題読み込み
            </button>

            <button
              type="button"
              onClick={() => setCarryOpen((v) => !v)}
              className="border border-sky-400 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-900 text-sky-100 shadow-sm"
            >
              条件を引き継ぐ
            </button>

            <Link
              href="/"
              className="border border-sky-400 px-2.5 py-1 rounded-full text-[11px] font-bold text-sky-200 bg-slate-900"
            >
              ホームへ
            </Link>
          </div>
        </header>

        {/* CSV 読み込みパネル */}
        {importOpen && (
          <div className="mb-2 text-xs bg-slate-900 border border-emerald-500 rounded-2xl px-3 py-3 space-y-2">
            <div className="font-semibold text-emerald-200 mb-1">
              CSV / TSV から問題を読み込む
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed">
              対応：
              <span className="text-emerald-200 font-semibold">2列形式</span>
              （問題,答え） / アプリ形式（questionId,question,answers,...）
              <br />
              ※ Excel からコピペしたタブ区切り（TSV）もOK
            </div>

            <label className="inline-flex items-center gap-2 mt-1 cursor-pointer">
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={importAddNumericSuffix}
                onChange={() => setImportAddNumericSuffix((v) => !v)}
              />
              <span className="text-[11px] text-emerald-100">
                問題文の末尾に「（数字のみで回答）」を付けてストックする
              </span>
            </label>

            <textarea
              className="w-full h-32 px-2 py-1 rounded bg-slate-950 border border-slate-700 font-mono leading-snug text-[16px]"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`例（2列）:
Excelの2列でA列問題、B列答え
暗記メーカーのcsvエクスポート

TSVもOK（Excelからそのまま貼れる）`}
            />

            <div className="flex flex-wrap gap-2 mt-1 items-center">
              <button
                type="button"
                onClick={handleImportAdd}
                className="px-3 py-1 rounded-full bg-emerald-500 text-black font-bold text-xs"
              >
                ストックに追加
              </button>
              <button
                type="button"
                onClick={handleImportPrev}
                className="px-3 py-1 rounded-full bg-slate-800 text-emerald-100 font-bold text-xs border border-slate-600"
              >
                1つ前の問題に戻る
              </button>
              <button
                type="button"
                onClick={handleImportNext}
                className="px-3 py-1 rounded-full bg-emerald-700 text-slate-50 font-bold text-xs"
              >
                次の読み込み問題をフォームにセット
              </button>
              <span className="text-[11px] text-slate-400 mt-1">
                ストック: {importQueue.length} 問 / 次のインデックス: {importIndex + 1}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={handleSwitchToNormal}
                className="px-3 py-1 rounded-full bg-slate-900 border border-slate-500 text-slate-100 font-bold text-[11px]"
              >
                進捗を保存して通常の投稿に戻る
              </button>

              <button
                type="button"
                onClick={handleClearImportQueue}
                className="px-3 py-1 rounded-full bg-slate-900 border border-rose-500 text-rose-300 font-bold text-[11px]"
              >
                ストックをすべて削除
              </button>
            </div>

            {importInfo && (
              <div className="mt-1 text-[11px] text-emerald-200 whitespace-pre-line">
                {importInfo}
              </div>
            )}
          </div>
        )}

        {/* 引き継ぎ設定パネル */}
        {carryOpen && (
          <div className="mb-2 text-xs bg-slate-900 border border-sky-500 rounded-2xl px-3 py-2 space-y-2">
            <div className="font-semibold text-sky-200">投稿後に引き継ぐ項目</div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={carryConfig.keepQuestion}
                  onChange={() => toggleCarry('keepQuestion')}
                />
                <span>問題文</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={carryConfig.keepQuestionType}
                  onChange={() => toggleCarry('keepQuestionType')}
                />
                <span>問題タイプ</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={carryConfig.keepAnswerContent}
                  onChange={() => toggleCarry('keepAnswerContent')}
                />
                <span>解答内容</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={carryConfig.keepAnswerBoxes}
                  onChange={() => toggleCarry('keepAnswerBoxes')}
                />
                <span>解答欄</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={carryConfig.keepTags}
                  onChange={() => toggleCarry('keepTags')}
                />
                <span>タグ</span>
              </label>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ・<span className="font-semibold text-sky-200">解答内容</span>
              ：記述／単一／複数／並び替えの「回答欄の枠の数」と「入力した内容」がそのまま残ります。
              {'\n'}・<span className="font-semibold text-sky-200">解答欄</span>
              ：「枠の数」だけ残し、中身は空にリセットされます。
            </p>
          </div>
        )}

        {/* 本体フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 種別 + 高速チェック */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <label className="block font-semibold whitespace-nowrap text-[13px]">
                問題タイプ
              </label>

              {/* ★右寄せ */}
              <div className="flex items-center gap-2 ml-auto">
                {/* テーマ相談 */}
                <ThemeSuggestModal
                  onApply={(picked) => {
                    // =========================
                    // ★ タイトルを問題文用に整形
                    // =========================
                    let title = String(picked?.title || '').trim();

                    // 「から作問」を削除
                    title = title.replace(/から作問$/, '').trim();

                    // kind別処理
                    if (picked?.kind === 'subtitles') {
                      // 第50話「己が路（みち）」 → 第50話“己が路（みち）”
                      title = title.replace(/第(\d+)話「(.+?)」/, '第$1話“$2”');
                    }

                    if (picked?.kind === 'char' || picked?.kind === 'waza') {
                      // 「」の中身だけ取り出す
                      const m = title.match(/「(.+?)」/);
                      if (m) title = m[1];
                    }

                    if (title) setQuestion(title);

                    // =========================
                    // 以降は既存ロジックそのまま
                    // =========================
                    const d = picked?.draft;

                    if (picked?.kind === 'waza' && d?.question) {
                      setQuestionType('single');
                      setQuestion(d.question || title);
                      const opts = Array.isArray(d.options) ? d.options : [];
                      const correct = d.correct ? [String(d.correct)] : [''];
                      const wrong = opts.filter((x) => String(x) !== String(d.correct));

                      setCorrectChoices(correct.length ? correct : ['']);
                      setWrongChoices(wrong.length ? wrong : ['']);
                      setTextAnswer('');
                      setAltTextAnswers(['']);
                      setOrderChoices(['']);
                      return;
                    }

                    if (picked?.kind === 'subtitles') {
                      setQuestionType('text');
                      setTextAnswer('');
                      setAltTextAnswers(['']);
                      setCorrectChoices(['']);
                      setWrongChoices(['']);
                      setOrderChoices(['']);
                      return;
                    }

                    if (picked?.kind === 'char') {
                      setQuestionType('text');
                      setTextAnswer('');
                      setAltTextAnswers(['']);
                      setCorrectChoices(['']);
                      setWrongChoices(['']);
                      setOrderChoices(['']);
                      return;
                    }
                  }}
                />

                {/* 類似チェックをしない */}
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-amber-400 scale-90"
                    checked={skipDuplicateCheck}
                    onChange={() => {
                      setSkipDuplicateCheck((v) => !v);
                      setConfirmMode(false);
                      setDuplicates([]);
                    }}
                  />
                  <span className="text-[11px] text-amber-200 font-semibold">
                    類似チェックなし
                  </span>
                </label>
              </div>
            </div>

            <select
              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
            >
              <option value="single">単一選択</option>
              <option value="multi">複数選択</option>
              <option value="text">記述</option>
              <option value="order">並び替え</option>
            </select>
          </div>

          {/* 問題文 */}
          <div className="space-y-1 text-sm">
            <label className="block font-semibold">
              問題 <span className="text-rose-400">必須</span>
            </label>
            <textarea
              className="w-full h-24 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          {/* 記述 */}
          {questionType === 'text' && (
            <>
              <div className="space-y-1 text-sm">
                <label className="block font-semibold">
                  正解 <span className="text-rose-400">必須</span>
                </label>
                <input
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="block font-semibold">別解（完全一致のみ）※任意</label>
                {altTextAnswers.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
                      value={v}
                      onChange={(e) =>
                        handleArrayChange(i, e.target.value, setAltTextAnswers)
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-xs bg-slate-700 rounded"
                      onClick={() => removeArrayRow(i, setAltTextAnswers)}
                    >
                      －
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded"
                  onClick={() => addArrayRow(setAltTextAnswers)}
                >
                  ＋ 追加
                </button>
              </div>
            </>
          )}

          {/* 単一 / 複数選択 */}
          {(questionType === 'single' || questionType === 'multi') && (
            <>
              <div className="space-y-1 text-sm">
                <label className="block font-semibold">
                  解答 <span className="text-rose-400">必須</span>
                </label>
                {correctChoices.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
                      value={v}
                      onChange={(e) =>
                        handleArrayChange(i, e.target.value, setCorrectChoices)
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-xs bg-slate-700 rounded"
                      onClick={() => removeArrayRow(i, setCorrectChoices)}
                    >
                      －
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded"
                  onClick={() => addArrayRow(setCorrectChoices)}
                >
                  ＋ 追加
                </button>
              </div>

              <div className="space-y-1 text-sm">
                <label className="block font-semibold">
                  不正解の選択肢{' '}
                  {questionType === 'single' ? (
                    <span className="text-rose-400">必須</span>
                  ) : (
                    <span className="text-slate-400 text-xs">（任意・0個でもOK）</span>
                  )}
                </label>
                {wrongChoices.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
                      value={v}
                      onChange={(e) =>
                        handleArrayChange(i, e.target.value, setWrongChoices)
                      }
                    />
                    <button
                      type="button"
                      className="px-2 text-xs bg-slate-700 rounded"
                      onClick={() => removeArrayRow(i, setWrongChoices)}
                    >
                      －
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded"
                  onClick={() => addArrayRow(setWrongChoices)}
                >
                  ＋ 追加
                </button>
              </div>
            </>
          )}

          {/* 並び替え */}
          {questionType === 'order' && (
            <div className="space-y-1 text-sm">
              <label className="block font-semibold">
                正しい順番 <span className="text-rose-400">必須</span>
              </label>
              <p className="text-xs text-slate-400 mb-1">
                上から順に 1番目 → 2番目 → … の順番で入力してください。
              </p>
              {orderChoices.map((v, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600 text-[16px]"
                    value={v}
                    onChange={(e) =>
                      handleArrayChange(i, e.target.value, setOrderChoices)
                    }
                  />
                  <button
                    type="button"
                    className="px-2 text-xs bg-slate-700 rounded"
                    onClick={() => removeArrayRow(i, setOrderChoices)}
                  >
                    －
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="mt-1 px-2 py-1 text-xs bg-slate-700 rounded"
                onClick={() => addArrayRow(setOrderChoices)}
              >
                ＋ 追加
              </button>
            </div>
          )}

          {/* タグ */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <label className="font-semibold">
                タグ <span className="text-rose-400">最低1つ以上</span>
              </label>
              <span className="text-xs text-slate-400">
                ストーリー → その他の順で並んでいます
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-1">
              {TAGS_STORY.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`px-2 py-1 rounded-full border text-xs ${
                    selectedTags.includes(tag)
                      ? 'bg-sky-600 border-sky-400 text-slate-50'
                      : 'bg-slate-900 border-slate-600 text-slate-100'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {TAGS_OTHER.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`px-2 py-1 rounded-full border text-xs ${
                    selectedTags.includes(tag)
                      ? 'bg-sky-600 border-sky-400 text-slate-50'
                      : 'bg-slate-900 border border-slate-600 text-slate-100'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* 類似問題一覧 */}
          {duplicates.length > 0 && (
            <div className="mt-2 text-xs bg-slate-900 border border-amber-500 rounded px-3 py-2 space-y-2">
              <div className="font-bold text-amber-400">類似問題があります</div>
              <p className="text-slate-200">
                下の類似問題を確認して、それでも投稿する場合はもう一度「この内容で投稿する」を押してください。
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {duplicates.map((q) => (
                  <div
                    key={`${q.source}-${q.id}`}
                    className="border border-slate-700 rounded-md p-2"
                  >
                    <div className="text-slate-400 mb-1">
                      ID: {q.id}（{q.source === 'questions' ? '本番' : '投稿中'} /{' '}
                      {q.status}）
                    </div>
                    <div className="text-slate-100 whitespace-pre-wrap">
                      {q.question_text || q.question || ''}
                    </div>
                    {q.options && q.options.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {q.options.map((o, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-amber-200">正解: {q.correct_answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* メッセージ */}
          {message && (
            <div className="mt-2 text-xs bg-slate-900 border border-slate-600 rounded px-3 py-2">
              {message}
            </div>
          )}

          {/* 送信ボタン（これ1個でOK） */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || checkingDup}
              className="w-full py-3 rounded bg-orange-500 text-black font-bold disabled:opacity-60"
            >
              {submitting || checkingDup
                ? '処理中…'
                : skipDuplicateCheck
                ? 'この内容で投稿する（高速）'
                : confirmMode
                ? '類似を確認した上で投稿する'
                : 'この内容で投稿する'}
            </button>

            {!skipDuplicateCheck && (
              <div className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                ※ 通常は投稿前に類似チェックを行うので少し時間がかかります。
                <br />
                高速にしたい場合は「問題タイプ右のチェック」をONにしてください。
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
