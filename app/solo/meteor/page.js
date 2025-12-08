// file: app/solo/meteor/page.js
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

// 全体プレイ時間 10分
const TOTAL_TIME_MS = 10 * 60 * 1000;
// 被弾ペナルティ（-30秒）
const HIT_PENALTY_MS = 30 * 1000;
// 画面に出す隕石の数
const METEOR_SLOTS = 3;

// 1個ごとの制限時間（答えの文字数で決める）
// ※ 最短 60 秒
function getMeteorLimitMs(q) {
  if (!q) return 60 * 1000;
  const len = (q.answerText || '').length;

  if (len <= 15) return 60 * 1000;

  // 16文字以上は 60秒 +（15文字ごとに +10秒）
  const over = len - 15;
  const steps = Math.floor(over / 15); // 16〜29 → 0, 30〜44 →1, ...
  const seconds = 60 + steps * 10;
  return seconds * 1000;
}

// 文字列のゆるい比較用
function normalize(str) {
  return (str || '').toString().trim().replace(/\s+/g, '').toLowerCase();
}

export default function MeteorSoloPage() {
  const [questions, setQuestions] = useState([]);

  // 各隕石スロットの状態 { questionIndex, remainingMs, exploding }
  const [slots, setSlots] = useState([]);

  const [totalMs, setTotalMs] = useState(TOTAL_TIME_MS);
  const [status, setStatus] = useState('loading'); // loading | playing | finished

  const [score, setScore] = useState(0); // 撃ち落とした数
  const [hits, setHits] = useState(0); // 被弾数
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState('');

  // 共通回答欄
  const [answerInput, setAnswerInput] = useState('');
  const inputRef = useRef(null);

  // 自己ベスト（localStorage 保存）
  const [bestScore, setBestScore] = useState(0);

  // 問題全文表示用モーダル
  const [selectedMeteor, setSelectedMeteor] = useState(null); // { text, index }

  // ★ 不備報告用の回答履歴（チャレンジと同じ形）
  const [answerHistory, setAnswerHistory] = useState([]);

  const totalRatio = Math.max(0, totalMs / TOTAL_TIME_MS);

  // ==== 自己ベスト読み込み ====
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('meteor_best_score');
      const n = raw ? Number(raw) : 0;
      if (!Number.isNaN(n) && n > 0) {
        setBestScore(n);
      }
    } catch {
      // 無視
    }
  }, []);

  // ==== 問題取得 ====
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await fetch('/api/solo/questions?mode=meteor', {
          cache: 'no-store',
        });
        const data = await res.json();

        if (!data.ok) {
          setErrorText('問題の取得に失敗しました。');
          setStatus('finished');
          return;
        }
        if (!data.questions || data.questions.length === 0) {
          setErrorText('使える問題がありません。');
          setStatus('finished');
          return;
        }

        setQuestions(data.questions);

        // スロット初期化（最大3つ）
        const count = Math.min(METEOR_SLOTS, data.questions.length);
        const initialSlots = [];
        for (let i = 0; i < count; i++) {
          const q = data.questions[i];
          initialSlots.push({
            questionIndex: i,
            remainingMs: getMeteorLimitMs(q),
            exploding: false,
          });
        }
        setSlots(initialSlots);

        setTotalMs(TOTAL_TIME_MS);
        setScore(0);
        setHits(0);
        setMessage('');
        setAnswerInput('');
        setAnswerHistory([]); // 初期化
        setStatus('playing');

        // 入力にフォーカス
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      } catch (e) {
        console.error('[meteor] fetch error', e);
        setErrorText('問題の取得に失敗しました。');
        setStatus('finished');
      }
    };

    fetchQuestions();
  }, []);

  // ==== 終了時に自己ベスト更新 ====
  useEffect(() => {
    if (status !== 'finished') return;
    if (errorText) return;

    setBestScore((prev) => {
      const next = score > prev ? score : prev;
      if (next > prev && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('meteor_best_score', String(next));
        } catch {
          // 無視
        }
      }
      return next;
    });
  }, [status, score, errorText]);

  // ==== 全体タイマー & 各隕石タイマー ====
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questions.length || !slots.length) return;

    const id = setInterval(() => {
      // 全体タイマー
      setTotalMs((prev) => {
        const next = prev - 250;
        if (next <= 0) {
          clearInterval(id);
          setStatus('finished');
          return 0;
        }
        return next;
      });

      // 各隕石の残り時間
      setSlots((prevSlots) => {
        if (!prevSlots.length) return prevSlots;

        const newSlots = prevSlots.map((slot) => ({ ...slot }));
        for (let i = 0; i < newSlots.length; i++) {
          const slot = newSlots[i];
          if (!slot) continue;

          // 爆発中の隕石は時間を減らさない
          if (slot.exploding) continue;

          const nextMs = slot.remainingMs - 250;
          if (nextMs <= 0) {
            // ★ タイムアップ → 被弾 & 履歴追加
            const q = questions[slot.questionIndex];
            if (q) {
              const qid =
                q.id ?? q.question_id ?? q.questionId ?? null;
              setAnswerHistory((prev) => [
                ...prev,
                {
                  question_id: qid,
                  text: q.text || q.question || '',
                  userAnswerText: '（時間切れ）',
                  correctAnswerText: String(q.answerText ?? ''),
                },
              ]);
            }

            setHits((h) => h + 1);
            setTotalMs((t) => {
              const nt = Math.max(0, t - HIT_PENALTY_MS);
              if (nt <= 0) {
                setStatus('finished');
              }
              return nt;
            });
            setMessage('隕石が直撃して残り時間 -30秒！');

            // 新しい問題に差し替え
            const qIndex = Math.floor(Math.random() * questions.length);
            const newQ = questions[qIndex];
            newSlots[i] = {
              questionIndex: qIndex,
              remainingMs: getMeteorLimitMs(newQ),
              exploding: false,
            };
          } else {
            newSlots[i].remainingMs = nextMs;
          }
        }
        return newSlots;
      });
    }, 250);

    return () => clearInterval(id);
  }, [status, questions, slots.length]);

  // ==== 隕石破壊（正解） ====
  // 爆発エフェクト → 少し待ってから新しい隕石に差し替え
  const destroyMeteor = (slotIndex) => {
    const slot = slots[slotIndex];
    if (!slot) return;
    const q = questions[slot.questionIndex];

    // ★ 履歴に追加（正解したとき）
    if (q) {
      const qid = q.id ?? q.question_id ?? q.questionId ?? null;
      setAnswerHistory((prev) => [
        ...prev,
        {
          question_id: qid,
          text: q.text || q.question || '',
          userAnswerText: answerInput || '（回答記録なし）',
          correctAnswerText: String(q.answerText ?? ''),
        },
      ]);
    }

    setScore((s) => s + 1);
    setMessage('命中！隕石を撃ち落とした！');

    // 爆発フラグを立てる
    setSlots((prevSlots) =>
      prevSlots.map((s, i) =>
        i === slotIndex ? { ...s, exploding: true } : s
      )
    );

    // 少し待ってから新しい問題に差し替え
    setTimeout(() => {
      setSlots((prevSlots) => {
        if (!prevSlots[slotIndex]) return prevSlots;

        const qIndex = Math.floor(Math.random() * questions.length);
        const newQ = questions[qIndex];
        const updated = [...prevSlots];
        updated[slotIndex] = {
          questionIndex: qIndex,
          remainingMs: getMeteorLimitMs(newQ),
          exploding: false,
        };
        return updated;
      });
    }, 350); // 0.35秒くらい爆発を見せる

    // モーダルでその隕石を見ていた場合は閉じる
    setSelectedMeteor(null);
  };

  // ==== 共通回答チェック ====
  const handleAnswer = () => {
    if (status !== 'playing') {
      inputRef.current?.focus();
      return;
    }
    const input = answerInput.trim();
    if (!input) {
      inputRef.current?.focus();
      return;
    }

    const nInput = normalize(input);
    let hitIndex = -1;

    slots.forEach((slot, idx) => {
      const q = questions[slot.questionIndex];
      if (!q) return;
      const base = q.answerText || '';
      const alts = Array.isArray(q.altAnswers) ? q.altAnswers : [];

      const isCorrect =
        normalize(base) === nInput ||
        alts.some((a) => normalize(a) === nInput);

      if (isCorrect && hitIndex === -1) {
        hitIndex = idx;
      }
    });

    if (hitIndex >= 0) {
      destroyMeteor(hitIndex);
      setAnswerInput('');
    } else {
      // 不正解 → ペナルティは無し、メッセージだけ
      setMessage('砲撃は外れた…どの隕石にも当たらなかった。');
      setAnswerInput('');
    }

    // 発射後に入力欄へフォーカスを戻す
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  // ==== 終了画面 ====
  if (status === 'finished') {
    return (
      <GameLayout>
        <div className="w-full max-w-5xl mx-auto px-3 pb-8 space-y-4">
          {/* 結果カード */}
          <div className="max-w-md mx-auto bg-slate-900/85 border border-slate-600 rounded-2xl shadow-xl p-4 sm:p-6 text-slate-50">
            <h2 className="text-lg sm:text-xl font-bold mb-2">
              隕石クラッシュ 結果
            </h2>

            {errorText ? (
              <p className="text-sm text-red-300 mb-2">{errorText}</p>
            ) : (
              <p className="text-sm text-slate-100 mb-3">
                10分間のチャレンジが終了しました。
              </p>
            )}

            <div className="space-y-1 text-sm">
              <p>
                撃ち落とした隕石：{' '}
                <span className="font-semibold text-amber-300">
                  {score} 個
                </span>
              </p>
              <p>
                被弾した回数：{' '}
                <span className="font-semibold text-rose-300">
                  {hits} 回
                </span>
              </p>
              <p>
                このブラウザでの自己ベスト：{' '}
                <span className="font-semibold text-emerald-300">
                  {bestScore} 個
                </span>
              </p>
            </div>

            {message && (
              <p className="text-xs text-slate-300 mt-2">{message}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/solo/meteor"
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-semibold hover:bg-sky-400"
              >
                もう一度挑戦
              </Link>
              <Link
                href="/solo"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ソロメニューへ戻る
              </Link>
              <Link
                href="/solo/meteor/rules"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ルールを見る
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ホームへ戻る
              </Link>
            </div>
          </div>

          {/* ★ 問題の振り返り & 不備報告 */}
          <div className="max-w-3xl mx-auto">
            <QuestionReviewAndReport
              questions={answerHistory}
              sourceMode="solo-meteor"
            />
          </div>
        </div>
      </GameLayout>
    );
  }

  // ==== ローディング ====
  if (status === 'loading') {
    return (
      <GameLayout>
        <p className="text-slate-100 text-sm">問題を読み込み中...</p>
      </GameLayout>
    );
  }

  // ==== プレイ中 ====
  return (
    <GameLayout>
      {/* 上部：残り時間バー & スコア表示（PC向け） */}
      <div className="w-full max-w-5xl mx-auto mt-2 mb-3 px-1 sm:px-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs text-slate-100">
              残り時間
            </span>
            <span className="text-[11px] sm:text-xs text-slate-200">
              自己ベスト:{' '}
              <span className="font-semibold text-emerald-300">
                {bestScore}
              </span>
              個
            </span>
          </div>
          <div className="flex gap-3 items-center text-[11px] sm:text-xs text-slate-100">
            <span>
              Score:{' '}
              <span className="font-semibold text-amber-200">
                {score}
              </span>
            </span>
            <span>
              Hits:{' '}
              <span className="font-semibold text-rose-200">
                {hits}
              </span>
            </span>
            <Link
              href="/solo/meteor/rules"
              className="px-2 py-1 rounded-full bg-slate-900/70 border border-slate-500 text-slate-100 hover:bg-slate-800"
            >
              ルール
            </Link>
          </div>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-600 shadow-inner hidden sm:block">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-rose-400 transition-[width] duration-200"
            style={{ width: `${totalRatio * 100}%` }}
          />
        </div>
      </div>

      {/* 隕石フィールド */}
      <div className="relative w-full max-w-5xl mx-auto h-[60vh] mt-1 sm:mt-3 border-x border-slate-700/60">
        {/* 隕石レーン（3本） */}
        <div className="absolute inset-0 flex">
          {slots.map((slot, i) => {
            const q = questions[slot.questionIndex];
            if (!q) return null;

            const limitMs = getMeteorLimitMs(q);
            const ratio = Math.max(0, slot.remainingMs / limitMs); // 1 → 上、0 → 下
            const topPercent = 10 + (1 - ratio) * 50; // 10〜60%の範囲で落ちる（距離短め）
            const isExploding = !!slot.exploding;

            const handleOpenFull = () => {
              if (!q) return;
              setSelectedMeteor({
                index: i + 1,
                text: q.text,
              });
            };

            return (
              <div
                key={i}
                className="relative flex-1 flex justify-center"
              >
                <div
                  className="absolute w-[88%] sm:w-4/5 max-w-md transition-transform duration-200"
                  style={{
                    top: `${topPercent}%`,
                    transform: 'translateY(-50%)',
                  }}
                >
                  <div className="relative flex justify-center">
                    {/* 爆発エフェクト中 */}
                    {isExploding ? (
                      <div className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-full bg-[radial-gradient(circle_at_50%_40%,#facc15_0,#ea580c_30%,#7f1d1d_65%,transparent_100%)] shadow-[0_0_45px_rgba(248,250,252,0.9)] animate-ping">
                        <div className="absolute inset-4 rounded-full border-4 border-amber-200/80" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs sm:text-sm font-extrabold text-white drop-shadow">
                            BOOM!
                          </span>
                        </div>
                      </div>
                    ) : (
                      // 通常の丸い隕石 + 四角い問題カード
                      <button
                        type="button"
                        onClick={handleOpenFull}
                        className="relative w-40 h-40 sm:w-52 sm:h-52 flex items-center justify-center focus:outline-none"
                      >
                        {/* 丸い隕石本体（大きめ） */}
                        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_20%_20%,#e5e7eb_0,#64748b_40%,#020617_80%)] shadow-[0_0_25px_rgba(15,23,42,0.95)] border border-slate-700">
                          {/* クレーター */}
                          <div className="absolute left-4 top-5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800/80 shadow-inner" />
                          <div className="absolute right-5 top-4 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900/80 shadow-inner" />
                          <div className="absolute left-10 bottom-5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900/80 shadow-inner" />
                        </div>

                        {/* 中央に四角い問題カード（高さは内容に合わせて可変・中身スクロール可） */}
                        <div className="relative z-10 w-[84%] max-h-[82%] overflow-y-auto bg-slate-950/90 rounded-xl border border-slate-500/80 px-3 py-2 flex flex-col">
                          <p className="text-[9px] text-amber-200 mb-1">
                            隕石 {i + 1} / 記述式
                          </p>
                          <p className="text-[10px] sm:text-xs font-semibold text-slate-50 whitespace-pre-wrap leading-snug">
                            {q.text}
                          </p>
                          <p className="mt-1 text-[9px] text-slate-400 text-right">
                            タップで全文表示
                          </p>
                        </div>
                      </button>
                    )}

                    {/* 軌跡の光 */}
                    <div className="absolute -z-10 inset-x-4 -top-2 h-7 bg-gradient-to-b from-amber-400/70 via-orange-500/40 to-transparent blur-lg opacity-80" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 自機（宇宙船）＋ 共通回答欄 */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 gap-2">
          {/* 宇宙船 */}
          <div className="relative w-24 h-16 sm:w-28 sm:h-18 mb-1">
            {/* 本体 */}
            <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-10 h-10 bg-slate-300 rounded-t-full rounded-b-[8px] shadow-[0_0_18px_rgba(148,163,184,0.9)]">
              <div className="absolute inset-1 bg-slate-900 rounded-t-full rounded-b-[6px]" />
            </div>
            {/* 翼 */}
            <div className="absolute left-1/2 bottom-1 -translate-x-1/2 flex w-16 justify-between">
              <div className="w-4 h-4 bg-slate-500 rounded-bl-2xl rounded-tr-lg shadow-[0_0_12px_rgba(148,163,184,0.9)]" />
              <div className="w-4 h-4 bg-slate-500 rounded-br-2xl rounded-tl-lg shadow-[0_0_12px_rgba(148,163,184,0.9)]" />
            </div>
            {/* エンジン光 */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-6 h-6 bg-gradient-to-b from-sky-300 via-sky-500 to-transparent blur-md opacity-80" />
          </div>

          {/* モバイル用ミニ残り時間バー（キーボード付近でも見えるように） */}
          <div className="w-full max-w-md px-3 mt-1 sm:hidden">
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-600 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-rose-400 transition-[width] duration-200"
                style={{ width: `${totalRatio * 100}%` }}
              />
            </div>
          </div>

          {/* 共通回答欄 */}
          <div className="w-full max-w-md px-3">
            <label className="block text-[11px] sm:text-xs text-slate-100 mb-1 text-center">
              回答欄：画面上のどれか1つの隕石の正解を入力すると撃ち落とせます
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAnswer();
                  }
                }}
                className="flex-1 rounded-full border border-slate-500 bg-slate-950/80 px-3 py-1.5 text-[11px] sm:text-xs text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                placeholder="ここに回答を入力（Enterで発射）"
              />
              <button
                type="button"
                onClick={handleAnswer}
                className="px-3 sm:px-4 py-1.5 rounded-full bg-sky-500 text-white text-[11px] sm:text-xs font-semibold hover:bg-sky-400 whitespace-nowrap"
              >
                発射
              </button>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="mt-2 text-[11px] sm:text-xs text-slate-100 drop-shadow">
          {message}
        </div>
      )}

      {/* 問題全文表示モーダル（タップ時） */}
      {selectedMeteor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-600 rounded-2xl shadow-xl p-4 text-slate-50">
            <h2 className="text-sm sm:text-base font-bold mb-2">
              隕石 {selectedMeteor.index} の問題
            </h2>
            <div className="max-h-[50vh] overflow-y-auto bg-slate-950/80 rounded-xl border border-slate-600 px-3 py-3">
              <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                {selectedMeteor.text}
              </p>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedMeteor(null)}
                className="px-3 py-1.5 rounded-full bg-sky-500 text-white text-xs sm:text-sm font-semibold hover:bg-sky-400"
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

function GameLayout({ children }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50 relative overflow-hidden">
      {/* 星っぽい背景 */}
      <div className="pointer-events-none absolute inset-0 opacity-70 mix-blend-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.3),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(129,140,248,0.4),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(248,250,252,0.25),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-start pt-3 px-3">
        <header className="w-full max-w-5xl flex items-center justify-between mb-1">
          <h1 className="text-base sm:text-lg font-extrabold tracking-wide">
            隕石クラッシュ（ソロ）
          </h1>
          <Link
            href="/"
            className="text-[11px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
          >
            ホームへ戻る
          </Link>
        </header>

        {children}
      </div>
    </main>
  );
}
