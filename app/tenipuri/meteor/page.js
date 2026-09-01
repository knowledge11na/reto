// file: app/tenipuri/meteor/page.js

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TenipuriMeteorReview from '@/components/TenipuriMeteorReview';


// =========================================================
// 設定
// =========================================================

// 全体プレイ時間
const TOTAL_TIME_MS = 10 * 60 * 1000;

// 被弾ペナルティ
const HIT_PENALTY_MS = 30 * 1000;

// 同時に出すボール
const BALL_SLOTS = 3;

// ボール1個の最低制限時間
const MIN_BALL_TIME_MS = 60 * 1000;

// ボールの接近時間
const BALL_APPROACH_MS = 60 * 1000;

// タイマー更新間隔
const TICK_MS = 250;

// 打ち返しエフェクト時間
const RETURN_EFFECT_MS = 450;


// =========================================================
// ボールごとの制限時間
// =========================================================

function getBallLimitMs(problem) {
  if (!problem) {
    return MIN_BALL_TIME_MS;
  }

  const answer = String(
    problem.answer_type === 'hitter'
      ? problem.hitter || ''
      : problem.answer_type === 'target'
        ? problem.target || ''
        : problem.technique || ''
  );

  const len = answer.length;

  if (len <= 15) {
    return 60 * 1000;
  }

  const over = len - 15;
  const steps = Math.floor(over / 15);

  return (60 + steps * 10) * 1000;
}


// =========================================================
// 回答比較
// =========================================================

function normalize(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}


// =========================================================
// 問題の答え
// =========================================================

function getAnswer(problem) {
  if (!problem) {
    return '';
  }

  if (problem.answer_type === 'hitter') {
    return String(problem.hitter || '');
  }

  if (problem.answer_type === 'target') {
    return String(problem.target || '');
  }

  if (problem.answer_type === 'technique') {
    return String(problem.technique || '');
  }

  return '';
}


// =========================================================
// 問題文
// =========================================================

function getQuestionText(problem) {
  if (!problem) {
    return '';
  }

  if (problem.answer_type === 'hitter') {
    return '誰が打った？';
  }

  if (problem.answer_type === 'target') {
    return '誰に打った？';
  }

  if (problem.answer_type === 'technique') {
    return '技名は？';
  }

  return '';
}


// =========================================================
// 問題ID
// =========================================================

function getProblemId(problem) {
  return (
    problem?.id ??
    problem?.problem_id ??
    problem?.question_id ??
    null
  );
}


// =========================================================
// 振り返り用データ作成
// =========================================================

function createReviewData(
  problem,
  userAnswerText,
  isCorrect
) {
  if (!problem) {
    return null;
  }

  return {
    question_id: getProblemId(problem),

    text: getQuestionText(problem),

    userAnswerText:
      userAnswerText || '（回答なし）',

    correctAnswerText:
      getAnswer(problem),

    isCorrect: !!isCorrect,

    image_url:
      problem.image_url || '',

    explanation_image_url:
      problem.explanation_image_url || '',

    hitter:
      problem.hitter || '',

    target:
      problem.target || '',

    episode:
      problem.episode || '',

    technique:
      problem.technique || '',

    location:
      problem.location || '',

    hand:
      problem.hand || '',

    result:
      problem.result || '',
  };
}


// =========================================================
// ボール生成
// =========================================================

function createBall(problemIndex, problems) {
  const problem =
    problems[problemIndex];

  return {
    problemIndex,
    remainingMs:
      getBallLimitMs(problem),
    returning: false,
  };
}


// =========================================================
// ランダム問題
// =========================================================

function getRandomProblemIndex(
  problems,
  currentIndex = -1
) {
  if (!problems.length) {
    return -1;
  }

  if (problems.length === 1) {
    return 0;
  }

  let index = currentIndex;

  let guard = 0;

  while (
    index === currentIndex &&
    guard < 20
  ) {
    index =
      Math.floor(
        Math.random() *
          problems.length
      );

    guard++;
  }

  return index;
}


// =========================================================
// メイン
// =========================================================

export default function TenipuriMeteorPage() {

  const [problems, setProblems] =
    useState([]);

  const [balls, setBalls] =
    useState([]);

  const [totalMs, setTotalMs] =
    useState(TOTAL_TIME_MS);

  const [status, setStatus] =
    useState('loading');

  const [score, setScore] =
    useState(0);

  const [hits, setHits] =
    useState(0);

  const [answerInput, setAnswerInput] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [errorText, setErrorText] =
    useState('');

  const [bestScore, setBestScore] =
    useState(0);

  const [selectedBall, setSelectedBall] =
    useState(null);

  const [answerHistory, setAnswerHistory] =
    useState([]);

  const inputRef =
    useRef(null);

  const ballsRef =
    useRef([]);

  const returnTimersRef =
    useRef([]);

  const messageTimerRef =
    useRef(null);


  // =======================================================
  // ballsの最新値をrefにも保持
  // =======================================================

  useEffect(() => {
    ballsRef.current =
      balls;
  }, [balls]);


  // =======================================================
  // ページスクロール防止
  //
  // ゲーム中だけbodyを固定。
  // スマホで入力欄をタップした際に
  // ブラウザがページ全体を勝手に下げるのを防ぐ。
  // =======================================================

  useEffect(() => {

    if (
      typeof document === 'undefined'
    ) {
      return;
    }

    if (
      status !== 'playing'
    ) {
      return;
    }

    const body =
      document.body;

    const html =
      document.documentElement;

    const previousBodyOverflow =
      body.style.overflow;

    const previousBodyPosition =
      body.style.position;

    const previousBodyWidth =
      body.style.width;

    const previousHtmlOverflow =
      html.style.overflow;

    body.style.overflow =
      'hidden';

    html.style.overflow =
      'hidden';

    body.style.position =
      'fixed';

    body.style.width =
      '100%';

    return () => {

      body.style.overflow =
        previousBodyOverflow;

      body.style.position =
        previousBodyPosition;

      body.style.width =
        previousBodyWidth;

      html.style.overflow =
        previousHtmlOverflow;

    };

  }, [status]);


  // =======================================================
  // 自己ベスト読み込み
  // =======================================================

  useEffect(() => {

    if (
      typeof window === 'undefined'
    ) {
      return;
    }

    try {

      const raw =
        window.localStorage.getItem(
          'tenipuri_meteor_best_score'
        );

      const n =
        raw
          ? Number(raw)
          : 0;

      if (
        !Number.isNaN(n) &&
        n > 0
      ) {
        setBestScore(n);
      }

    } catch {
      // 無視
    }

  }, []);


  // =======================================================
  // 問題読み込み
  // =======================================================

  useEffect(() => {

    let cancelled = false;

    const loadProblems =
      async () => {

        try {

          const res =
            await fetch(
              '/api/tenipuri/problems',
              {
                cache: 'no-store',
              }
            );

          if (!res.ok) {
            throw new Error(
              `HTTP ${res.status}`
            );
          }

          const data =
            await res.json();

          if (cancelled) {
            return;
          }

          if (!data.ok) {

            setErrorText(
              data.error ||
              '問題の取得に失敗しました。'
            );

            setStatus(
              'finished'
            );

            return;
          }

          if (
            !Array.isArray(
              data.problems
            ) ||
            data.problems.length === 0
          ) {

            setErrorText(
              '使える問題がありません。'
            );

            setStatus(
              'finished'
            );

            return;
          }


          const loadedProblems =
            data.problems;

          setProblems(
            loadedProblems
          );


          // -------------------------------------------------
          // 最初の3球
          // -------------------------------------------------

          const count =
            Math.min(
              BALL_SLOTS,
              loadedProblems.length
            );

          const initialBalls = [];

          for (
            let i = 0;
            i < count;
            i++
          ) {

            initialBalls.push(
              createBall(
                i,
                loadedProblems
              )
            );

          }


          ballsRef.current =
            initialBalls;

          setBalls(
            initialBalls
          );

          setTotalMs(
            TOTAL_TIME_MS
          );

          setScore(0);

          setHits(0);

          setAnswerInput('');

          setMessage('');

          setAnswerHistory([]);

          setSelectedBall(null);

          setErrorText('');

          setStatus(
            'playing'
          );


          setTimeout(() => {

            inputRef.current?.focus();

          }, 150);

        } catch (error) {

          console.error(
            '[tenipuri/meteor] fetch error:',
            error
          );

          if (!cancelled) {

            setErrorText(
              '問題の取得に失敗しました。'
            );

            setStatus(
              'finished'
            );

          }

        }

      };


    loadProblems();


    return () => {

      cancelled = true;

    };

  }, []);


  // =======================================================
  // 自己ベスト更新
  // =======================================================

  useEffect(() => {

    if (
      status !== 'finished'
    ) {
      return;
    }

    if (errorText) {
      return;
    }

    setBestScore((prev) => {

      const next =
        score > prev
          ? score
          : prev;

      if (
        next > prev &&
        typeof window !== 'undefined'
      ) {

        try {

          window.localStorage.setItem(
            'tenipuri_meteor_best_score',
            String(next)
          );

        } catch {
          // 無視
        }

      }

      return next;

    });

  }, [
    status,
    score,
    errorText,
  ]);


  // =======================================================
  // 全体タイマー・ボールタイマー
  // =======================================================

  useEffect(() => {

    if (
      status !== 'playing'
    ) {
      return;
    }

    if (
      !problems.length
    ) {
      return;
    }

    if (
      !balls.length
    ) {
      return;
    }


    const timer =
      setInterval(() => {

        // =================================================
        // 全体タイマー
        // =================================================

        setTotalMs((prev) => {

          const next =
            Math.max(
              0,
              prev - TICK_MS
            );

          if (
            next <= 0
          ) {

            setStatus(
              'finished'
            );

          }

          return next;

        });


        // =================================================
        // 各ボール
        // =================================================

        setBalls((prevBalls) => {

          if (
            !prevBalls.length
          ) {
            return prevBalls;
          }


          let changed = false;

          const nextBalls =
            prevBalls.map(
              (ball) => ({
                ...ball,
              })
            );


          for (
            let i = 0;
            i < nextBalls.length;
            i++
          ) {

            const ball =
              nextBalls[i];

            if (!ball) {
              continue;
            }

            // -------------------------------------------------
            // 打ち返し中はタイマー停止
            // -------------------------------------------------

            if (
              ball.returning
            ) {
              continue;
            }


            const nextMs =
              Math.max(
                0,
                ball.remainingMs -
                  TICK_MS
              );


            // -------------------------------------------------
            // 時間切れ
            // -------------------------------------------------

            if (
              nextMs <= 0
            ) {

              changed = true;


              const problem =
                problems[
                  ball.problemIndex
                ];


              // 振り返り
              if (problem) {

                const review =
                  createReviewData(
                    problem,
                    '（時間切れ）',
                    false
                  );

                if (review) {

                  setAnswerHistory(
                    (prev) => [
                      ...prev,
                      review,
                    ]
                  );

                }

              }


              // 被弾
              setHits(
                (prev) =>
                  prev + 1
              );


              // 全体時間 -30秒
              setTotalMs(
                (prev) =>
                  Math.max(
                    0,
                    prev -
                      HIT_PENALTY_MS
                  )
              );


              showMessage(
                '打ち返せなかった！ 残り時間 -30秒！'
              );


              // 新しい問題
              const randomIndex =
                getRandomProblemIndex(
                  problems,
                  ball.problemIndex
                );


              if (
                randomIndex >= 0
              ) {

                nextBalls[i] =
                  createBall(
                    randomIndex,
                    problems
                  );

              }

            } else {

              if (
                nextMs !==
                ball.remainingMs
              ) {

                changed = true;

              }

              nextBalls[i] = {
                ...ball,
                remainingMs:
                  nextMs,
              };

            }

          }


          if (changed) {

            ballsRef.current =
              nextBalls;

            return nextBalls;

          }

          return prevBalls;

        });

      }, TICK_MS);


    return () => {

      clearInterval(
        timer
      );

    };

  }, [
    status,
    problems,
    balls.length,
  ]);


  // =======================================================
  // メッセージ表示
  // =======================================================

  const showMessage = (text) => {

    setMessage(text);

    if (
      messageTimerRef.current
    ) {

      clearTimeout(
        messageTimerRef.current
      );

    }

    messageTimerRef.current =
      setTimeout(() => {

        setMessage('');

      }, 1800);

  };


  // =======================================================
  // クリーンアップ
  // =======================================================

  useEffect(() => {

    return () => {

      if (
        messageTimerRef.current
      ) {

        clearTimeout(
          messageTimerRef.current
        );

      }

      returnTimersRef.current.forEach(
        (timer) => {
          clearTimeout(timer);
        }
      );

    };

  }, []);


  // =======================================================
  // ボールを打ち返す
  // =======================================================

  const returnBall = (
    ballIndex,
    userAnswer
  ) => {

    const currentBalls =
      ballsRef.current;

    const ball =
      currentBalls[
        ballIndex
      ];


    if (!ball) {
      return;
    }

    if (
      ball.returning
    ) {
      return;
    }


    const problem =
      problems[
        ball.problemIndex
      ];


    if (!problem) {
      return;
    }


    // -----------------------------------------------------
    // 振り返り
    // -----------------------------------------------------

    const review =
      createReviewData(
        problem,
        userAnswer,
        true
      );

    if (review) {

      setAnswerHistory(
        (prev) => [
          ...prev,
          review,
        ]
      );

    }


    // -----------------------------------------------------
    // スコア
    // -----------------------------------------------------

    setScore(
      (prev) =>
        prev + 1
    );


    showMessage(
      'ナイスショット！ 打球を打ち返した！'
    );


    // -----------------------------------------------------
    // 打ち返し状態
    //
    // ここで問題を消さず、
    // returning=true のままエフェクトを表示。
    // -----------------------------------------------------

    setBalls((prevBalls) => {

      const next =
        prevBalls.map(
          (
            ballItem,
            index
          ) => {

            if (
              index !==
              ballIndex
            ) {
              return ballItem;
            }

            return {
              ...ballItem,
              returning: true,
            };

          }
        );

      ballsRef.current =
        next;

      return next;

    });


    // -----------------------------------------------------
    // エフェクト終了後に新しい球へ交換
    // -----------------------------------------------------

    const timer =
      setTimeout(() => {

        setBalls((prevBalls) => {

          if (
            !prevBalls[
              ballIndex
            ]
          ) {
            return prevBalls;
          }


          const oldBall =
            prevBalls[
              ballIndex
            ];


          const randomIndex =
            getRandomProblemIndex(
              problems,
              oldBall.problemIndex
            );


          if (
            randomIndex < 0
          ) {
            return prevBalls;
          }


          const newBall =
            createBall(
              randomIndex,
              problems
            );


          const next =
            [...prevBalls];


          next[ballIndex] =
            newBall;


          ballsRef.current =
            next;


          return next;

        });

      }, RETURN_EFFECT_MS);


    returnTimersRef.current.push(
      timer
    );


    setSelectedBall(
      null
    );

  };


  // =======================================================
  // 回答
  // =======================================================

  const handleAnswer = () => {

    if (
      status !== 'playing'
    ) {

      inputRef.current?.focus();

      return;
    }


    const input =
      answerInput.trim();


    if (!input) {

      inputRef.current?.focus();

      return;
    }


    const normalizedInput =
      normalize(input);


    const currentBalls =
      ballsRef.current;


    let hitIndex = -1;


    // -----------------------------------------------------
    // 3球から一致するものを探す
    // -----------------------------------------------------

    for (
      let i = 0;
      i < currentBalls.length;
      i++
    ) {

      const ball =
        currentBalls[i];


      if (!ball) {
        continue;
      }


      if (
        ball.returning
      ) {
        continue;
      }


      const problem =
        problems[
          ball.problemIndex
        ];


      if (!problem) {
        continue;
      }


      const answer =
        getAnswer(problem);


      if (
        normalize(answer) ===
        normalizedInput
      ) {

        hitIndex = i;

        break;

      }

    }


    // -----------------------------------------------------
    // 正解
    // -----------------------------------------------------

    if (
      hitIndex >= 0
    ) {

      returnBall(
        hitIndex,
        input
      );

    }

    // -----------------------------------------------------
    // 不正解
    // -----------------------------------------------------

    else {

      showMessage(
        '空振り！ どのボールにも当たらなかった。'
      );

    }


    setAnswerInput('');


    // -----------------------------------------------------
    // フォーカスを維持
    //
    // scrollIntoViewは使わない。
    // iPhoneで勝手に画面を動かす原因になるため。
    // -----------------------------------------------------

    requestAnimationFrame(() => {

      inputRef.current?.focus({
        preventScroll: true,
      });

    });

  };


  // =======================================================
  // 終了画面
  // =======================================================

  if (
    status === 'finished'
  ) {

    return (

      <GameLayout>

        <div className="w-full max-w-5xl mx-auto px-3 pb-8 space-y-4">

          <div className="max-w-md mx-auto bg-slate-950/90 border border-slate-600 rounded-2xl shadow-xl p-4 sm:p-6">

            <h2 className="text-lg sm:text-xl font-bold mb-2">
              打球打ち返しモード 結果
            </h2>


            {errorText ? (

              <p className="text-sm text-red-300 mb-2">
                {errorText}
              </p>

            ) : (

              <p className="text-sm text-slate-100 mb-3">
                10分間のチャレンジが終了しました。
              </p>

            )}


            <div className="space-y-1 text-sm">

              <p>
                打ち返した数：{' '}
                <span className="font-semibold text-amber-300">
                  {score} 球
                </span>
              </p>


              <p>
                打ち返せなかった数：{' '}
                <span className="font-semibold text-rose-300">
                  {hits} 球
                </span>
              </p>


              <p>
                このブラウザでの自己ベスト：{' '}
                <span className="font-semibold text-emerald-300">
                  {bestScore} 球
                </span>
              </p>

            </div>


            {message && (

              <p className="text-xs text-slate-300 mt-2">
                {message}
              </p>

            )}


            <div className="mt-4 flex flex-wrap gap-3">

              <Link
                href="/tenipuri/meteor"
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400"
              >
                もう一度挑戦
              </Link>


              <Link
                href="/tenipuri"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                テニプリメニューへ戻る
              </Link>


              <Link
                href="/"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ホームへ戻る
              </Link>

            </div>

          </div>


          {!errorText && (

            <div className="max-w-3xl mx-auto">

              <TenipuriMeteorReview
                questions={
                  answerHistory
                }
              />

            </div>

          )}

        </div>

      </GameLayout>

    );
  }


  // =======================================================
  // ローディング
  // =======================================================

  if (
    status === 'loading'
  ) {

    return (

      <GameLayout>

        <div className="text-slate-100 text-sm">
          打球問題を読み込み中...
        </div>

      </GameLayout>

    );

  }


  // =======================================================
  // プレイ画面
  // =======================================================

  return (

    <GameLayout>

      {/* =================================================
          上部ステータス
      ================================================== */}

      <div className="w-full max-w-5xl mx-auto mt-2 mb-3 px-1 sm:px-2">

        <div className="flex items-center justify-between mb-1">

          <div className="flex flex-col">

            <span className="text-[11px] sm:text-xs text-white">
              残り時間
            </span>


            <span className="text-[11px] sm:text-xs text-slate-200">

              自己ベスト:{' '}

              <span className="font-semibold text-emerald-300">
                {bestScore}
              </span>

              球

            </span>

          </div>


          <div className="flex gap-3 items-center text-[11px] sm:text-xs text-white">

            <span>

              Score:{' '}

              <span className="font-semibold text-yellow-300">
                {score}
              </span>

            </span>


            <span>

              Miss:{' '}

              <span className="font-semibold text-red-300">
                {hits}
              </span>

            </span>

          </div>

        </div>


        {/* 全体タイムバー */}

        <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden border border-white/30 shadow-inner">

          <div
            className="h-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-500"
            style={{
              width:
                `${totalRatio(totalMs)}%`,
            }}
          />

        </div>

      </div>


      {/* =================================================
          テニスコート
      ================================================== */}

      <div
        className="relative w-full max-w-5xl mx-auto h-[calc(100dvh-105px)] min-h-[480px] max-h-[900px] overflow-hidden rounded-2xl border-2 border-white/40 shadow-2xl bg-cover bg-center"
        style={{
          backgroundImage:
            "url('/tenipuri/coat.png')",
        }}
      >

        {/* 暗幕 */}

        <div className="absolute inset-0 bg-black/10 pointer-events-none" />


        {/* =================================================
            ボール3個
        ================================================== */}

        <div className="absolute inset-0">

          {balls.map(
            (
              ball,
              index
            ) => {

              const problem =
                problems[
                  ball.problemIndex
                ];


              if (!problem) {
                return null;
              }


              const limitMs =
                Math.max(
                  MIN_BALL_TIME_MS,
                  getBallLimitMs(
                    problem
                  )
                );


              // ------------------------------------------------
              // 0～1
              //
              // 1 = 完全に奥
              // 0 = 一番手前
              // ------------------------------------------------

              const ratio =
                Math.max(
                  0,
                  Math.min(
                    1,
                    ball.remainingMs /
                      limitMs
                  )
                );


              // ------------------------------------------------
              // 接近度
              //
              // 開始時 = 0
              // 時間切れ = 1
              // ------------------------------------------------

              const distance =
                1 - ratio;


              // ------------------------------------------------
              // レーン
              // ------------------------------------------------

              const lanePositions = [
                '17%',
                '50%',
                '83%',
              ];


              const left =
                lanePositions[
                  index
                ];


              // ------------------------------------------------
              // サイズ
              //
              // 開始時はかなり小さい。
              // 手前に来ても適度な大きさまで。
              //
              // 元の w-72 = 288px を基準にして、
              // scale 0.28～0.72 にする。
              //
              // これで開始直後に巨大な球になるのを防ぐ。
              // ------------------------------------------------

              const scale =
                0.35 +
                distance * 0.12;


              // ------------------------------------------------
              // 奥→手前
              //
              // bottomを極端に動かさない。
              // これが「球が画面外に消える」問題の対策。
              // ------------------------------------------------

              const bottom =
                59 -
                distance * 30;


              const isReturning =
                !!ball.returning;


              return (

                <div
                  key={`${index}-${ball.problemIndex}`}
                  className="absolute pointer-events-none"
                  style={{
                    left,
                    bottom:
                      `${bottom}%`,
                    transform:
                      `translate3d(-50%, 50%, 0) scale(${scale})`,
                    transformOrigin:
                      'center center',
                    zIndex:
                      20 + index,
                    willChange:
                      'transform',
                    transition:
                      isReturning
                        ? 'transform 0.45s cubic-bezier(.15,.8,.25,1)'
                        : 'transform 0.25s linear, bottom 0.25s linear',
                  }}
                >

                  {/* =========================================
                      打ち返しエフェクト
                  ========================================== */}

                  {isReturning ? (

                    <div className="relative w-32 h-32">

                      <div className="absolute inset-0 rounded-full bg-white/90 blur-2xl animate-ping" />


                      <div className="absolute inset-[-35px] animate-ping">

                        <div className="absolute left-1/2 top-0 w-1 h-full bg-white/80 -translate-x-1/2 rotate-45" />

                        <div className="absolute left-1/2 top-0 w-1 h-full bg-yellow-200/80 -translate-x-1/2 -rotate-45" />

                        <div className="absolute top-1/2 left-0 h-1 w-full bg-white/80 -translate-y-1/2" />

                      </div>


                      <div className="absolute inset-4 rounded-full border-4 border-white bg-yellow-300 shadow-[0_0_45px_rgba(255,255,255,1)] animate-ping" />


                      <div className="absolute inset-0 flex items-center justify-center">

                        <span className="text-sm font-black text-white drop-shadow-lg">
                          NICE SHOT!
                        </span>

                      </div>

                    </div>

                  ) : (

                    <button
                      type="button"
                      className="pointer-events-auto relative w-72 h-72 rounded-full overflow-hidden border-4 border-yellow-200 bg-[#d9f000] shadow-[inset_-18px_-18px_30px_rgba(0,0,0,0.28),inset_12px_12px_20px_rgba(255,255,255,0.55),0_10px_25px_rgba(0,0,0,0.5)]"
                      onClick={() => {

                        setSelectedBall({
                          index:
                            index + 1,
                          problem,
                        });

                      }}
                    >

                      {/* =======================================
                          問題画像
                      ======================================== */}

                      <img
                        src={
                          problem.image_url
                        }
                        alt="打球問題"
                        draggable="false"
                        className="absolute inset-0 w-full h-full object-contain p-5"
                        style={{
                          backfaceVisibility:
                            'hidden',
                          WebkitBackfaceVisibility:
                            'hidden',
                        }}
                      />


                      {/* =======================================
                          テニスボールの白いカーブ
                      ======================================== */}

                      <div
                        className="pointer-events-none absolute -left-24 top-1/2 h-[130%] w-48 -translate-y-1/2 rounded-full border-[7px] border-white/90 opacity-90"
                        style={{
                          transform:
                            'translateY(-50%) rotate(-8deg)',
                        }}
                      />


                      <div
                        className="pointer-events-none absolute -right-24 top-1/2 h-[130%] w-48 -translate-y-1/2 rounded-full border-[7px] border-white/90 opacity-90"
                        style={{
                          transform:
                            'translateY(-50%) rotate(8deg)',
                        }}
                      />


                      {/* =======================================
                          問題文
                      ======================================== */}

                      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/75 border-2 border-white/70 px-4 py-2 shadow-lg whitespace-nowrap">

                        <p className="text-[16px] sm:text-xs font-black text-white">
                          {getQuestionText(problem)}
                        </p>

                      </div>


                      {/* =======================================
                          タップ説明
                      ======================================== */}

                      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 whitespace-nowrap">

                        <p className="text-[9px] font-bold text-white">
                          タップで画像を拡大
                        </p>

                      </div>

                    </button>

                  )}

                </div>

              );

            }
          )}

        </div>


        {/* =================================================
            入力エリア
        ================================================== */}

        <div className="absolute inset-x-0 bottom-3 sm:bottom-4 flex justify-center px-3 z-40">

          <div className="w-full max-w-xl">

            <div className="rounded-2xl bg-slate-950/90 border-2 border-white/40 shadow-2xl p-3 backdrop-blur-sm">

              <label className="block text-xs sm:text-sm font-bold text-white text-center mb-2">
                答えを入力して打ち返せ！
              </label>


              <div className="flex gap-2">

                <input
                  ref={inputRef}
                  type="text"
                  value={answerInput}
                  onChange={(e) =>
                    setAnswerInput(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {

                    if (
                      e.key === 'Enter'
                    ) {

                      e.preventDefault();

                      handleAnswer();

                    }

                  }}
                  onFocus={() => {

                    // iOSでfocus時にページを
                    // scrollIntoViewさせない。
                    //
                    // preventScroll対応ブラウザでは
                    // 明示的にフォーカスし直す。
                    requestAnimationFrame(() => {

                      inputRef.current?.focus({
                        preventScroll: true,
                      });

                    });

                  }}
                  placeholder="答えを入力"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="send"
                  className="flex-1 min-w-0 rounded-full border-2 border-white/40 bg-black/70 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:border-yellow-300"
                />


                <button
                  type="button"
                  onClick={
                    handleAnswer
                  }
                  className="shrink-0 px-5 py-2 rounded-full bg-yellow-400 text-black text-sm font-black shadow-lg hover:bg-yellow-300 active:scale-95 transition whitespace-nowrap"
                >
                  打ち返す！
                </button>

              </div>

            </div>

          </div>

        </div>

      </div>


      {/* =================================================
          メッセージ
      ================================================== */}

      {message && (

        <div className="mt-2 text-xs sm:text-sm font-bold text-white drop-shadow-lg min-h-[20px]">
          {message}
        </div>

      )}


      {/* =================================================
          画像拡大モーダル
      ================================================== */}

      {selectedBall && (

        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 px-3"
          onClick={() =>
            setSelectedBall(null)
          }
        >

          <div
            className="relative max-w-4xl w-full max-h-[90dvh] bg-slate-950 border-2 border-yellow-300 rounded-2xl p-3 shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="text-center mb-2">

              <p className="text-sm font-black text-yellow-300">
                {getQuestionText(
                  selectedBall.problem
                )}
              </p>

            </div>


            <div className="max-h-[75dvh] overflow-auto rounded-xl bg-black">

              <img
                src={
                  selectedBall
                    .problem
                    .image_url
                }
                alt="打球問題"
                draggable="false"
                className="block max-w-full h-auto mx-auto"
              />

            </div>


            <div className="mt-3 flex justify-center">

              <button
                type="button"
                onClick={() =>
                  setSelectedBall(
                    null
                  )
                }
                className="px-5 py-2 rounded-full bg-yellow-400 text-black text-sm font-bold hover:bg-yellow-300"
              >
                閉じる
              </button>

            </div>

          </div>

        </div>

      )}

    </GameLayout>
  );
}


// =========================================================
// タイムバー用
// =========================================================

function totalRatio(totalMs) {
  return (
    Math.max(
      0,
      Math.min(
        1,
        totalMs /
          TOTAL_TIME_MS
      )
    ) * 100
  );
}


// =========================================================
// レイアウト
// =========================================================

function GameLayout({
  children,
}) {

  return (

    <main className="tenipuri-nozoom min-h-[100dvh] h-[100dvh] bg-slate-950 text-white relative overflow-hidden">

      {/* ===================================================
          iOS入力ズーム防止
      =================================================== */}

      <style jsx global>{`

        html,
        body {
          overscroll-behavior: none;
        }

        .tenipuri-nozoom {
          overscroll-behavior: none;
          -webkit-overflow-scrolling: auto;
        }

        @media (max-width: 640px) {

          .tenipuri-nozoom input,
          .tenipuri-nozoom textarea,
          .tenipuri-nozoom select {
            font-size: 16px !important;
          }

          .tenipuri-nozoom {
            touch-action: manipulation;
          }

        }

      `}</style>


      <div className="relative z-10 flex flex-col items-center justify-start h-full pt-3 px-3">

        {/* =================================================
            ヘッダー
        ================================================== */}

        <header className="w-full max-w-5xl flex items-center justify-between mb-2 shrink-0">

          <h1 className="text-base sm:text-lg font-extrabold tracking-wide">
            打球打ち返しモード
          </h1>


          <Link
            href="/tenipuri"
            className="text-[11px] sm:text-xs font-bold text-yellow-200 underline underline-offset-2 hover:text-yellow-100"
          >
            テニプリへ戻る
          </Link>

        </header>


        {children}

      </div>

    </main>

  );
}

