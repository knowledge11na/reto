// file: app/tenipuri/flashcard/page.js

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';


// =========================================================
// 設定
// =========================================================

const PROGRESS_KEY = 'tenipuri_flashcard_progress';

const SWIPE_THRESHOLD = 100;


// =========================================================
// メイン
// =========================================================

export default function TenipuriFlashcardPage() {

  // -------------------------------------------------------
  // 問題データ
  // -------------------------------------------------------

  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');


  // -------------------------------------------------------
  // 設定
  // -------------------------------------------------------

  const [questionCount, setQuestionCount] = useState(20);
  const [random, setRandom] = useState(true);


  // -------------------------------------------------------
  // ゲーム状態
  // -------------------------------------------------------

  const [gameStarted, setGameStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const [results, setResults] = useState([]);
  const [finished, setFinished] = useState(false);

  const [problemsForGame, setProblemsForGame] = useState([]);


  // -------------------------------------------------------
  // 中断・再開
  // -------------------------------------------------------

  const [resumeAvailable, setResumeAvailable] = useState(false);


  // -------------------------------------------------------
  // スワイプ
  // -------------------------------------------------------

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const touchStartX = useRef(null);
  const touchCurrentX = useRef(null);

  const cardRef = useRef(null);


  // =========================================================
  // 問題取得
  // =========================================================

  useEffect(() => {
    loadProblems();
  }, []);


  const loadProblems = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        '/api/tenipuri/problems',
        {
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
          '問題を取得できませんでした。'
        );
      }

      const list = Array.isArray(data.problems)
        ? data.problems
        : [];

      setProblems(list);

    } catch (e) {
      console.error(e);

      setError(
        e.message ||
        '問題を取得できませんでした。'
      );
    } finally {
      setLoading(false);
    }
  };


  // =========================================================
  // 問題文
  // =========================================================

  const getQuestionText = (problem) => {
    if (!problem) {
      return '';
    }

    if (problem.answer_type === 'target') {
      return '誰に打った？';
    }

    if (problem.answer_type === 'technique') {
      return '技名は？';
    }

    return '誰が打った？';
  };


  // =========================================================
  // 正解
  // =========================================================

  const getAnswer = (problem) => {
    if (!problem) {
      return '';
    }

    if (problem.answer_type === 'target') {
      return problem.target || '';
    }

    if (problem.answer_type === 'technique') {
      return problem.technique || '';
    }

    return problem.hitter || '';
  };


  // =========================================================
  // 出題対象
  // =========================================================

  const availableProblems = useMemo(() => {
    return problems.filter(
      (problem) =>
        problem &&
        problem.image_url &&
        getAnswer(problem)
    );
  }, [problems]);


  // =========================================================
  // シャッフル
  // =========================================================

  const shuffle = (array) => {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
      const j =
        Math.floor(
          Math.random() * (i + 1)
        );

      [
        result[i],
        result[j],
      ] = [
        result[j],
        result[i],
      ];
    }

    return result;
  };


  // =========================================================
  // 進捗保存
  // =========================================================

  const saveProgress = (data) => {
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify(data)
      );
    } catch {
      // 無視
    }
  };


  // =========================================================
  // 保存データ削除
  // =========================================================

  const clearProgress = () => {
    try {
      localStorage.removeItem(
        PROGRESS_KEY
      );
    } catch {
      // 無視
    }

    setResumeAvailable(false);
  };


  // =========================================================
  // 保存された途中データ確認
  // =========================================================

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          PROGRESS_KEY
        );

      if (!saved) {
        return;
      }

      const data =
        JSON.parse(saved);

      if (
        data?.active &&
        Array.isArray(data.problems) &&
        data.problems.length > 0
      ) {
        setProblemsForGame(data.problems);

        setCurrentIndex(
          Number(data.currentIndex) || 0
        );

        setResults(
          Array.isArray(data.results)
            ? data.results
            : []
        );

        setResumeAvailable(true);
      }

    } catch {
      // 無視
    }
  }, []);


  // =========================================================
  // ゲーム開始
  // =========================================================

  const startGame = () => {
    if (availableProblems.length === 0) {
      setError(
        '出題できる問題がありません。'
      );
      return;
    }

    let list = [...availableProblems];

    if (random) {
      list = shuffle(list);
    }

    if (questionCount !== 'all') {
      list = list.slice(
        0,
        Number(questionCount)
      );
    }

    setProblemsForGame(list);
    setCurrentIndex(0);
    setResults([]);
    setShowAnswer(false);
    setFinished(false);
    setGameStarted(true);
    setDragX(0);
    setResumeAvailable(false);

    saveProgress({
      active: true,
      finished: false,
      problems: list,
      currentIndex: 0,
      results: [],
    });
  };


  // =========================================================
  // 続きから再開
  // =========================================================

  const resumeGame = () => {
    if (
      problemsForGame.length === 0 ||
      currentIndex >= problemsForGame.length
    ) {
      return;
    }

    setGameStarted(true);
    setFinished(false);
    setShowAnswer(false);
    setDragX(0);
    setResumeAvailable(false);
  };


  // =========================================================
  // 問題の判定
  // =========================================================

  const judge = (known) => {
    if (!gameStarted || finished) {
      return;
    }

    if (
      currentIndex >=
      problemsForGame.length
    ) {
      return;
    }

    const current =
      problemsForGame[currentIndex];

    const newResults = [
      ...results,
      {
        id: current.id,
        known,
      },
    ];

    setResults(newResults);

    setDragX(0);
    setShowAnswer(false);

    const nextIndex =
      currentIndex + 1;

    // -------------------------------------------------------
    // 最後の問題
    // -------------------------------------------------------

    if (
      nextIndex >=
      problemsForGame.length
    ) {
      setCurrentIndex(nextIndex);
      setFinished(true);
      setResumeAvailable(false);

      saveProgress({
        active: false,
        finished: true,
        problems: problemsForGame,
        currentIndex: nextIndex,
        results: newResults,
      });

      return;
    }

    // -------------------------------------------------------
    // 次の問題
    // -------------------------------------------------------

    setCurrentIndex(nextIndex);

    saveProgress({
      active: true,
      finished: false,
      problems: problemsForGame,
      currentIndex: nextIndex,
      results: newResults,
    });
  };


  // =========================================================
  // 中断する
  // =========================================================

  const interruptGame = () => {
    if (
      !gameStarted ||
      finished
    ) {
      return;
    }

    // 現在位置をそのまま保存
    saveProgress({
      active: true,
      finished: false,
      problems: problemsForGame,
      currentIndex,
      results,
    });

    setGameStarted(false);
    setShowAnswer(false);
    setDragX(0);
    setResumeAvailable(true);
  };


  // =========================================================
  // タッチ開始
  // =========================================================

  const handleTouchStart = (e) => {
    if (
      !gameStarted ||
      finished
    ) {
      return;
    }

    const touch =
      e.touches?.[0];

    if (!touch) {
      return;
    }

    touchStartX.current =
      touch.clientX;

    touchCurrentX.current =
      touch.clientX;

    setIsDragging(true);
  };


  // =========================================================
  // タッチ移動
  // =========================================================

  const handleTouchMove = (e) => {
    if (
      !isDragging ||
      touchStartX.current === null
    ) {
      return;
    }

    const touch =
      e.touches?.[0];

    if (!touch) {
      return;
    }

    touchCurrentX.current =
      touch.clientX;

    const diff =
      touch.clientX -
      touchStartX.current;

    const limited =
      Math.max(
        -180,
        Math.min(180, diff)
      );

    setDragX(limited);
  };


  // =========================================================
  // タッチ終了
  // =========================================================

  const handleTouchEnd = () => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);

    const diff =
      (touchCurrentX.current || 0) -
      (touchStartX.current || 0);

    touchStartX.current = null;
    touchCurrentX.current = null;

    if (
      Math.abs(diff) >=
      SWIPE_THRESHOLD
    ) {

      /*
       * 左  = わかった
       * 右  = わからない
       */

      if (diff < 0) {
        judge(true);
      } else {
        judge(false);
      }

      return;
    }

    setDragX(0);
  };


  // =========================================================
  // マウス操作
  // =========================================================

  const handleMouseDown = (e) => {
    if (
      !gameStarted ||
      finished
    ) {
      return;
    }

    touchStartX.current =
      e.clientX;

    touchCurrentX.current =
      e.clientX;

    setIsDragging(true);
  };


  const handleMouseMove = (e) => {
    if (
      !isDragging ||
      touchStartX.current === null
    ) {
      return;
    }

    touchCurrentX.current =
      e.clientX;

    const diff =
      e.clientX -
      touchStartX.current;

    const limited =
      Math.max(
        -180,
        Math.min(180, diff)
      );

    setDragX(limited);
  };


  const handleMouseUp = () => {
    if (!isDragging) {
      return;
    }

    handleTouchEnd();
  };


  // =========================================================
  // カードタップ
  // =========================================================

  const handleCardClick = () => {
    if (isDragging) {
      return;
    }

    if (
      !gameStarted ||
      finished
    ) {
      return;
    }

    setShowAnswer(
      (prev) => !prev
    );
  };


  // =========================================================
  // 最初から
  // =========================================================

  const resetToStart = () => {
    clearProgress();

    setGameStarted(false);
    setFinished(false);
    setProblemsForGame([]);
    setCurrentIndex(0);
    setResults([]);
    setShowAnswer(false);
    setDragX(0);
  };


  // =========================================================
  // 分からなかった問題だけ復習
  // =========================================================

  const retryWrong = () => {
    const wrongIds =
      new Set(
        results
          .filter(
            (result) =>
              !result.known
          )
          .map(
            (result) =>
              result.id
          )
      );

    const wrongProblems =
      problemsForGame.filter(
        (problem) =>
          wrongIds.has(problem.id)
      );

    if (
      wrongProblems.length === 0
    ) {
      return;
    }

    let nextProblems =
      random
        ? shuffle(wrongProblems)
        : [...wrongProblems];

    setProblemsForGame(
      nextProblems
    );

    setCurrentIndex(0);
    setResults([]);
    setShowAnswer(false);
    setFinished(false);
    setGameStarted(true);
    setDragX(0);
    setResumeAvailable(false);

    saveProgress({
      active: true,
      finished: false,
      problems: nextProblems,
      currentIndex: 0,
      results: [],
    });
  };


  // =========================================================
  // 終了集計
  // =========================================================

  const knownCount =
    results.filter(
      (result) =>
        result.known
    ).length;

  const unknownCount =
    results.filter(
      (result) =>
        !result.known
    ).length;


  // =========================================================
  // ローディング
  // =========================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">

        <div className="max-w-xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球単語帳
            </h1>

            <Link
              href="/tenipuri"
              className="text-xs font-bold text-sky-700 underline"
            >
              テニプリへ戻る
            </Link>

          </header>

          <div className="rounded-2xl border-2 border-sky-200 bg-white p-8 text-center shadow-sm">

            <p className="font-bold text-slate-600">
              問題を読み込み中...
            </p>

          </div>

        </div>

      </main>
    );
  }


  // =========================================================
  // エラー
  // =========================================================

  if (error) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">

        <div className="max-w-xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球単語帳
            </h1>

            <Link
              href="/tenipuri"
              className="text-xs font-bold text-sky-700 underline"
            >
              テニプリへ戻る
            </Link>

          </header>

          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">

            <p className="font-bold text-red-700">
              {error}
            </p>

          </div>

          <button
            type="button"
            onClick={loadProblems}
            className="mt-4 w-full rounded-2xl bg-sky-500 px-4 py-4 text-sm font-extrabold text-white"
          >
            もう一度読み込む
          </button>

        </div>

      </main>
    );
  }


  // =========================================================
  // スタート画面
  // =========================================================

  if (!gameStarted) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">

        <div className="max-w-xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球単語帳
            </h1>

            <Link
              href="/tenipuri"
              className="text-xs font-bold text-sky-700 underline"
            >
              テニプリへ戻る
            </Link>

          </header>


          <section className="rounded-2xl border-2 border-fuchsia-200 bg-white p-5 shadow-sm">

            <div className="mb-5">

              <h2 className="text-lg font-extrabold text-fuchsia-900">
                打球単語帳
              </h2>

              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                打球画像を見て答えを思い出してください。
                分かったら左へ、分からなかったら右へスワイプします。
              </p>

            </div>


            {/* =================================================
                中断データがある場合
            ================================================= */}

            {resumeAvailable && (

              <div className="mb-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">

                <p className="text-sm font-extrabold text-amber-900">
                  前回の続きがあります
                </p>

                <p className="mt-1 text-xs text-amber-700">
                  {Math.min(
                    currentIndex + 1,
                    problemsForGame.length
                  )}
                  問目から再開できます。
                </p>

                <button
                  type="button"
                  onClick={resumeGame}
                  className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-amber-400"
                >
                  続きから再開
                </button>

                <button
                  type="button"
                  onClick={resetToStart}
                  className="mt-2 w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-2 text-xs font-extrabold text-amber-800"
                >
                  途中データを消して最初から
                </button>

              </div>

            )}


            {/* =================================================
                問題数
            ================================================= */}

            <div className="mb-5">

              <p className="mb-2 text-xs font-extrabold text-slate-700">
                問題数
              </p>

              <div className="grid grid-cols-4 gap-2">

                {[10, 20, 50].map(
                  (count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() =>
                        setQuestionCount(count)
                      }
                      className={`rounded-xl border-2 px-2 py-3 text-sm font-extrabold transition ${
                        questionCount === count
                          ? 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {count}問
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    setQuestionCount('all')
                  }
                  className={`rounded-xl border-2 px-2 py-3 text-sm font-extrabold transition ${
                    questionCount === 'all'
                      ? 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  全問
                </button>

              </div>

            </div>


            {/* =================================================
                出題順
            ================================================= */}

            <div className="mb-6">

              <p className="mb-2 text-xs font-extrabold text-slate-700">
                出題順
              </p>

              <div className="grid grid-cols-2 gap-2">

                <button
                  type="button"
                  onClick={() =>
                    setRandom(true)
                  }
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-extrabold ${
                    random
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  ランダム
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setRandom(false)
                  }
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-extrabold ${
                    !random
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  登録順
                </button>

              </div>

            </div>


            {/* =================================================
                問題数表示
            ================================================= */}

            <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-center">

              <p className="text-xs text-slate-500">
                出題可能
              </p>

              <p className="text-xl font-extrabold text-slate-800">
                {availableProblems.length}
                <span className="ml-1 text-xs font-bold">
                  問
                </span>
              </p>

            </div>


            {/* =================================================
                スタート
            ================================================= */}

            <button
              type="button"
              onClick={startGame}
              disabled={
                availableProblems.length === 0
              }
              className="w-full rounded-2xl bg-fuchsia-500 px-4 py-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              単語帳を始める
            </button>

          </section>

        </div>

      </main>
    );
  }


  // =========================================================
  // 終了画面
  // =========================================================

  if (finished) {

    const total =
      problemsForGame.length;

    const percent =
      total > 0
        ? Math.round(
            (knownCount / total) * 100
          )
        : 0;

    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">

        <div className="max-w-xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球単語帳
            </h1>

            <Link
              href="/tenipuri"
              className="text-xs font-bold text-sky-700 underline"
            >
              テニプリへ戻る
            </Link>

          </header>


          <section className="rounded-2xl border-2 border-fuchsia-300 bg-white p-6 shadow-sm text-center">

            <p className="text-sm font-bold text-fuchsia-700">
              単語帳終了！
            </p>

            <h2 className="mt-2 text-2xl font-extrabold">
              お疲れさま！
            </h2>


            {/* =================================================
                正答率
            ================================================= */}

            <div className="mt-6">

              <p className="text-xs font-bold text-slate-500">
                わかった割合
              </p>

              <p className="mt-1 text-4xl font-black text-fuchsia-600">
                {percent}%
              </p>

            </div>


            {/* =================================================
                結果
            ================================================= */}

            <div className="mt-6 grid grid-cols-2 gap-3">

              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">

                <p className="text-xs font-bold text-emerald-700">
                  わかった
                </p>

                <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                  {knownCount}
                  <span className="ml-1 text-xs">
                    問
                  </span>
                </p>

              </div>


              <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">

                <p className="text-xs font-bold text-red-700">
                  わからない
                </p>

                <p className="mt-1 text-2xl font-extrabold text-red-700">
                  {unknownCount}
                  <span className="ml-1 text-xs">
                    問
                  </span>
                </p>

              </div>

            </div>


            {/* =================================================
                分からなかった問題だけもう一回
            ================================================= */}

            {unknownCount > 0 && (

              <button
                type="button"
                onClick={retryWrong}
                className="mt-6 w-full rounded-2xl bg-red-500 px-4 py-4 text-sm font-extrabold text-white shadow-sm hover:bg-red-400"
              >
                分からなかった問題だけもう一回
              </button>

            )}


            {/* =================================================
                最初から
            ================================================= */}

            <button
              type="button"
              onClick={resetToStart}
              className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
            >
              もう一度最初から
            </button>


            {/* =================================================
                テニプリへ
            ================================================= */}

            <Link
              href="/tenipuri"
              className="mt-3 block w-full rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-extrabold text-sky-700"
            >
              テニプリへ戻る
            </Link>

          </section>

        </div>

      </main>
    );
  }


  // =========================================================
  // 現在の問題
  // =========================================================

  const currentProblem =
    problemsForGame[currentIndex];


  if (!currentProblem) {
    return null;
  }


  // =========================================================
  // 進捗
  // =========================================================

  const total =
    problemsForGame.length;

  const displayNumber =
    currentIndex + 1;

  const progress =
    total > 0
      ? (currentIndex / total) * 100
      : 0;


  // =========================================================
  // カードの見た目
  // =========================================================

  const rotation =
    dragX * 0.04;

  const opacity =
    Math.max(
      0.65,
      1 - Math.abs(dragX) / 500
    );


  // =========================================================
  // プレイ画面
  // =========================================================

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">

      <div className="max-w-xl mx-auto px-4 py-4 sm:py-6">

        {/* =================================================
            ヘッダー
        ================================================= */}

        <header className="mb-4 flex items-center justify-between">

          <div>

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球単語帳
            </h1>

            <p className="text-[11px] text-slate-500 mt-1">
              {displayNumber} / {total}
            </p>

          </div>

          <button
            type="button"
            onClick={interruptGame}
            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 shadow-sm hover:bg-slate-50"
          >
            中断する
          </button>

        </header>


        {/* =================================================
            進捗バー
        ================================================= */}

        <div className="mb-5">

          <div className="h-3 overflow-hidden rounded-full bg-slate-200">

            <div
              className="h-full rounded-full bg-fuchsia-500 transition-all duration-300"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

          <div className="mt-2 flex justify-between text-[11px] font-bold">

            <span className="text-emerald-600">
              わかった {knownCount}
            </span>

            <span className="text-red-600">
              わからない {unknownCount}
            </span>

          </div>

        </div>


        {/* =================================================
            スワイプ案内
        ================================================= */}

        <div className="mb-3 flex items-center justify-between text-[11px] font-extrabold">

          <span
            className={
              dragX < -20
                ? 'text-emerald-600'
                : 'text-slate-400'
            }
          >
            ← わかった
          </span>

          <span className="text-slate-400">
            タップで答えを見る
          </span>

          <span
            className={
              dragX > 20
                ? 'text-red-600'
                : 'text-slate-400'
            }
          >
            わからない →
          </span>

        </div>


        {/* =================================================
            カード
        ================================================= */}

        <div
          ref={cardRef}
          onClick={handleCardClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDragging) {
              handleTouchEnd();
            }
          }}
          className="relative select-none touch-pan-y"
          style={{
            cursor: isDragging
              ? 'grabbing'
              : 'pointer',
          }}
        >

          {/* =================================================
              わかった表示
          ================================================= */}

          <div
            className="pointer-events-none absolute left-2 top-6 z-20 rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-2 font-black text-emerald-700 shadow-sm transition-opacity"
            style={{
              opacity:
                dragX < 0
                  ? Math.min(
                      1,
                      Math.abs(dragX) /
                        SWIPE_THRESHOLD
                    )
                  : 0,
            }}
          >
            わかった
          </div>


          {/* =================================================
              わからない表示
          ================================================= */}

          <div
            className="pointer-events-none absolute right-2 top-6 z-20 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-2 font-black text-red-700 shadow-sm"
            style={{
              opacity:
                dragX > 0
                  ? Math.min(
                      1,
                      dragX /
                        SWIPE_THRESHOLD
                    )
                  : 0,
            }}
          >
            わからない
          </div>


          <div
            className="overflow-hidden rounded-3xl border-2 border-fuchsia-200 bg-white shadow-lg transition-transform"
            style={{
              transform:
                `translateX(${dragX}px) rotate(${rotation}deg)`,
              opacity,
              transition: isDragging
                ? 'none'
                : 'transform 0.25s ease, opacity 0.25s ease',
            }}
          >

            {/* =================================================
                表面
            ================================================= */}

            {!showAnswer ? (

              <div>

                <div className="bg-fuchsia-50 px-4 py-4 text-center">

                  <p className="text-xs font-bold text-fuchsia-700">
                    問題
                  </p>

                  <p className="mt-1 text-xl sm:text-2xl font-black text-fuchsia-950">
                    {getQuestionText(
                      currentProblem
                    )}
                  </p>

                </div>


                <div className="bg-slate-100">

                  <img
                    src={
                      currentProblem.image_url
                    }
                    alt="打球画像"
                    draggable={false}
                    className="block h-auto max-h-[55vh] w-full object-contain"
                  />

                </div>


                <div className="px-4 py-5 text-center">

                  <p className="text-xs font-bold text-slate-400">
                    タップすると答えが表示されます
                  </p>

                </div>

              </div>

            ) : (

              /* =================================================
                 裏面
              ================================================= */

              <div>

                <div className="bg-emerald-50 px-4 py-4 text-center">

                  <p className="text-xs font-bold text-emerald-700">
                    正解
                  </p>

                  <p className="mt-1 text-2xl sm:text-3xl font-black text-emerald-900 break-words">
                    {getAnswer(
                      currentProblem
                    )}
                  </p>

                </div>


                {/* 打球画像 */}

                <div className="bg-slate-100">

                  <img
                    src={
                      currentProblem.image_url
                    }
                    alt="打球画像"
                    draggable={false}
                    className="block h-auto max-h-[45vh] w-full object-contain"
                  />

                </div>


                {/* 詳細 */}

                <div className="space-y-2 px-4 py-5">

                  {currentProblem.hitter && (
                    <InfoRow
                      label="誰が"
                      value={
                        currentProblem.hitter
                      }
                    />
                  )}

                  {currentProblem.target && (
                    <InfoRow
                      label="誰に"
                      value={
                        currentProblem.target
                      }
                    />
                  )}

                  {currentProblem.technique && (
                    <InfoRow
                      label="技名"
                      value={
                        currentProblem.technique
                      }
                    />
                  )}

                  {currentProblem.episode && (
                    <InfoRow
                      label="話数"
                      value={`${currentProblem.episode}話`}
                    />
                  )}

                  {currentProblem.location && (
                    <InfoRow
                      label="場所"
                      value={
                        currentProblem.location
                      }
                    />
                  )}

                  {currentProblem.hand && (
                    <InfoRow
                      label="右・左"
                      value={
                        currentProblem.hand
                      }
                    />
                  )}

                  {currentProblem.result && (
                    <InfoRow
                      label="結果"
                      value={
                        currentProblem.result
                      }
                    />
                  )}

                </div>


                {/* 解説画像 */}

                {currentProblem.explanation_image_url && (

                  <div className="border-t-2 border-violet-100 bg-violet-50 px-4 py-5">

                    <p className="mb-3 text-center text-xs font-extrabold text-violet-800">
                      解説画像
                    </p>

                    <img
                      src={
                        currentProblem.explanation_image_url
                      }
                      alt="解説画像"
                      draggable={false}
                      className="block max-h-[50vh] w-full rounded-xl bg-white object-contain"
                    />

                  </div>

                )}


                <div className="px-4 py-5 text-center">

                  <p className="text-xs font-bold text-slate-400">
                    もう一度タップすると問題に戻ります
                  </p>

                </div>

              </div>

            )}

          </div>

        </div>


        {/* =================================================
            判定ボタン
        ================================================= */}

        <div className="mt-5 grid grid-cols-2 gap-3">

          <button
            type="button"
            onClick={() =>
              judge(true)
            }
            className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-extrabold text-emerald-800 shadow-sm hover:bg-emerald-100"
          >
            ← わかった
          </button>

          <button
            type="button"
            onClick={() =>
              judge(false)
            }
            className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-4 text-sm font-extrabold text-red-800 shadow-sm hover:bg-red-100"
          >
            わからない →
          </button>

        </div>


        {/* =================================================
            操作説明
        ================================================= */}

        <div className="mt-4 rounded-xl bg-white px-4 py-3 text-center shadow-sm">

          <p className="text-[11px] leading-relaxed text-slate-500">

            スマホ：カードを

            <span className="font-extrabold text-emerald-600">
              左へスワイプ
            </span>

            すると「わかった」、

            <span className="font-extrabold text-red-600">
              右へスワイプ
            </span>

            すると「わからない」

          </p>

        </div>


        {/* =================================================
            中断ボタン（下にも配置）
        ================================================= */}

        <button
          type="button"
          onClick={interruptGame}
          className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-xs font-extrabold text-slate-500 hover:bg-slate-50"
        >
          中断する
        </button>

      </div>

    </main>
  );
}


// =============================================================
// 情報行
// =============================================================

function InfoRow({
  label,
  value,
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2">

      <span className="w-14 shrink-0 text-xs font-extrabold text-slate-500">
        {label}
      </span>

      <span className="text-sm font-bold text-slate-800 break-words">
        {value}
      </span>

    </div>
  );
}

