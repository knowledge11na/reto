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


// =========================================================
// ボールごとの制限時間
// =========================================================

function getBallLimitMs(problem) {
  if (!problem) {
    return MIN_BALL_TIME_MS;
  }

  // 問題文ではなく、答えの長さを参考にする
  const answer = String(
    problem.hitter ||
    problem.target ||
    ''
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
// 問題の答えを取得
// =========================================================

function getAnswer(problem) {
  if (!problem) return '';

  if (problem.answer_type === 'hitter') {
    return String(problem.hitter || '');
  }

  return String(problem.target || '');
}


// =========================================================
// 問題文
// =========================================================

function getQuestionText(problem) {
  if (!problem) return '';

  if (problem.answer_type === 'hitter') {
    return '誰が打った？';
  }

  return '誰に打った？';
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
// メイン
// =========================================================

export default function TenipuriMeteorPage() {

  const [problems, setProblems] = useState([]);

  /*
    ball:
    {
      problemIndex,
      remainingMs,
      returning
    }
  */

  const [balls, setBalls] = useState([]);

  const [totalMs, setTotalMs] =
    useState(TOTAL_TIME_MS);

  const [status, setStatus] =
    useState('loading');

  // loading | playing | finished

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


  const totalRatio =
    Math.max(
      0,
      totalMs / TOTAL_TIME_MS
    );


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
        raw ? Number(raw) : 0;

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

          const data =
            await res.json();

          if (!data.ok) {

            setErrorText(
              data.error ||
              '問題の取得に失敗しました。'
            );

            setStatus('finished');

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

            setStatus('finished');

            return;
          }


          setProblems(
            data.problems
          );


          // -----------------------------------------------
          // 最初の3球
          // -----------------------------------------------

          const count =
            Math.min(
              BALL_SLOTS,
              data.problems.length
            );

          const initialBalls = [];


          for (
            let i = 0;
            i < count;
            i++
          ) {

            const problem =
              data.problems[i];

            initialBalls.push({

              problemIndex: i,

              remainingMs:
                getBallLimitMs(
                  problem
                ),

              returning: false,

            });

          }


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

          setStatus('playing');


          setTimeout(() => {

            inputRef.current?.focus();

          }, 100);


        } catch (error) {

          console.error(
            '[tenipuri/meteor] fetch error:',
            error
          );

          setErrorText(
            '問題の取得に失敗しました。'
          );

          setStatus('finished');

        }

      };


    loadProblems();

  }, []);


  // =======================================================
  // 自己ベスト
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
  // タイマー
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

        // -------------------------------------------------
        // 全体タイマー
        // -------------------------------------------------

        setTotalMs((prev) => {

          const next =
            prev - 250;


          if (
            next <= 0
          ) {

            setStatus(
              'finished'
            );

            return 0;
          }


          return next;

        });


        // -------------------------------------------------
        // 各ボール
        // -------------------------------------------------

        setBalls((prevBalls) => {

          if (
            !prevBalls.length
          ) {
            return prevBalls;
          }


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


            // ---------------------------------------------
            // 打ち返しエフェクト中
            // ---------------------------------------------

            if (
              ball.returning
            ) {
              continue;
            }


            const nextMs =
              ball.remainingMs -
              250;


            if (
              nextMs <= 0
            ) {

              // -------------------------------------------
              // 時間切れ
              // -------------------------------------------

              const problem =
                problems[
                  ball.problemIndex
                ];


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


              // 被弾数
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


              setMessage(
                '打ち返せなかった！ 残り時間 -30秒！'
              );


              // -------------------------------------------
              // 新しい問題
              // -------------------------------------------

              const randomIndex =
                Math.floor(
                  Math.random() *
                    problems.length
                );


              const newProblem =
                problems[
                  randomIndex
                ];


              nextBalls[i] = {

                problemIndex:
                  randomIndex,

                remainingMs:
                  getBallLimitMs(
                    newProblem
                  ),

                returning: false,

              };


            } else {

              ball.remainingMs =
                nextMs;

            }

          }


          return nextBalls;

        });

      }, 250);


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
  // ボールを打ち返す
  // =======================================================

  const returnBall = (
    ballIndex,
    userAnswer
  ) => {

    const ball =
      balls[ballIndex];


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
    // 振り返り履歴
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


    setMessage(
      'ナイスショット！ 打球を打ち返した！'
    );


    // -----------------------------------------------------
    // 打ち返し状態
    // -----------------------------------------------------

    setBalls(
      (prevBalls) =>
        prevBalls.map(
          (
            ballItem,
            index
          ) =>
            index === ballIndex
              ? {
                  ...ballItem,
                  returning: true,
                }
              : ballItem
        )
    );


    // -----------------------------------------------------
    // 少し後に新しいボール
    // -----------------------------------------------------

    setTimeout(() => {

      setBalls(
        (prevBalls) => {

          if (
            !prevBalls[ballIndex]
          ) {
            return prevBalls;
          }


          const randomIndex =
            Math.floor(
              Math.random() *
                problems.length
            );


          const newProblem =
            problems[
              randomIndex
            ];


          const next =
            [...prevBalls];


          next[ballIndex] = {

            problemIndex:
              randomIndex,

            remainingMs:
              getBallLimitMs(
                newProblem
              ),

            returning: false,

          };


          return next;

        }
      );

    }, 500);


    setSelectedBall(null);

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


    let hitIndex = -1;


    // -----------------------------------------------------
    // 3球から一致するものを探す
    // -----------------------------------------------------

    for (
      let i = 0;
      i < balls.length;
      i++
    ) {

      const ball =
        balls[i];


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


      const isCorrect =
        normalize(answer) ===
        normalizedInput;


      if (isCorrect) {

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


      setAnswerInput('');

    }


    // -----------------------------------------------------
    // 不正解
    // -----------------------------------------------------

    else {

      setMessage(
        '空振り！ どのボールにも当たらなかった。'
      );


      setAnswerInput('');

    }


    setTimeout(() => {

      inputRef.current?.focus();

    }, 0);

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


          {/* =================================================
              結果
          ================================================== */}

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


          {/* =================================================
              問題振り返り
          ================================================== */}

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


      {/* ================================================
          上部ステータス
      ================================================= */}

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
            className="h-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-500 transition-[width] duration-200"
            style={{
              width:
                `${totalRatio * 100}%`,
            }}
          />

        </div>

      </div>


      {/* ================================================
          テニスコート
      ================================================= */}

      <div
        className="relative w-full max-w-5xl mx-auto h-[68vh] min-h-[520px] overflow-hidden rounded-2xl border-2 border-white/40 shadow-2xl bg-cover bg-center"
        style={{
          backgroundImage:
            "url('/tenipuri/coat.png')",
        }}
      >


        {/* 暗幕 */}

        <div className="absolute inset-0 bg-black/10 pointer-events-none" />


        {/* ============================================
            ボール3個
        ============================================= */}

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
                getBallLimitMs(
                  problem
                );


              const ratio =
                Math.max(
                  0,
                  Math.min(
                    1,
                    ball.remainingMs /
                      limitMs
                  )
                );


              /*
                ratio = 1
                  → 奥

                ratio = 0
                  → 手前
              */

              const distance =
                1 - ratio;


              // 3レーン

              const lanePositions = [
                '17%',
                '50%',
                '83%',
              ];


              const left =
                lanePositions[index];


              /*
                ボールを奥では小さく、
                手前では大きくする
              */

              const scale =
                0.45 +
                distance * 0.55;


              const bottom =
                66 -
                distance * 42;


              const isReturning =
                !!ball.returning;


              return (

                <div
                  key={index}
                  className="absolute pointer-events-none"
                  style={{
                    left,
                    bottom:
                      `${bottom}%`,
                    transform:
                      `translate(-50%, 50%) scale(${scale})`,
                    zIndex:
                      Math.floor(
                        distance * 100
                      ),
                    transition:
                      isReturning
                        ? 'all 0.45s cubic-bezier(.15,.8,.25,1)'
                        : 'transform 0.2s linear',
                  }}
                >


                  {/* ======================================
                      打ち返しエフェクト
                  ====================================== */}

                  {isReturning ? (

                    <div className="relative w-32 h-32">


                      {/* 光 */}

                      <div className="absolute inset-0 rounded-full bg-white/90 blur-2xl animate-ping" />


                      {/* 放射線 */}

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


                    /* ======================================
                       通常ボール
                    ====================================== */

                    <div className="relative w-24 h-24">


                      {/* ボールの影 */}

                      <div className="absolute left-2 top-3 w-20 h-20 rounded-full bg-black/30 blur-md" />


                      {/* テニスボール本体 */}

                      <div className="absolute inset-0 rounded-full bg-[#d9f000] border-4 border-yellow-200 shadow-[inset_-12px_-12px_18px_rgba(0,0,0,0.25),inset_8px_8px_14px_rgba(255,255,255,0.55),0_8px_18px_rgba(0,0,0,0.45)]">


                        {/* テニスボールの白いカーブ */}

                        <div
                          className="absolute inset-[8px] rounded-full border-[5px] border-white/90"
                          style={{
                            clipPath:
                              'polygon(0 0, 100% 0, 100% 46%, 0 46%)',
                          }}
                        />


                        <div
                          className="absolute inset-[8px] rounded-full border-[5px] border-white/90"
                          style={{
                            clipPath:
                              'polygon(0 54%, 100% 54%, 100% 100%, 0 100%)',
                          }}
                        />

                      </div>


                      {/* 問題カード */}

                      <button
                        type="button"
                        className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 sm:w-72"
                        onClick={() => {

                          setSelectedBall({

                            index:
                              index + 1,

                            problem,

                          });

                        }}
                      >

                        <div className="rounded-xl bg-slate-950/90 border-2 border-yellow-200/80 px-3 py-2 shadow-xl backdrop-blur-sm">


                          <p className="text-[11px] font-black text-yellow-300 mb-1">

                            {getQuestionText(
                              problem
                            )}

                          </p>


                          <div className="relative rounded-lg overflow-hidden bg-black/40 border border-white/20">

                            <img
                              src={
                                problem.image_url
                              }
                              alt="打球問題"
                              className="block w-full h-auto max-h-48 object-contain mx-auto"
                            />

                          </div>


                          <p className="mt-1 text-[9px] text-white/70">

                            タップで画像を拡大

                          </p>

                        </div>

                      </button>

                    </div>

                  )}

                </div>

              );

            }
          )}

        </div>


        {/* ============================================
            入力エリア
        ============================================= */}

        <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">

          <div className="w-full max-w-xl">

            <div className="rounded-2xl bg-slate-950/85 border-2 border-white/40 shadow-2xl p-3 backdrop-blur-sm">

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
                  placeholder="答えを入力"
                  className="flex-1 rounded-full border-2 border-white/40 bg-black/70 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-yellow-300 focus:border-yellow-300"
                />


                <button
                  type="button"
                  onClick={
                    handleAnswer
                  }
                  className="px-5 py-2 rounded-full bg-yellow-400 text-black text-sm font-black shadow-lg hover:bg-yellow-300 active:scale-95 transition whitespace-nowrap"
                >

                  打ち返す！

                </button>

              </div>

            </div>

          </div>

        </div>

      </div>


      {/* ================================================
          メッセージ
      ================================================= */}

      {message && (

        <div className="mt-2 text-xs sm:text-sm font-bold text-white drop-shadow-lg">

          {message}

        </div>

      )}


      {/* ================================================
          画像拡大モーダル
      ================================================= */}

      {selectedBall && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3"
          onClick={() =>
            setSelectedBall(null)
          }
        >

          <div
            className="relative max-w-4xl w-full max-h-[90vh] bg-slate-950 border-2 border-yellow-300 rounded-2xl p-3 shadow-2xl"
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


            <div className="max-h-[75vh] overflow-auto rounded-xl bg-black">

              <img
                src={
                  selectedBall
                    .problem
                    .image_url
                }
                alt="打球問題"
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
// レイアウト
// =========================================================

function GameLayout({
  children,
}) {

  return (

    <main className="tenipuri-nozoom min-h-screen bg-slate-950 text-white relative overflow-hidden">


      {/* iOS入力ズーム防止 */}

      <style jsx global>{`

        @media (max-width: 640px) {

          .tenipuri-nozoom input,
          .tenipuri-nozoom textarea,
          .tenipuri-nozoom select {

            font-size: 16px !important;

          }

        }

      `}</style>


      <div className="relative z-10 flex flex-col items-center justify-start pt-3 px-3">

        <header className="w-full max-w-5xl flex items-center justify-between mb-2">

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