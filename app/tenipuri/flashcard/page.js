// file: app/tenipuri/flashcard/page.js

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

const PROGRESS_KEY = 'tenipuri_flashcard_progress';

const QUESTION_COUNTS = [
  { label: '10問', value: 10 },
  { label: '20問', value: 20 },
  { label: '50問', value: 50 },
  { label: '全問', value: 'all' },
];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function getAnswer(problem) {
  if (!problem) return '';

  switch (problem.answer_type) {
    case 'hitter':
      return problem.hitter ?? '';

    case 'target':
      return problem.target ?? '';

    case 'technique':
      return problem.technique ?? '';

    default:
      return (
        problem.hitter ??
        problem.target ??
        problem.technique ??
        ''
      );
  }
}

function getQuestionText(problem) {
  if (!problem) return '';

  switch (problem.answer_type) {
    case 'hitter':
      return 'この打球を放ったのは誰？';

    case 'target':
      return 'この打球を受けたのは誰？';

    case 'technique':
      return 'この技の名前は？';

    default:
      return 'この問題の答えは？';
  }
}

function getProblemId(problem) {
  return problem?.id != null ? String(problem.id) : '';
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

function getSavedProgress() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(PROGRESS_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify(progress)
    );
  } catch {
    // localStorage失敗でゲームを止めない
  }
}

function clearProgress() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // 無視
  }
}

export default function FlashcardPage() {
  const [problems, setProblems] = useState([]);
  const [currentProblems, setCurrentProblems] = useState([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAnswer, setShowAnswer] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(true);

  const [questionCount, setQuestionCount] =
    useState(10);

  const [randomMode, setRandomMode] =
    useState(true);

  const [resumeAvailable, setResumeAvailable] =
    useState(false);

  const [imageCache, setImageCache] =
    useState({});

  /**
   * ========================================================
   * 問題ごとの判定
   *
   * remembered:
   *   true  = 分かった
   *   false = 分からない
   *   null  = まだ判定していない
   * ========================================================
   */
  const [problemResults, setProblemResults] =
    useState({});

  const imageLoadingRef = useRef(
    new Set()
  );

  /**
   * ========================================================
   * 問題一覧取得
   *
   * 画像は取得しない
   * ========================================================
   */
  useEffect(() => {
    let cancelled = false;

    async function loadProblems() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          '/api/tenipuri/problems',
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          !data?.success &&
          !data?.ok
        ) {
          throw new Error(
            data?.error ||
              '問題の取得に失敗しました'
          );
        }

        const loaded =
          Array.isArray(data.problems)
            ? data.problems
            : [];

        if (!cancelled) {
          setProblems(loaded);

          const progress =
            getSavedProgress();

          if (
            progress &&
            Array.isArray(
              progress.problemIds
            ) &&
            progress.problemIds.length > 0
          ) {
            const progressIndex =
              Number(
                progress.currentIndex
              );

            if (
              Number.isFinite(
                progressIndex
              ) &&
              progressIndex <
                progress.problemIds.length
            ) {
              setResumeAvailable(true);
            }
          }
        }
      } catch (err) {
        console.error(
          '[flashcard] load error',
          err
        );

        if (!cancelled) {
          setError(
            err?.message ||
              '問題の取得に失敗しました'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProblems();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * ========================================================
   * 画像取得
   *
   * 必要な問題だけ取得
   * ========================================================
   */
  const loadProblemImage = useCallback(
    async (problemId) => {
      const id = String(problemId ?? '');

      if (!id) {
        return null;
      }

      if (imageCache[id]) {
        return imageCache[id];
      }

      if (
        imageLoadingRef.current.has(id)
      ) {
        return null;
      }

      imageLoadingRef.current.add(id);

      try {
        const response = await fetch(
          `/api/tenipuri/problems?id=${encodeURIComponent(
            id
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (
          !data?.success &&
          !data?.ok
        ) {
          throw new Error(
            data?.error ||
              '問題画像の取得に失敗しました'
          );
        }

        const problem =
          data?.problem;

        if (!problem) {
          return null;
        }

        const imageUrl =
          problem.image_url || null;

        const explanationImageUrl =
          problem.explanation_image_url ||
          null;

        const result = {
          imageUrl,
          explanationImageUrl,
        };

        setImageCache((prev) => ({
          ...prev,
          [id]: result,
        }));

        return result;
      } catch (err) {
        console.error(
          '[flashcard] image load error',
          {
            problemId: id,
            error: err,
          }
        );

        return null;
      } finally {
        imageLoadingRef.current.delete(id);
      }
    },
    [imageCache]
  );

  /**
   * ========================================================
   * 現在＋次の画像を先読み
   * ========================================================
   */
  useEffect(() => {
    if (!currentProblems.length) {
      return;
    }

    const current =
      currentProblems[currentIndex];

    const next =
      currentProblems[currentIndex + 1];

    if (current?.id) {
      loadProblemImage(current.id);
    }

    if (next?.id) {
      loadProblemImage(next.id);
    }
  }, [
    currentProblems,
    currentIndex,
    loadProblemImage,
  ]);

  /**
   * ========================================================
   * 現在の問題ID
   * ========================================================
   */
  const currentProblem =
    currentProblems[currentIndex] ||
    null;

  const currentProblemId =
    getProblemId(currentProblem);

  const currentImage =
    currentProblemId
      ? imageCache[currentProblemId]
      : null;

  /**
   * ========================================================
   * 現在問題の判定
   * ========================================================
   */
  const currentResult =
    currentProblemId
      ? problemResults[
          currentProblemId
        ]
      : null;

  /**
   * ========================================================
   * 保存
   *
   * 判定状況も一緒に保存する
   * ========================================================
   */
  const saveCurrentProgress =
    useCallback(
      ({
        problemList = currentProblems,
        index = currentIndex,
        answerShown = showAnswer,
        results = problemResults,
      } = {}) => {
        if (!problemList.length) {
          return;
        }

        saveProgress({
          problemIds:
            problemList.map(
              getProblemId
            ),
          currentIndex: index,
          showAnswer: answerShown,
          results,
          questionCount,
          randomMode,
          updatedAt: Date.now(),
        });
      },
      [
        currentProblems,
        currentIndex,
        showAnswer,
        problemResults,
        questionCount,
        randomMode,
      ]
    );

  /**
   * ========================================================
   * 新規ゲーム
   * ========================================================
   */
  const startGame = useCallback(() => {
    if (!problems.length) {
      return;
    }

    let selected;

    if (randomMode) {
      selected = shuffle(problems);
    } else {
      selected = [...problems];
    }

    if (questionCount !== 'all') {
      selected = selected.slice(
        0,
        Math.min(
          Number(questionCount),
          selected.length
        )
      );
    }

    if (!selected.length) {
      return;
    }

    setCurrentProblems(selected);
    setCurrentIndex(0);
    setShowAnswer(false);
    setSettingsOpen(false);
    setResumeAvailable(false);

    /**
     * 新しいゲームなので全問題を未判定に戻す
     */
    setProblemResults({});

    saveProgress({
      problemIds: selected.map(
        getProblemId
      ),
      currentIndex: 0,
      showAnswer: false,
      results: {},
      questionCount,
      randomMode,
      updatedAt: Date.now(),
    });
  }, [
    problems,
    questionCount,
    randomMode,
  ]);

  /**
   * ========================================================
   * 続きから
   * ========================================================
   */
  const resumeGame = useCallback(() => {
    const progress =
      getSavedProgress();

    if (
      !progress ||
      !Array.isArray(
        progress.problemIds
      )
    ) {
      return;
    }

    const map = new Map(
      problems.map((problem) => [
        getProblemId(problem),
        problem,
      ])
    );

    const restored =
      progress.problemIds
        .map((id) =>
          map.get(String(id))
        )
        .filter(Boolean);

    if (!restored.length) {
      setResumeAvailable(false);
      return;
    }

    let index = Number(
      progress.currentIndex
    );

    if (!Number.isFinite(index)) {
      index = 0;
    }

    index = Math.max(
      0,
      Math.min(
        index,
        restored.length - 1
      )
    );

    /**
     * 保存されていた判定結果を復元
     */
    const savedResults =
      progress.results &&
      typeof progress.results ===
        'object'
        ? progress.results
        : {};

    /**
     * 現在の問題一覧に存在するIDだけ残す
     */
    const restoredResults = {};

    for (const problem of restored) {
      const id =
        getProblemId(problem);

      if (
        Object.prototype.hasOwnProperty.call(
          savedResults,
          id
        )
      ) {
        restoredResults[id] =
          savedResults[id];
      }
    }

    setCurrentProblems(restored);
    setCurrentIndex(index);
    setShowAnswer(
      Boolean(progress.showAnswer)
    );
    setProblemResults(
      restoredResults
    );
    setSettingsOpen(false);
    setResumeAvailable(false);

    /**
     * questionCount / randomMode も復元
     */
    if (
      progress.questionCount ===
        'all' ||
      typeof progress.questionCount ===
        'number'
    ) {
      setQuestionCount(
        progress.questionCount
      );
    }

    if (
      typeof progress.randomMode ===
      'boolean'
    ) {
      setRandomMode(
        progress.randomMode
      );
    }
  }, [problems]);

  /**
   * ========================================================
   * 判定
   *
   * 分かった / 分からない
   * ========================================================
   */
  const markProblem = useCallback(
    (remembered) => {
      if (!currentProblemId) {
        return;
      }

      const nextResults = {
        ...problemResults,
        [currentProblemId]:
          remembered,
      };

      setProblemResults(
        nextResults
      );

      /**
       * 判定した瞬間に自動保存
       */
      saveProgress({
        problemIds:
          currentProblems.map(
            getProblemId
          ),
        currentIndex,
        showAnswer: true,
        results: nextResults,
        questionCount,
        randomMode,
        updatedAt: Date.now(),
      });

      setShowAnswer(true);
    },
    [
      currentProblemId,
      problemResults,
      currentProblems,
      currentIndex,
      questionCount,
      randomMode,
    ]
  );

  /**
   * ========================================================
   * 次へ
   * ========================================================
   */
  const nextQuestion = useCallback(() => {
    if (!currentProblems.length) {
      return;
    }

    const nextIndex =
      currentIndex + 1;

    if (
      nextIndex >=
      currentProblems.length
    ) {
      /**
       * 最後まで到達
       */
      saveProgress({
        problemIds:
          currentProblems.map(
            getProblemId
          ),
        currentIndex:
          currentProblems.length,
        showAnswer: false,
        results: problemResults,
        questionCount,
        randomMode,
        updatedAt: Date.now(),
      });

      setCurrentIndex(
        currentProblems.length
      );
      setShowAnswer(false);

      return;
    }

    setCurrentIndex(nextIndex);
    setShowAnswer(false);

    saveProgress({
      problemIds:
        currentProblems.map(
          getProblemId
        ),
      currentIndex: nextIndex,
      showAnswer: false,
      results: problemResults,
      questionCount,
      randomMode,
      updatedAt: Date.now(),
    });
  }, [
    currentProblems,
    currentIndex,
    problemResults,
    questionCount,
    randomMode,
  ]);

  /**
   * ========================================================
   * 前へ
   * ========================================================
   */
  const previousQuestion =
    useCallback(() => {
      if (currentIndex <= 0) {
        return;
      }

      const nextIndex =
        currentIndex - 1;

      setCurrentIndex(nextIndex);
      setShowAnswer(false);

      saveProgress({
        problemIds:
          currentProblems.map(
            getProblemId
          ),
        currentIndex: nextIndex,
        showAnswer: false,
        results: problemResults,
        questionCount,
        randomMode,
        updatedAt: Date.now(),
      });
    }, [
      currentProblems,
      currentIndex,
      problemResults,
      questionCount,
      randomMode,
    ]);

  /**
   * ========================================================
   * 中断
   * ========================================================
   */
  const pauseGame = useCallback(() => {
    if (!currentProblems.length) {
      return;
    }

    saveProgress({
      problemIds:
        currentProblems.map(
          getProblemId
        ),
      currentIndex,
      showAnswer,
      results: problemResults,
      questionCount,
      randomMode,
      updatedAt: Date.now(),
    });

    setSettingsOpen(true);
    setResumeAvailable(true);
  }, [
    currentProblems,
    currentIndex,
    showAnswer,
    problemResults,
    questionCount,
    randomMode,
  ]);

  /**
   * ========================================================
   * 間違えた問題だけもう一度
   *
   * 「分からない」にした問題だけを抽出
   * ========================================================
   */
  const retryWrongProblems = useCallback(() => {
    const wrongProblems =
      currentProblems.filter(
        (problem) =>
          problemResults[
            getProblemId(problem)
          ] === false
      );

    if (!wrongProblems.length) {
      return;
    }

    /**
     * 間違えた問題だけで新しいセットを作る
     */
    const selected = randomMode
      ? shuffle(wrongProblems)
      : [...wrongProblems];

    setCurrentProblems(selected);
    setCurrentIndex(0);
    setShowAnswer(false);
    setSettingsOpen(false);
    setResumeAvailable(false);

    /**
     * 再挑戦する問題は再び未判定
     *
     * ただし、元の問題以外の判定は残す。
     */
    const nextResults = {
      ...problemResults,
    };

    for (const problem of selected) {
      delete nextResults[
        getProblemId(problem)
      ];
    }

    setProblemResults(nextResults);

    saveProgress({
      problemIds:
        selected.map(
          getProblemId
        ),
      currentIndex: 0,
      showAnswer: false,
      results: nextResults,
      questionCount:
        selected.length,
      randomMode,
      updatedAt: Date.now(),
    });
  }, [
    currentProblems,
    problemResults,
    randomMode,
  ]);

  /**
   * ========================================================
   * 判定済み数
   * ========================================================
   */
  const resultSummary = useMemo(() => {
    let remembered = 0;
    let notRemembered = 0;
    let unanswered = 0;

    for (const problem of currentProblems) {
      const id =
        getProblemId(problem);

      if (
        problemResults[id] === true
      ) {
        remembered++;
      } else if (
        problemResults[id] === false
      ) {
        notRemembered++;
      } else {
        unanswered++;
      }
    }

    return {
      remembered,
      notRemembered,
      unanswered,
    };
  }, [
    currentProblems,
    problemResults,
  ]);

  /**
   * ========================================================
   * キーボード
   * ========================================================
   */
  useEffect(() => {
    function handleKeyDown(event) {
      if (settingsOpen) {
        return;
      }

      if (
        event.target instanceof
          HTMLInputElement ||
        event.target instanceof
          HTMLTextAreaElement
      ) {
        return;
      }

      if (
        event.key === ' ' ||
        event.key === 'Enter'
      ) {
        event.preventDefault();

        if (!showAnswer) {
          setShowAnswer(true);

          saveProgress({
            problemIds:
              currentProblems.map(
                getProblemId
              ),
            currentIndex,
            showAnswer: true,
            results: problemResults,
            questionCount,
            randomMode,
            updatedAt: Date.now(),
          });
        } else {
          nextQuestion();
        }
      }

      if (
        event.key === 'ArrowRight'
      ) {
        nextQuestion();
      }

      if (
        event.key === 'ArrowLeft'
      ) {
        previousQuestion();
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    settingsOpen,
    showAnswer,
    currentProblems,
    currentIndex,
    problemResults,
    questionCount,
    randomMode,
    nextQuestion,
    previousQuestion,
  ]);

  /**
   * ========================================================
   * ローディング
   * ========================================================
   */
  if (loading) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="mx-auto max-w-md px-4 py-8 text-center">
          <p className="text-lg font-bold">
            問題を読み込んでいます…
          </p>

          <p className="mt-2 text-sm text-sky-700">
            画像は必要なときだけ取得します
          </p>
        </div>
      </main>
    );
  }

  /**
   * ========================================================
   * エラー
   * ========================================================
   */
  if (error) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="mx-auto max-w-md px-4 py-8">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-xl font-bold text-red-600">
              問題の取得に失敗しました
            </h1>

            <p className="mt-3 break-words text-sm">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 font-bold text-white"
            >
              再読み込み
            </button>

            <Link
              href="/tenipuri"
              className="mt-3 block text-center text-sm font-bold text-sky-700"
            >
              戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /**
   * ========================================================
   * 設定画面
   * ========================================================
   */
  if (settingsOpen) {
    const wrongCount =
      currentProblems.filter(
        (problem) =>
          problemResults[
            getProblemId(problem)
          ] === false
      ).length;

    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="mx-auto max-w-md px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <Link
              href="/tenipuri"
              className="text-sm font-bold text-sky-700"
            >
              ← 戻る
            </Link>

            <h1 className="text-xl font-black">
              打球単語帳
            </h1>

            <div className="w-10" />
          </header>

          {/* 続きから */}
          {resumeAvailable && (
            <div className="mb-4 rounded-2xl bg-emerald-50 p-4 shadow">
              <p className="text-sm font-bold text-emerald-800">
                前回の途中データがあります
              </p>

              <button
                type="button"
                onClick={resumeGame}
                className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-4 text-lg font-black text-white"
              >
                ▶ 続きから
              </button>
            </div>
          )}

          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-slate-600">
              問題数
            </p>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {QUESTION_COUNTS.map(
                (item) => (
                  <button
                    key={String(
                      item.value
                    )}
                    type="button"
                    onClick={() =>
                      setQuestionCount(
                        item.value
                      )
                    }
                    className={`rounded-xl px-2 py-3 text-sm font-bold ${
                      questionCount ===
                      item.value
                        ? 'bg-sky-600 text-white'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>

            <div className="mt-6">
              <p className="text-sm text-slate-600">
                出題順
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRandomMode(true)
                  }
                  className={`rounded-xl px-3 py-3 font-bold ${
                    randomMode
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  ランダム
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRandomMode(false)
                  }
                  className={`rounded-xl px-3 py-3 font-bold ${
                    !randomMode
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  登録順
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={startGame}
              disabled={!problems.length}
              className="mt-7 w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-black text-white disabled:opacity-40"
            >
              スタート
            </button>

            {/* 前回の問題で間違えたもの */}
            {wrongCount > 0 && (
              <button
                type="button"
                onClick={
                  retryWrongProblems
                }
                className="mt-3 w-full rounded-xl bg-rose-500 px-4 py-4 text-lg font-black text-white"
              >
                ❌ 間違えた問題だけもう一度
                <span className="ml-2 text-sm">
                  ({wrongCount}問)
                </span>
              </button>
            )}

            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">
                全 {problems.length} 問
              </p>

              {currentProblems.length >
                0 && (
                <div className="mt-2 flex justify-center gap-4 text-xs font-bold">
                  <span className="text-emerald-600">
                    ○ 分かった{' '}
                    {
                      resultSummary.remembered
                    }
                  </span>

                  <span className="text-rose-600">
                    × 分からない{' '}
                    {
                      resultSummary.notRemembered
                    }
                  </span>

                  <span className="text-slate-500">
                    未判定{' '}
                    {
                      resultSummary.unanswered
                    }
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /**
   * ========================================================
   * ゲーム終了
   * ========================================================
   */
  const isFinished =
    currentProblems.length > 0 &&
    currentIndex >=
      currentProblems.length;

  if (isFinished) {
    const wrongCount =
      currentProblems.filter(
        (problem) =>
          problemResults[
            getProblemId(problem)
          ] === false
      ).length;

    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="mx-auto max-w-md px-4 py-8">
          <div className="rounded-2xl bg-white p-6 text-center shadow">
            <h1 className="text-2xl font-black">
              終了！
            </h1>

            <p className="mt-3 text-slate-600">
              {currentProblems.length}問
              終了しました。
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-bold text-emerald-700">
                  分かった
                </p>

                <p className="mt-1 text-2xl font-black text-emerald-700">
                  {
                    resultSummary.remembered
                  }
                </p>
              </div>

              <div className="rounded-xl bg-rose-50 p-3">
                <p className="text-xs font-bold text-rose-700">
                  分からない
                </p>

                <p className="mt-1 text-2xl font-black text-rose-700">
                  {
                    resultSummary.notRemembered
                  }
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">
                  未判定
                </p>

                <p className="mt-1 text-2xl font-black text-slate-500">
                  {
                    resultSummary.unanswered
                  }
                </p>
              </div>
            </div>

            {wrongCount > 0 && (
              <button
                type="button"
                onClick={
                  retryWrongProblems
                }
                className="mt-6 w-full rounded-xl bg-rose-500 px-4 py-4 font-black text-white"
              >
                ❌ 間違えた問題だけもう一度
                <span className="ml-2">
                  ({wrongCount}問)
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                clearProgress();

                setSettingsOpen(true);
                setCurrentProblems([]);
                setCurrentIndex(0);
                setShowAnswer(false);
                setProblemResults({});
                setResumeAvailable(false);
              }}
              className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-4 font-black text-white"
            >
              もう一度
            </button>

            <Link
              href="/tenipuri"
              className="mt-3 block rounded-xl bg-slate-100 px-4 py-4 font-bold"
            >
              テニプリメニューへ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /**
   * ========================================================
   * プレイ画面
   * ========================================================
   */
  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="mx-auto max-w-md px-4 py-4">
        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={pauseGame}
            className="text-sm font-bold text-sky-700"
          >
            ← 中断
          </button>

          <div className="text-sm font-black">
            {currentIndex + 1} /{' '}
            {currentProblems.length}
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAnswer(
                (previous) => {
                  const next = !previous;

                  saveProgress({
                    problemIds:
                      currentProblems.map(
                        getProblemId
                      ),
                    currentIndex,
                    showAnswer: next,
                    results:
                      problemResults,
                    questionCount,
                    randomMode,
                    updatedAt: Date.now(),
                  });

                  return next;
                }
              );
            }}
            className="text-sm font-bold text-sky-700"
          >
            答え
          </button>
        </header>

        {/* 判定状況 */}
        <div className="mb-3 flex items-center justify-center gap-3 text-xs font-bold">
          {currentResult === true && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
              ○ 分かった
            </span>
          )}

          {currentResult === false && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
              × 分からない
            </span>
          )}

          {!currentResult &&
            currentResult !== false && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">
                未判定
              </span>
            )}
        </div>

        <section className="overflow-hidden rounded-2xl bg-white shadow">
          <div className="flex min-h-[280px] items-center justify-center bg-slate-100 p-3">
            {currentImage?.imageUrl ? (
              <img
                src={currentImage.imageUrl}
                alt="打球問題"
                className="max-h-[55vh] w-auto max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="text-sm text-slate-400">
                画像を読み込んでいます…
              </div>
            )}
          </div>

          <div className="p-5">
            <p className="text-lg font-black">
              {getQuestionText(
                currentProblem
              )}
            </p>

            {showAnswer && (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">
                  答え
                </p>

                <p className="mt-1 text-2xl font-black text-emerald-900">
                  {getAnswer(
                    currentProblem
                  )}
                </p>

                {currentProblem?.episode && (
                  <p className="mt-3 text-sm">
                    話数：
                    {
                      currentProblem.episode
                    }
                  </p>
                )}

                {currentProblem?.technique && (
                  <p className="mt-1 text-sm">
                    技名：
                    {
                      currentProblem.technique
                    }
                  </p>
                )}

                {currentProblem?.location && (
                  <p className="mt-1 text-sm">
                    場所：
                    {
                      currentProblem.location
                    }
                  </p>
                )}

                {currentProblem?.hand && (
                  <p className="mt-1 text-sm">
                    利き手：
                    {
                      currentProblem.hand
                    }
                  </p>
                )}

                {currentProblem?.result && (
                  <p className="mt-1 text-sm">
                    結果：
                    {
                      currentProblem.result
                    }
                  </p>
                )}

                {currentImage?.explanationImageUrl && (
                  <img
                    src={
                      currentImage.explanationImageUrl
                    }
                    alt="解説"
                    className="mt-4 max-h-[50vh] w-auto max-w-full object-contain"
                    draggable={false}
                  />
                )}
              </div>
            )}
          </div>
        </section>

        {/* 分かった / 分からない */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              markProblem(false)
            }
            className={`rounded-xl px-3 py-4 text-base font-black shadow ${
              currentResult === false
                ? 'bg-rose-600 text-white ring-4 ring-rose-200'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            × 分からない
          </button>

          <button
            type="button"
            onClick={() =>
              markProblem(true)
            }
            className={`rounded-xl px-3 py-4 text-base font-black shadow ${
              currentResult === true
                ? 'bg-emerald-600 text-white ring-4 ring-emerald-200'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            ○ 分かった
          </button>
        </div>

        {/* 前へ / 答え / 次へ */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={previousQuestion}
            disabled={currentIndex <= 0}
            className="rounded-xl bg-white px-3 py-4 font-bold shadow disabled:opacity-30"
          >
            ← 前へ
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAnswer(
                (previous) => {
                  const next = !previous;

                  saveProgress({
                    problemIds:
                      currentProblems.map(
                        getProblemId
                      ),
                    currentIndex,
                    showAnswer: next,
                    results:
                      problemResults,
                    questionCount,
                    randomMode,
                    updatedAt: Date.now(),
                  });

                  return next;
                }
              );
            }}
            className="rounded-xl bg-sky-600 px-3 py-4 font-black text-white shadow"
          >
            {showAnswer
              ? '答えを隠す'
              : '答えを見る'}
          </button>

          <button
            type="button"
            onClick={nextQuestion}
            className="rounded-xl bg-white px-3 py-4 font-bold shadow"
          >
            次へ →
          </button>
        </div>

        {/* 現在の進捗 */}
        <div className="mt-4 rounded-xl bg-white p-3 text-center shadow">
          <div className="flex justify-center gap-4 text-xs font-bold">
            <span className="text-emerald-600">
              ○ {resultSummary.remembered}
            </span>

            <span className="text-rose-600">
              × {resultSummary.notRemembered}
            </span>

            <span className="text-slate-500">
              未判定 {resultSummary.unanswered}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}