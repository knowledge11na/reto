// file: app/weak-training/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// 問題タイプ別の制限時間（ミリ秒）
const TIME_SINGLE = 30000; // 単一選択
const TIME_MULTI_ORDER = 40000; // 複数選択 / 並び替え
const TIME_TEXT = 60000; // 記述（15文字以内）
const TIME_TEXT_LONG = 80000; // 記述（16文字以上）

// 正解文字列をパース（JSON配列 or 区切り文字）
function parseCorrectValues(ans) {
  if (!ans) return [];
  try {
    const parsed = JSON.parse(ans);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {
    // 無視
  }
  return ans
    .split(/[、,／\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ゆるめ正規化（記述用）
function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '') // 全スペース削除
    .toLowerCase();
}

function calcTimeLimit(type, answer) {
  if (type === 'single') return TIME_SINGLE;
  if (type === 'multi' || type === 'ordering') return TIME_MULTI_ORDER;

  const len = (answer || '').length;
  if (len > 15) return TIME_TEXT_LONG;
  return TIME_TEXT;
}

export default function WeakTrainingPage() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready / question / result / finished
  const [timeLeft, setTimeLeft] = useState(0);

  const [selected, setSelected] = useState(null); // 単一
  const [multiSelected, setMultiSelected] = useState([]); // 複数
  const [orderSelected, setOrderSelected] = useState([]); // 並び替え
  const [textAnswer, setTextAnswer] = useState(''); // 記述

  const [judge, setJudge] = useState(null); // { isCorrect, correctAnswer }
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // 初回：間違えた問題一覧から問題を取得
  useEffect(() => {
    const fetchMistakes = async () => {
      try {
        const res = await fetch('/api/my-mistakes', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || '間違えた問題の取得に失敗しました。');
          setQuestions([]);
          return;
        }

        if (!data.ok) {
          setQuestions([]);
          return;
        }

        const normalized =
          (data.mistakes || []).map((row) => {
            // options_json を配列に
            let options = [];
            try {
              if (Array.isArray(row.options_json)) {
                options = row.options_json;
              } else if (typeof row.options_json === 'string') {
                const parsed = JSON.parse(row.options_json);
                if (Array.isArray(parsed)) options = parsed;
              }
            } catch {
              options = [];
            }

            return {
              id: row.id, // user_mistakes の id
              questionId: row.question_id,
              text: row.question || row.question_text || '',
              type: row.question_type || 'single',
              options,
              answer: row.correct_answer || '',
            };
          }) || [];

        setQuestions(normalized);
        setError('');
      } catch (e) {
        console.error(e);
        setError('間違えた問題の取得に失敗しました。');
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMistakes();
  }, []);

  const current = questions[index] || null;

  // ★ ここが修正ポイント：問題が取れたら自動で開始状態にする
  useEffect(() => {
    if (!loading && questions.length > 0 && phase === 'ready') {
      setPhase('question');
      setIndex(0);
      setCorrectCount(0);
      setTotalCount(0);
      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
    }
  }, [loading, questions, phase]);

  // タイマー制御
  useEffect(() => {
    if (!current || phase !== 'question') {
      setTimeLeft(0);
      return;
    }

    const limit = calcTimeLimit(current.type, current.answer);
    setTimeLeft(limit);

    const start = Date.now();
    const timerId = setInterval(() => {
      const elapsed = Date.now() - start;
      const remain = limit - elapsed;

      if (remain <= 0) {
        clearInterval(timerId);
        setTimeLeft(0);
        handleTimeout(limit);
      } else {
        setTimeLeft(remain);
      }
    }, 50);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, current]);

  const timeDisplay = useMemo(() => {
    if (phase !== 'question' || !current || timeLeft <= 0) return '---';
    return (timeLeft / 1000).toFixed(1);
  }, [phase, current, timeLeft]);

  const sendTrainResult = (isCorrect) => {
    if (!current || !current.questionId) return;
    fetch('/api/mistakes/train-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: current.questionId,
        correct: !!isCorrect,
      }),
    }).catch(() => {});
  };

  const goNext = () => {
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) {
      setPhase('finished');
    } else {
      setIndex(nextIndex);
      setPhase('question');
      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
    }
  };

  const finishQuestion = (isCorrect, correctText, usedMs) => {
    if (!current) return;
    if (phase !== 'question') return;

    setPhase('result');
    setJudge({
      isCorrect,
      correctAnswer: correctText,
    });

    setTotalCount((c) => c + 1);
    if (isCorrect) setCorrectCount((c) => c + 1);

    sendTrainResult(isCorrect);

    // 2秒後に次の問題へ
    setTimeout(() => {
      goNext();
    }, 2000);
  };

  const handleTimeout = (limit) => {
    if (!current || phase !== 'question') return;
    const correctText =
      parseCorrectValues(current.answer).join(' / ') ||
      current.answer ||
      '';
    finishQuestion(false, correctText, limit);
  };

  // ===== 各タイプの回答 =====

  const handleSelectSingle = (opt) => {
    if (!current || phase !== 'question') return;

    const limit = calcTimeLimit(current.type, current.answer);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(current.answer);
    let isCorrect = false;
    if (candidates.length === 0) {
      isCorrect = opt === (current.answer || '');
    } else {
      isCorrect = candidates.includes(opt);
    }

    setSelected(opt);

    const correctText = candidates.length
      ? candidates.join(' / ')
      : current.answer || '';

    finishQuestion(isCorrect, correctText, used);
  };

  const toggleMultiOption = (opt) => {
    if (phase !== 'question') return;
    setMultiSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const submitMulti = () => {
    if (!current || phase !== 'question') return;

    const limit = calcTimeLimit(current.type, current.answer);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(current.answer);
    const sel = multiSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      const setA = new Set(sel);
      const setB = new Set(candidates);
      isCorrect =
        [...setA].every((v) => setB.has(v)) &&
        [...setB].every((v) => setA.has(v));
    }

    const correctText = candidates.length
      ? candidates.join(' / ')
      : current.answer || '';

    finishQuestion(isCorrect, correctText, used);
  };

  const toggleOrderOption = (opt) => {
    if (phase !== 'question') return;
    setOrderSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const resetOrder = () => {
    setOrderSelected([]);
  };

  const submitOrder = () => {
    if (!current || phase !== 'question') return;

    const limit = calcTimeLimit(current.type, current.answer);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(current.answer);
    const sel = orderSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      isCorrect = candidates.every((v, i) => sel[i] === v);
    }

    const correctText = candidates.length
      ? candidates.join(' / ')
      : current.answer || '';

    finishQuestion(isCorrect, correctText, used);
  };

  const submitText = () => {
    if (!current || phase !== 'question') return;

    const limit = calcTimeLimit(current.type, current.answer);
    const used = Math.max(0, limit - timeLeft);

    const inputRaw = textAnswer;
    const inputNorm = normalizeText(inputRaw);

    const baseCandidates = parseCorrectValues(current.answer);
    const allCandidates =
      baseCandidates.length > 0 ? baseCandidates : [current.answer || ''];

    let isCorrect = false;
    if (inputNorm !== '') {
      const normalizedList = allCandidates
        .map((s) => normalizeText(s))
        .filter((v) => v.length > 0);
      isCorrect = normalizedList.includes(inputNorm);
    }

    const correctText = baseCandidates.length
      ? baseCandidates.join(' / ')
      : current.answer || '';

    finishQuestion(isCorrect, correctText, used);
  };

  // ======= レンダリング =======

  if (loading) {
    return (
      <main className="min-h-screen bg-sky-50 text-slate-900 flex items-center justify-center">
        <p className="text-sm">弱点克服モードを準備中です...</p>
      </main>
    );
  }

  if (!questions.length) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
        <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/logo-skull.png"
              alt="ナレバト"
              className="w-10 h-10 object-contain"
            />
            <h1 className="text-xl font-extrabold tracking-widest">
              弱点克服モード
            </h1>
          </div>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </header>

        <section className="w-full max-w-md px-4 pb-10 mt-4">
          {error && (
            <p className="text-xs text-rose-600 mb-2 whitespace-pre-line">
              {error}
            </p>
          )}
          <p className="text-sm text-slate-700">
            まだ間違えた問題が記録されていません。
            レート戦やチャレンジモードで間違えた問題がここに溜まります。
          </p>
        </section>
      </main>
    );
  }

  const limitMs = current ? calcTimeLimit(current.type, current.answer) : 0;
  const progress =
    limitMs > 0 ? Math.max(0, Math.min(1, timeLeft / limitMs)) : 0;

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo-skull.png"
            alt="ナレバト"
            className="w-10 h-10 object-contain"
          />
          <div>
            <h1 className="text-xl font-extrabold tracking-widest">
              弱点克服モード
            </h1>
            <p className="text-[11px] text-slate-500">
              間違えた問題だけで特訓しよう！
            </p>
          </div>
        </div>
        <Link
          href="/mypage"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
        >
          マイページへ戻る
        </Link>
      </header>

      <section className="w-full max-w-md px-4 pb-10 mt-4 space-y-3">
        {/* ステータス */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">進行状況</p>
            <p>
              {index + 1}問目 / {questions.length}問
            </p>
            <p>
              正解数: {correctCount} / {totalCount}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">残り時間</p>
            <p>{timeDisplay} 秒</p>
          </div>
        </div>

        {/* 本体 */}
        {phase !== 'finished' && current && (
          <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3">
            {/* タイマー */}
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>弱点克服中…</span>
              <span>残り時間: {timeDisplay} 秒</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            {/* 問題文 */}
            <p className="text-sm font-semibold whitespace-pre-wrap text-slate-900">
              {current.text}
            </p>

            {/* タイプ別 UI */}
            <div className="mt-2 space-y-2">
              {/* 単一選択 */}
              {current.type === 'single' &&
                current.options &&
                current.options.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {current.options.map((opt, i) => (
                      <button
                        key={i}
                        disabled={phase !== 'question'}
                        onClick={() => handleSelectSingle(opt)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                          phase === 'question'
                            ? 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                            : 'bg-slate-100 border-slate-200 text-slate-900'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

              {/* 複数選択 */}
              {current.type === 'multi' &&
                current.options &&
                current.options.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      {current.options.map((opt, i) => {
                        const isOn = multiSelected.includes(opt);
                        return (
                          <button
                            key={i}
                            disabled={phase !== 'question'}
                            onClick={() => toggleMultiOption(opt)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                              phase === 'question'
                                ? isOn
                                  ? 'bg-sky-500 text-white border-sky-500'
                                  : 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                                : 'bg-slate-100 border-slate-200 text-slate-900'
                            }`}
                          >
                            <span className="mr-2">
                              {isOn ? '☑' : '☐'}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {phase === 'question' && (
                      <button
                        onClick={submitMulti}
                        className="w-full mt-1 py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                      >
                        この選択で回答する
                      </button>
                    )}
                  </div>
                )}

              {/* 並び替え */}
              {current.type === 'ordering' &&
                current.options &&
                current.options.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      {current.options.map((opt, i) => {
                        const idx = orderSelected.indexOf(opt);
                        const selectedOrder = idx >= 0 ? idx + 1 : null;
                        return (
                          <button
                            key={i}
                            disabled={phase !== 'question'}
                            onClick={() => toggleOrderOption(opt)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                              phase === 'question'
                                ? selectedOrder
                                  ? 'bg-sky-500 text-white border-sky-500'
                                  : 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                                : 'bg-slate-100 border-slate-200 text-slate-900'
                            }`}
                          >
                            <span className="mr-2 text-xs">
                              {selectedOrder ? `${selectedOrder}.` : '・'}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {phase === 'question' && (
                      <div className="flex gap-2">
                        <button
                          onClick={resetOrder}
                          className="flex-1 py-2 rounded-full bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          リセット
                        </button>
                        <button
                          onClick={submitOrder}
                          className="flex-1 py-2 rounded-full bg-sky-500 text-white text-xs font-bold"
                        >
                          この順番で回答
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* 記述 */}
              {current.type === 'text' && (
                <div className="space-y-2">
                  <textarea
                    disabled={phase !== 'question'}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    rows={2}
                    placeholder="ここに答えを入力"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                  />
                  {phase === 'question' && (
                    <button
                      onClick={submitText}
                      className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                    >
                      この答えで回答する
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 判定 */}
            {judge && (
              <div className="mt-2 text-xs">
                <p
                  className={
                    judge.isCorrect
                      ? 'text-emerald-600 font-bold'
                      : 'text-red-600 font-bold'
                  }
                >
                  {judge.isCorrect ? '◯ 正解！' : '× 不正解'}
                </p>
                <p className="text-slate-700 mt-1">
                  正解:&nbsp;
                  <span className="font-semibold">
                    {judge.correctAnswer && judge.correctAnswer.trim() !== ''
                      ? judge.correctAnswer
                      : '（正解データなし）'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  2秒後に次の問題へ進みます…
                </p>
              </div>
            )}
          </div>
        )}

        {/* 終了画面 */}
        {phase === 'finished' && (
          <div className="bg-white rounded-2xl shadow p-4 text-center space-y-3">
            <p className="text-xs text-slate-500 mb-1">
              弱点克服モード 終了
            </p>
            <p className="text-2xl font-extrabold">おつかれさま！</p>
            <p className="text-sm text-slate-700">
              正解数 {correctCount} / {totalCount} 問
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <button
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                onClick={() => {
                  setIndex(0);
                  setPhase('question');
                  setCorrectCount(0);
                  setTotalCount(0);
                  setSelected(null);
                  setMultiSelected([]);
                  setOrderSelected([]);
                  setTextAnswer('');
                  setJudge(null);
                }}
              >
                もう一度 最初からやる
              </button>
              <Link
                href="/mistakes"
                className="px-4 py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold"
              >
                間違えた問題一覧に戻る
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-full bg-white border border-sky-500 text-sky-700 text-sm font-bold"
              >
                ホームへ戻る
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
