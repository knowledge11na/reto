// file: app/boss-battle/play/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// 問題タイプ別の制限時間（ミリ秒）
const TIME_SINGLE = 30000;
const TIME_MULTI_ORDER = 40000;
const TIME_TEXT = 60000;
const TIME_TEXT_LONG = 80000;

// 対象タグ（将来ここを変えるだけで対応）
const BOSS_TAG_LABEL = '東の海';

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

// 記述用ゆるふわ正規化
function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 表示用の正解テキスト
function getDisplayAnswer(q) {
  if (!q) return '';
  const list = parseCorrectValues(q.answer);
  if (list.length === 0) return q.answer || '';
  return list.join(' / ');
}

// 問題タイプ
function getQuestionType(q) {
  return q?.type || 'single';
}

export default function BossBattlePlayPage() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [phase, setPhase] = useState('loading'); // loading / question / finished
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [sessionCorrect, setSessionCorrect] = useState(0); // この挑戦での正解数
  const [usedTime, setUsedTime] = useState(0);

  const [selected, setSelected] = useState(null);
  const [multiSelected, setMultiSelected] = useState([]);
  const [orderSelected, setOrderSelected] = useState([]);
  const [textAnswer, setTextAnswer] = useState('');

  const [judge, setJudge] = useState(null); // { isCorrect, correctAnswer }
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const currentQuestion = questions[qIndex];
  const qType = getQuestionType(currentQuestion);

  // 自分情報
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // 問題取得（管理画面APIを再利用）
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const params = new URLSearchParams({
          status: 'approved',
          tag: BOSS_TAG_LABEL,
        });
        const res = await fetch(`/api/admin/questions?${params.toString()}`);
        const data = await res.json();

        const srcArray = Array.isArray(data.questions)
          ? data.questions
          : [];

        // フロント用に整形
        const normalized = srcArray.map((q, idx) => {
          const options = Array.isArray(q.options) ? q.options : [];

          const text = q.question || '';
          const answer = q.correct_answer ?? '';

          const altAnswers = Array.isArray(q.alt_answers)
            ? q.alt_answers
            : [];

          let type = 'single';
          const rawType = (q.question_type || '').toString().toLowerCase();

          if (!options || options.length === 0) {
            type = 'text';
          } else if (rawType === 'multi') {
            type = 'multi';
          } else if (rawType === 'text') {
            type = 'text';
          } else if (rawType === 'order') {
            type = 'ordering';
          } else {
            type = 'single';
          }

          return {
            id: q.id ?? idx,
            text,
            type,
            options,
            answer,
            altAnswers,
          };
        });

        // ランダムに 20問くらいに絞る
        const shuffled = [...normalized].sort(
          () => Math.random() - 0.5
        );
        const picked = shuffled.slice(0, 20);

        setQuestions(picked);
        setPhase(picked.length > 0 ? 'question' : 'finished');
        setQIndex(0);
      } catch (e) {
        console.error(e);
        setQuestions([]);
        setPhase('finished');
      }
    };

    fetchQuestions();
  }, []);

  const calcTimeLimit = (q) => {
    if (!q) return TIME_SINGLE;
    const t = getQuestionType(q);

    if (t === 'single') return TIME_SINGLE;
    if (t === 'multi' || t === 'ordering') return TIME_MULTI_ORDER;

    const len = (q.answer || '').length;
    if (len > 15) return TIME_TEXT_LONG;
    return TIME_TEXT;
  };

  // タイマー
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) {
      setTimeLeft(0);
      return;
    }

    const limit = calcTimeLimit(currentQuestion);
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
  }, [phase, qIndex, currentQuestion]);

  const handleTimeout = (limit) => {
    if (phase !== 'question' || !currentQuestion) return;

    setPhase('after-answer');
    setUsedTime((t) => t + limit);

    setJudge({
      isCorrect: false,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });
  };

  // ===== 回答処理（単一） =====
  const handleSelectSingle = (opt) => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);
    let isCorrect = false;
    if (candidates.length === 0) {
      isCorrect = opt === (currentQuestion.answer || '');
    } else {
      isCorrect = candidates.includes(opt);
    }

    setSelected(opt);
    setPhase('after-answer');
    setUsedTime((t) => t + used);

    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    if (isCorrect) {
      setSessionCorrect((c) => c + 1);
    }
  };

  // ===== 複数選択 =====
  const toggleMultiOption = (opt) => {
    if (phase !== 'question') return;
    setMultiSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const submitMulti = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);
    const sel = multiSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      const setA = new Set(sel);
      const setB = new Set(candidates);
      isCorrect =
        [...setA].every((v) => setB.has(v)) &&
        [...setB].every((v) => setA.has(v));
    }

    setPhase('after-answer');
    setUsedTime((t) => t + used);

    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    if (isCorrect) {
      setSessionCorrect((c) => c + 1);
    }
  };

  // ===== 並び替え =====
  const toggleOrderOption = (opt) => {
    if (phase !== 'question') return;
    setOrderSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const resetOrder = () => setOrderSelected([]);

  const submitOrder = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);
    const sel = orderSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      isCorrect = candidates.every((v, i) => sel[i] === v);
    }

    setPhase('after-answer');
    setUsedTime((t) => t + used);

    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    if (isCorrect) {
      setSessionCorrect((c) => c + 1);
    }
  };

  // ===== 記述 =====
  const submitText = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const inputRaw = textAnswer;
    const inputNorm = normalizeText(inputRaw);

    const baseCandidates = parseCorrectValues(currentQuestion.answer);
    const alt = Array.isArray(currentQuestion.altAnswers)
      ? currentQuestion.altAnswers
      : [];

    const allCandidates = [
      ...(baseCandidates.length > 0
        ? baseCandidates
        : [currentQuestion.answer || '']),
      ...alt,
    ];

    let isCorrect = false;
    if (inputNorm !== '') {
      const normalizedList = allCandidates
        .map((s) => normalizeText(s))
        .filter((v) => v.length > 0);
      isCorrect = normalizedList.includes(inputNorm);
    }

    setPhase('after-answer');
    setUsedTime((t) => t + used);

    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    if (isCorrect) {
      setSessionCorrect((c) => c + 1);
    }
  };

  // ===== 次の問題へ =====
  const goNextQuestion = () => {
    const nextIndex = qIndex + 1;
    if (nextIndex >= questions.length) {
      setPhase('finished');
    } else {
      setQIndex(nextIndex);
      setPhase('question');
      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
    }
  };

  // ===== サーバーに今回の正解数を送信 =====
  const submitSessionResult = async () => {
    if (submitted || submitting) {
      router.push('/boss-battle');
      return;
    }

    const correctCount = sessionCorrect;
    if (!me || !me.id || correctCount <= 0) {
      // ユーザー情報がない or 正解0 のときはそのまま戻る
      setSubmitted(true);
      router.push('/boss-battle');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/boss-battle/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: me.id || me.user_id || me.userId,
          correctCount,
        }),
      });

      await res.json().catch(() => ({}));
    } catch (e) {
      console.error('boss-battle submit error', e);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
      router.push('/boss-battle');
    }
  };

  // ===== 中断ボタン =====
  const handleAbort = () => {
    // 途中中断 → ここまでの sessionCorrect を加算してからボス画面へ
    submitSessionResult();
  };

  // ===== 全問終了ボタン =====
  const handleFinish = () => {
    submitSessionResult();
  };

  const timeDisplay = useMemo(() => {
    if (phase !== 'question' || !currentQuestion || timeLeft <= 0) {
      return '---';
    }
    return (timeLeft / 1000).toFixed(1);
  }, [phase, currentQuestion, timeLeft]);

  if (phase === 'loading') {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl px-6 py-4 text-center text-sm">
          ボスバトル用の問題を読み込み中…
        </div>
      </main>
    );
  }

  if (!currentQuestion && phase !== 'finished') {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl px-6 py-4 text-center text-sm">
          出題できる問題がありません。
          <br />
          ホームに戻ります。
          <div className="mt-3">
            <button
              className="px-4 py-2 rounded-full bg-amber-400 text-slate-950 text-xs font-bold"
              onClick={() => router.push('/boss-battle')}
            >
              ボスバトル画面へ戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  const totalQuestions = questions.length;
  const myTimeDisplay = (usedTime / 1000).toFixed(1);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* ヘッダー */}
      <header className="px-4 py-3 flex justify-between items-center bg-slate-900 border-b border-slate-800">
        <div className="text-xs">
          <p className="text-slate-400">ボスバトル</p>
          <p className="font-bold text-slate-50">
            対象タグ：「{BOSS_TAG_LABEL}」
          </p>
        </div>
        <div className="text-right text-xs text-slate-300">
          <p>
            プレイヤー:{' '}
            <span className="font-bold">
              {me?.display_name || me?.username || 'プレイヤー'}
            </span>
          </p>
          <p>今回の正解数: {sessionCorrect} 問</p>
        </div>
      </header>

      {/* メイン */}
      <section className="flex-1 flex flex-col gap-3 px-4 py-3">
        {/* ステータス */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-2">
            <p className="font-bold mb-1 text-slate-100">進捗</p>
            <p>
              問題: {qIndex + 1} / {totalQuestions}
            </p>
            <p>この挑戦での正解数: {sessionCorrect} 問</p>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-2">
            <p className="font-bold mb-1 text-slate-100">時間</p>
            <p>今回合計: {myTimeDisplay} 秒</p>
            <p>残り時間: {timeDisplay} 秒</p>
          </div>
        </div>

        {/* 問題 or 結果 */}
        {phase !== 'finished' && currentQuestion && (
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow p-4 flex flex-col gap-3">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>
                {qIndex + 1}問目 / {totalQuestions}問
              </span>
              <span>残り時間: {timeDisplay} 秒</span>
            </div>

            {/* 問題文 */}
            <p className="text-sm font-semibold whitespace-pre-wrap text-slate-50">
              {currentQuestion.text}
            </p>

            {/* 問題タイプごとのUI */}
            <div className="mt-2 space-y-2">
              {/* 単一選択 */}
              {qType === 'single' &&
                currentQuestion.options?.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      let style =
                        'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-50';

                      if (phase === 'question') {
                        if (selected === opt) {
                          style = 'bg-amber-400 text-slate-950 border-amber-300';
                        }
                      } else if (judge && phase === 'after-answer') {
                        const candidateList = parseCorrectValues(
                          currentQuestion.answer
                        );
                        const isCorrectOpt =
                          candidateList.length === 0
                            ? opt === (currentQuestion.answer || '')
                            : candidateList.includes(opt);

                        if (isCorrectOpt) {
                          style =
                            'bg-emerald-600 border-emerald-400 text-slate-50';
                        }
                        if (selected === opt && !judge.isCorrect) {
                          style =
                            'bg-rose-600 border-rose-400 text-slate-50';
                        }
                      }

                      return (
                        <button
                          key={i}
                          disabled={phase !== 'question'}
                          onClick={() => handleSelectSingle(opt)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

              {/* 複数選択 */}
              {qType === 'multi' &&
                currentQuestion.options?.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      {currentQuestion.options.map((opt, i) => {
                        const isOn = multiSelected.includes(opt);
                        let style =
                          'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-50';

                        if (phase === 'after-answer' && judge) {
                          const correctList = parseCorrectValues(
                            currentQuestion.answer
                          );
                          if (correctList.includes(opt)) {
                            style =
                              'bg-emerald-600 border-emerald-400 text-slate-50';
                          }
                          if (isOn && !judge.isCorrect) {
                            style =
                              'bg-rose-600 border-rose-400 text-slate-50';
                          }
                        } else if (isOn) {
                          style =
                            'bg-amber-400 text-slate-950 border-amber-300';
                        }

                        return (
                          <button
                            key={i}
                            disabled={phase !== 'question'}
                            onClick={() => toggleMultiOption(opt)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
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
                        className="w-full mt-1 py-2 rounded-full bg-amber-400 text-slate-950 text-sm font-bold"
                      >
                        この選択で回答する
                      </button>
                    )}
                  </div>
                )}

              {/* 並び替え */}
              {qType === 'ordering' &&
                currentQuestion.options?.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      {currentQuestion.options.map((opt, i) => {
                        const idx = orderSelected.indexOf(opt);
                        const selectedOrder = idx >= 0 ? idx + 1 : null;
                        let style =
                          'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-50';

                        if (phase === 'after-answer' && judge) {
                          const correctList = parseCorrectValues(
                            currentQuestion.answer
                          );
                          const correctIdx = correctList.indexOf(opt);
                          if (correctIdx >= 0) {
                            style =
                              'bg-emerald-600 border-emerald-400 text-slate-50';
                          }
                          if (idx >= 0 && !judge.isCorrect) {
                            style =
                              'bg-rose-600 border-rose-400 text-slate-50';
                          }
                        } else if (selectedOrder) {
                          style =
                            'bg-amber-400 text-slate-950 border-amber-300';
                        }

                        return (
                          <button
                            key={i}
                            disabled={phase !== 'question'}
                            onClick={() => toggleOrderOption(opt)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
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
                          className="flex-1 py-2 rounded-full bg-slate-700 text-slate-50 text-xs font-bold"
                        >
                          リセット
                        </button>
                        <button
                          onClick={submitOrder}
                          className="flex-1 py-2 rounded-full bg-amber-400 text-slate-950 text-xs font-bold"
                        >
                          この順番で回答
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* 記述 */}
              {qType === 'text' && (
                <div className="space-y-2">
                  <textarea
                    disabled={phase !== 'question'}
                    className="w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    rows={2}
                    placeholder="ここに答えを入力"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                  />
                  {phase === 'question' && (
                    <button
                      onClick={submitText}
                      className="w-full py-2 rounded-full bg-amber-400 text-slate-950 text-sm font-bold"
                    >
                      この答えで回答する
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 判定表示 */}
            {judge && (
              <div className="mt-2 text-xs">
                <p
                  className={
                    judge.isCorrect
                      ? 'text-emerald-400 font-bold'
                      : 'text-rose-400 font-bold'
                  }
                >
                  {judge.isCorrect ? '◯ 正解！' : '× 不正解'}
                </p>
                <p className="text-slate-300 mt-1">
                  正解:&nbsp;
                  <span className="font-semibold">
                    {judge.correctAnswer && judge.correctAnswer.trim() !== ''
                      ? judge.correctAnswer
                      : '（正解データなし）'}
                  </span>
                </p>
              </div>
            )}

            {/* 次へボタン＆中断ボタン */}
            {phase === 'after-answer' && (
              <div className="mt-3 flex flex-col gap-2 text-xs">
                <button
                  onClick={goNextQuestion}
                  className="w-full py-2 rounded-full bg-sky-500 text-white font-bold"
                >
                  次の問題へ
                </button>
              </div>
            )}
          </div>
        )}

        {/* 終了画面 */}
        {phase === 'finished' && (
          <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow p-4 mt-4 text-center space-y-3 text-sm">
            <p className="text-xs text-slate-400 mb-1">ボスバトル結果</p>
            <p className="text-2xl font-extrabold text-amber-300">
              おつかれさま！
            </p>
            <p className="text-slate-100">
              今回の正解数:{' '}
              <span className="font-bold text-emerald-300">
                {sessionCorrect} 問
              </span>
            </p>
            <p className="text-slate-300 text-xs">
              この正解数がボスへのダメージとして加算されます。
            </p>

            <button
              disabled={submitting}
              onClick={handleFinish}
              className="mt-2 px-4 py-2 rounded-full bg-amber-400 text-slate-950 text-sm font-bold disabled:opacity-70"
            >
              ボスバトル画面に戻る
            </button>
          </div>
        )}
      </section>

      {/* 下部：中断ボタン */}
      <footer className="px-4 py-3 border-t border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between text-[11px] text-slate-300">
          <span>
            途中でやめても、それまでの正解数はボスにちゃんと加算されます。
          </span>
          <button
            disabled={submitting}
            onClick={handleAbort}
            className="ml-2 px-3 py-1 rounded-full bg-slate-700 text-slate-100 font-bold disabled:opacity-70"
          >
            中断してボス画面へ
          </button>
        </div>
      </footer>
    </main>
  );
}
