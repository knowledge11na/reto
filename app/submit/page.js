// file: app/submit/page.js
'use client';

import { useState } from 'react';
import Link from 'next/link';

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
  return (arr || []).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ──────────────────────────────
// CSV 解析用ユーティリティ
// ──────────────────────────────

// テキスト全体を「クォート内の改行は維持しつつ」行に分割
function splitCsvLines(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
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
      if (current.trim() !== '') {
        lines.push(current);
      }
      current = '';
      // \r\n の場合に二重処理しない
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
    } else {
      current += ch;
    }
  }

  if (current.trim() !== '') {
    lines.push(current);
  }

  return lines;
}

// 1行を CSV セル配列に分割（カンマ区切り / " で囲まれた部分対応）
function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// 質問テキスト/選択肢から画像URL部分を除去
function stripImagePart(str) {
  if (!str) return '';
  const first = String(str).split('|')[0];
  return first.trim();
}

// CSV テキスト → 「サイト用の下書き質問」配列に変換
function parseImportedQuestions(csvText) {
  const lines = splitCsvLines(csvText || '');
  if (!lines.length) return [];

  let startIdx = 0;
  const header = lines[0].toLowerCase();
  if (header.includes('questionid') && header.includes('question')) {
    startIdx = 1; // ヘッダーを飛ばす
  }

  const imported = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const cells = parseCsvLine(line);
    if (cells.length < 7) {
      // 足りない分は空文字で埋める
      while (cells.length < 7) cells.push('');
    }

    const [
      questionId,
      questionRaw,
      answersRaw,
      wrongRaw,
      explanation,
      orderedRaw,
      generatedWrongChoicesRaw,
    ] = cells;

    const questionText = stripImagePart(questionRaw);
    if (!questionText) continue;

    const answersText = stripImagePart(answersRaw);
    const wrongText = stripImagePart(wrongRaw);

    const answersList = answersText
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const wrongList = wrongText
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    // ── 質問タイプ推定 ──
    let questionType = 'text';

    const lowerQ = questionText.toLowerCase();
    if (
      questionText.includes('並び替え') ||
      questionText.includes('並びかえ') ||
      questionText.includes('順番に並べ') ||
      questionText.includes('順に並べ')
    ) {
      questionType = 'order';
    } else if (wrongList.length > 0) {
      // 選択肢がある
      if (answersList.length > 1) {
        questionType = 'multi';
      } else {
        questionType = 'single';
      }
    } else {
      // 選択肢がない → 記述
      questionType = 'text';
    }

    // ── サイトのフォーム用にフィールドを組む ──
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
      item.textAnswer = answersText.trim();
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
  const [confirmMode, setConfirmMode] = useState(false); // 類似あり→確認中
  const [checkingDup, setCheckingDup] = useState(false);

  // 「前の条件を引き継ぐ」設定
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryConfig, setCarryConfig] = useState({
    keepQuestion: false, // 問題文
    keepQuestionType: false, // 問題タイプ
    keepAnswerContent: false, // 解答内容（枠 + 中身）
    keepAnswerBoxes: false, // 解答欄（枠数のみ）
    keepTags: false, // タグ
  });

  // CSV からの「問題ストック」
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importQueue, setImportQueue] = useState([]); // { questionType, question, ... }[]
  const [importIndex, setImportIndex] = useState(0);
  const [importInfo, setImportInfo] = useState('');

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

    // 今の枠数をメモ
    const altLen = altTextAnswers.length || 1;
    const correctLen = correctChoices.length || 1;
    const wrongLen = wrongChoices.length || 1;
    const orderLen = orderChoices.length || 1;

    // 問題文
    if (!carryConfig.keepQuestion) {
      setQuestion('');
    }

    // 問題タイプ
    if (!carryConfig.keepQuestionType) {
      setQuestionType('single');
    }

    // 解答内容・解答欄
    if (carryConfig.keepAnswerContent) {
      // 何もしない → 全部残す
    } else if (carryConfig.keepAnswerBoxes) {
      // 枠数だけキープして中身を空に
      setTextAnswer('');
      setAltTextAnswers(Array(altLen).fill(''));
      setCorrectChoices(Array(correctLen).fill(''));
      setWrongChoices(Array(wrongLen).fill(''));
      setOrderChoices(Array(orderLen).fill(''));
    } else {
      // 完全リセット
      setTextAnswer('');
      setAltTextAnswers(['']);
      setCorrectChoices(['']);
      setWrongChoices(['']);
      setOrderChoices(['']);
    }

    // タグ
    if (!carryConfig.keepTags) {
      setSelectedTags([]);
    }
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

    // タグは CSV にないので、今の値をそのまま残しておく
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

      setCheckingDup(false);

      if (!res.ok) {
        setMessage(
          '類似問題チェックに失敗しました。もう一度試すか、そのまま投稿してください。'
        );
        return null;
      }

      const data = await res.json();
      return data.duplicates || [];
    } catch (e) {
      console.error(e);
      setCheckingDup(false);
      setMessage(
        '類似問題チェックでエラーが出ました。もう一度試すか、そのまま投稿してください。'
      );
      return null;
    }
  };

  // ──────────────────────────────
  // フォーム送信
  // ──────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || checkingDup) return;

    setMessage('');
    setDuplicates([]);

    const qText = question.trim();
    if (!qText) {
      setMessage('問題文を入力してください。');
      return;
    }
    if (selectedTags.length === 0) {
      setMessage('タグを最低1つ選んでください。');
      return;
    }

    let options = [];
    let answer = '';
    let altAnswers = [];

    if (questionType === 'text') {
      const mainAns = textAnswer.trim();
      if (!mainAns) {
        setMessage('正解を入力してください。');
        return;
      }
      const alts = cleanArray(altTextAnswers);
      options = [];
      answer = mainAns;
      altAnswers = alts;
    } else if (questionType === 'single') {
      const correct = cleanArray(correctChoices);
      const wrong = cleanArray(wrongChoices);

      if (correct.length !== 1) {
        setMessage('単一選択は「解答」をちょうど1つにしてください。');
        return;
      }
      if (wrong.length === 0) {
        setMessage('不正解の選択肢を1つ以上入力してください。');
        return;
      }

      options = [...correct, ...wrong];
      answer = correct[0];
      altAnswers = [];
    } else if (questionType === 'multi') {
      const correct = cleanArray(correctChoices);
      const wrong = cleanArray(wrongChoices);

      if (correct.length < 1) {
        setMessage('複数選択は「解答」を1つ以上入力してください。');
        return;
      }

      options = [...correct, ...wrong];
      answer = JSON.stringify(correct); // 正解配列を文字列で保存
      altAnswers = [];
    } else if (questionType === 'order') {
      const order = cleanArray(orderChoices);
      if (order.length < 2) {
        setMessage('並び替えは2つ以上の項目を入力してください。');
        return;
      }
      options = order;
      answer = JSON.stringify(order); // 正しい順番
      altAnswers = [];
    } else {
      setMessage('不明な問題タイプです。');
      return;
    }

    const payload = {
      type: questionType,
      question: qText,
      options,
      answer,
      altAnswers,
      tags: selectedTags,
    };

    // まだ確認モードでないときは、まず類似チェックだけ行う
    if (!confirmMode) {
      const dups = await runDuplicateCheck(payload);

      // null…エラー時 → そのまま投稿させる
      if (dups && dups.length > 0) {
        setDuplicates(dups);
        setConfirmMode(true);
        setMessage(
          '類似問題があります。下の一覧を確認して、それでも投稿する場合はもう一度「この内容で投稿する」を押してください。'
        );
        return;
      }
      // 類似なし → そのまま投稿に進む
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/submit-question', {
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

      // フォームのリセット（引き継ぎ設定を考慮）
      resetForm();

      // ストックがあれば次の問題を自動でフォームに載せる
      if (importQueue.length > 0 && importIndex < importQueue.length) {
        const nextItem = importQueue[importIndex];
        applyImportedQuestion(nextItem);
        setImportIndex(importIndex + 1);
        setImportInfo(
          `読み込み済み: ${importIndex + 1} / ${importQueue.length} 問`
        );
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
    const list = parseImportedQuestions(importText || '');
    if (!list.length) {
      setImportInfo('読み込める問題がありませんでした。');
      return;
    }

    setImportQueue((prev) => {
      const next = [...prev, ...list];
      setImportInfo(
        `${list.length}問をストックに追加しました。（ストック合計 ${next.length}問）`
      );
      // まだ 1問も使っていない場合は index=0 のまま
      return next;
    });
  };

  const handleImportNext = () => {
    if (importQueue.length === 0) {
      setImportInfo('ストックが空です。CSVを貼り付けて「ストックに追加」を押してください。');
      return;
    }
    if (importIndex >= importQueue.length) {
      setImportInfo('ストックの問題は全てフォームに流し込みました。');
      return;
    }
    const item = importQueue[importIndex];
    applyImportedQuestion(item);
    setImportIndex(importIndex + 1);
    setImportInfo(
      `読み込み済み: ${importIndex + 1} / ${importQueue.length} 問`
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* ヘッダー：タイトル + ボタン群 */}
        <header className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">問題を投稿する</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className="border border-emerald-400 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-emerald-100 shadow-sm"
            >
              問題読み込み
            </button>
            <button
              type="button"
              onClick={() => setCarryOpen((v) => !v)}
              className="border border-sky-400 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-sky-100 shadow-sm"
            >
              前の条件を引き継ぐ
            </button>
            <Link
              href="/"
              className="border border-sky-400 px-3 py-1 rounded-full text-xs font-bold text-sky-200 bg-slate-900"
            >
              ホームへ
            </Link>
          </div>
        </header>

        {/* CSV 読み込みパネル */}
        {importOpen && (
          <div className="mb-2 text-xs bg-slate-900 border border-emerald-500 rounded-2xl px-3 py-3 space-y-2">
            <div className="font-semibold text-emerald-200 mb-1">
              CSV から問題を読み込む
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-1">
              スマホアプリからエクスポートした
              <span className="text-emerald-300 font-semibold">
                「questionId,question,answers,...」
              </span>
              形式の CSV テキストをそのまま貼り付けてください。
              画像用の URL（
              <span className="text-slate-300">http〜</span>
              ）は自動で無視されます。
            </p>
            <textarea
              className="w-full h-32 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono leading-snug"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="ここに CSV テキストを貼り付け..."
            />
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={handleImportAdd}
                className="px-3 py-1 rounded-full bg-emerald-500 text-black font-bold text-xs"
              >
                ストックに追加
              </button>
              <button
                type="button"
                onClick={handleImportNext}
                className="px-3 py-1 rounded-full bg-emerald-700 text-slate-50 font-bold text-xs"
              >
                次の読み込み問題をフォームにセット
              </button>
              <span className="text-[11px] text-slate-400 mt-1">
                ストック: {importQueue.length} 問 / 次のインデックス:{' '}
                {importIndex + 1}
              </span>
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
            <div className="font-semibold text-sky-200">
              投稿後に引き継ぐ項目
            </div>
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
              ・
              <span className="font-semibold text-sky-200">解答内容</span>
              ：記述／単一／複数／並び替えの「回答欄の枠の数」と「入力した内容」がそのまま残ります。
              {'\n'}・
              <span className="font-semibold text-sky-200">解答欄</span>
              ：「枠の数」だけ残し、中身は空にリセットされます。
            </p>
          </div>
        )}

        {/* 本体フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 種別 */}
          <div className="space-y-1 text-sm">
            <label className="block font-semibold">問題タイプ</label>
            <select
              className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
              className="w-full h-24 px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
                  className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-600"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                />
              </div>

              <div className="space-y-1 text-sm">
                <label className="block font-semibold">
                  別解（完全一致のみ）※任意
                </label>
                {altTextAnswers.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
                    <span className="text-slate-400 text-xs">
                      （任意・0個でもOK）
                    </span>
                  )}
                </label>
                {wrongChoices.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input
                      className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
                    className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-600"
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
                      : 'bg-slate-900 border-slate-600 text-slate-100'
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
                      ID: {q.id}（
                      {q.source === 'questions' ? '本番' : '投稿中'} / {q.status}
                      ）
                    </div>
                    <div className="text-slate-100 whitespace-pre-wrap">
                      {q.question}
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
                    <div className="mt-1 text-amber-200">
                      正解: {q.correct_answer}
                    </div>
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

          {/* 送信ボタン */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || checkingDup}
              className="w-full py-3 rounded bg-orange-500 text-black font-bold disabled:opacity-60"
            >
              {submitting || checkingDup
                ? '処理中…'
                : confirmMode
                ? '類似を確認した上で投稿する'
                : 'この内容で投稿する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
