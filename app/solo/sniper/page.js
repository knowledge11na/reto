// file: app/solo/sniper/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const TOTAL_TIME_MS = 3 * 60 * 1000; // 3分

// 背景画像のパス（public配下）
const BG_IMAGES = [
  '/solo_sniper/mati.png',
  '/solo_sniper/kouya.png',
  '/solo_sniper/sougen.png',
];

// 文字列ゆるめ比較
function norm(str) {
  return String(str ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 回答候補を「/」「、」「,」「／」で区切って配列化
function parseAnswerList(ans) {
  if (!ans) return [];
  try {
    const parsed = JSON.parse(ans);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v));
    }
  } catch {
    // 無視
  }
  return String(ans)
    .split(/[、,／/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// シャッフル
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 問題を内部形式に正規化
function normalizeQuestion(raw, idx) {
  const id = raw.id ?? raw.question_id ?? raw.questionId ?? idx;
  const text = raw.text || raw.question || raw.question_text || '';

  let options = Array.isArray(raw.options) ? [...raw.options] : [];
  let answerTexts = [];

  if (Array.isArray(raw.correctIndexes) && options.length > 0) {
    answerTexts = raw.correctIndexes
      .map((i) => options[i])
      .filter((v) => v != null)
      .map((v) => String(v));
  } else if (
    typeof raw.correctIndex === 'number' &&
    options[raw.correctIndex] != null
  ) {
    answerTexts = [String(raw.options[raw.correctIndex])];
  } else if (raw.answerText) {
    answerTexts = parseAnswerList(raw.answerText);
  } else if (raw.correct_answer) {
    answerTexts = parseAnswerList(raw.correct_answer);
  } else if (Array.isArray(raw.correctAnswers)) {
    answerTexts = raw.correctAnswers.map((v) => String(v));
  }

  if (answerTexts.length === 0 && options.length > 0) {
    answerTexts = [String(options[0])];
  }

  if (options.length === 0) {
    options = ['選択肢1', '選択肢2', '選択肢3', '選択肢4'];
  }

  const shuffled = shuffleArray(options);
  const correctOptions = shuffled.filter((opt) =>
    answerTexts.some((ans) => norm(ans) === norm(opt))
  );

  const correctAnswerText =
    correctOptions.join(' / ') || answerTexts.join(' / ');

  return {
    id,
    text,
    options: shuffled,
    correctOptions,
    correctAnswerText,
  };
}

export default function SniperSoloPage() {
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeMs, setTimeMs] = useState(TOTAL_TIME_MS);
  const [status, setStatus] = useState('loading'); // loading|playing|finished
  const [message, setMessage] = useState('');

  // 自己ベスト
  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // 銃・発砲エフェクト
  const [isFiring, setIsFiring] = useState(false);
  const [shotIndex, setShotIndex] = useState(null);

  // 背景画像
  const [bgImage, setBgImage] = useState(BG_IMAGES[0]);

  // 不備報告用
  const [answerHistory, setAnswerHistory] = useState([]);

  // 初期化
  useEffect(() => {
    // 背景をランダムに決定
    const idx = Math.floor(Math.random() * BG_IMAGES.length);
    setBgImage(BG_IMAGES[idx]);

    // ローカルの自己ベスト
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('sniper_best_score');
        const n = raw ? Number(raw) : 0;
        if (!Number.isNaN(n) && n > 0) setBestScore(n);
      } catch {
        // 無視
      }
    }

    const fetchQuestions = async () => {
      try {
        const res = await fetch('/api/solo/questions?mode=sniper', {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'failed');
        if (!data.questions || data.questions.length === 0) {
          setStatus('finished');
          setMessage('単一選択の問題がありません。');
          return;
        }

        const normalized = data.questions.map((q, i) =>
          normalizeQuestion(q, i)
        );
        setQuestions(normalized);
        setStatus('playing');
      } catch (e) {
        console.error(e);
        setStatus('finished');
        setMessage('問題の取得に失敗しました。');
      }
    };

    fetchQuestions();
  }, []);

  // タイマー
  useEffect(() => {
    if (status !== 'playing') return;
    const id = setInterval(() => {
      setTimeMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(id);
          setStatus('finished');
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  // 終了時ベスト更新（ローカル保存）
  useEffect(() => {
    if (status !== 'finished') return;
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem('sniper_best_score');
      const oldBest = raw ? Number(raw) : 0;
      if (Number.isNaN(oldBest) || score > oldBest) {
        window.localStorage.setItem('sniper_best_score', String(score));
        setBestScore(score);
        setIsNewRecord(score > 0);
      } else {
        setIsNewRecord(false);
        if (!Number.isNaN(oldBest)) setBestScore(oldBest);
      }
    } catch {
      // 無視
    }
  }, [status, score]);

  // ★ 終了時に称号チェックAPIを呼ぶ
  useEffect(() => {
    if (status !== 'finished') return;
    // スコア0なら送らなくてもいい（どっちでもOK）
    if (score <= 0) return;

    (async () => {
      try {
        await fetch('/api/titles/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sniperScore: score,
          }),
        });
      } catch {
        // 失敗してもゲームには影響させない
      }
    })();
  }, [status, score]);

  const current = questions[idx] || null;
  const remainingSec = Math.ceil(timeMs / 1000);
  const timeRatio = Math.max(0, timeMs / TOTAL_TIME_MS);

  const handleAnswer = (choiceIndex) => {
    if (!current || status !== 'playing') return;

    const chosen = current.options[choiceIndex];

    // 銃エフェクト
    setIsFiring(true);
    setShotIndex(choiceIndex);
    setTimeout(() => {
      setIsFiring(false);
      setShotIndex(null);
    }, 140);

    const isCorrect = current.correctOptions.some(
      (ans) => norm(ans) === norm(chosen)
    );

    setSelected(choiceIndex);

    // 不備報告用履歴
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: current.id,
        text: current.text || '',
        userAnswerText: chosen ?? '',
        correctAnswerText:
          current.correctAnswerText ||
          current.correctOptions.join(' / ') ||
          '',
      },
    ]);

    if (isCorrect) {
      setScore((s) => s + 1);
      setMessage('ヒット！正解を撃ち抜いた！');
      setTimeMs((prev) => Math.min(TOTAL_TIME_MS, prev + 2000));
    } else {
      setMistakes((m) => m + 1);
      setMessage('外した…');
      setTimeMs((prev) => Math.max(0, prev - 10000));
    }

    setTimeout(() => {
      setSelected(null);
      setIdx((prev) => (prev + 1) % questions.length);
      setMessage('');
    }, 700);
  };

  // ====== 画面分岐 ======

  if (status === 'loading') {
    return (
      <SoloLayout title="正答スナイパー（ソロ）">
        <p className="text-sm text-slate-800 bg-white/80 rounded-xl px-4 py-3 inline-block">
          問題を読み込み中...
        </p>
      </SoloLayout>
    );
  }

  if (status === 'finished') {
    return (
      <SoloLayout title="正答スナイパー（ソロ）">
        <div className="mt-4 max-w-md mx-auto bg-white/90 rounded-2xl shadow-lg border border-emerald-200 p-4 sm:p-6 space-y-3">
          <p className="text-lg font-semibold mb-1 text-emerald-900">
            結果
          </p>
          <p className="text-sm text-slate-900">
            正解数:{' '}
            <span className="font-bold text-emerald-700">
              {score}
            </span>{' '}
            問
          </p>
          <p className="text-sm text-slate-900">
            ミス:{' '}
            <span className="font-bold text-rose-600">
              {mistakes}
            </span>{' '}
            回
          </p>

          <div className="mt-2 border-t border-slate-200 pt-2 text-sm">
            <p className="text-slate-800">
              このブラウザでの最高記録:{' '}
              <span className="font-bold text-emerald-700">
                {bestScore}
              </span>{' '}
              問
            </p>
            {isNewRecord && (
              <p className="text-xs text-emerald-600 mt-1 font-semibold">
                🎉 自己ベスト更新！
              </p>
            )}
          </div>

          {message && (
            <p className="text-xs text-slate-700 mt-1">{message}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
           <button
  type="button"
  onClick={() => {
    // 同じページへの Link だとリセットされないことがあるので、強制リロード
    window.location.href = `/solo/sniper?restart=${Date.now()}`;
  }}
  className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
>
  もう一度プレイ
</button>
            <Link
              href="/solo"
              className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              ソロメニューへ戻る
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>

        <div className="mt-6 max-w-3xl mx-auto">
          <QuestionReviewAndReport
            questions={answerHistory}
            sourceMode="solo-sniper"
          />
        </div>
      </SoloLayout>
    );
  }

  const timeColor =
    remainingSec <= 10
      ? 'text-red-600'
      : remainingSec <= 30
      ? 'text-amber-600'
      : 'text-emerald-700';

  // ====== プレイ画面 ======

  return (
    <SoloLayout title="正答スナイパー（ソロ）">
      {/* 高さ固定：スマホでも潰れすぎないようにする */}
      <div
        className="relative w-full max-w-3xl mx-auto mt-2 h-[440px] sm:h-[520px] rounded-2xl overflow-hidden border border-slate-300 shadow-lg"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* うっすら暗くして文字を読みやすく */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent pointer-events-none" />

        {/* 銃から奥に飛ぶビーム（FPSっぽさ用） */}
        {isFiring && (
          <div className="pointer-events-none absolute left-1/2 bottom-[95px] -translate-x-1/2 w-[3px] sm:w-[4px] h-[55%] bg-gradient-to-t from-amber-300 via-yellow-200 to-transparent opacity-80 blur-[1px]" />
        )}

        {/* コンテンツレイヤー */}
        <div className="relative z-10 flex flex-col h-full">
          {/* HUD（時間 + スコア + 自己ベスト） */}
          <div className="px-3 pt-2">
            <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-3 py-2 sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold text-slate-600">
                    時間
                  </p>
                  <p
                    className={`text-sm font-bold ${
                      timeColor === 'text-red-600'
                        ? 'text-red-600'
                        : timeColor === 'text-amber-600'
                        ? 'text-amber-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    {remainingSec} 秒
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-700">
                  <p>
                    スコア:{' '}
                    <span className="font-bold text-emerald-700">
                      {score}
                    </span>
                    問
                  </p>
                  <p>
                    ミス:{' '}
                    <span className="font-semibold text-rose-600">
                      {mistakes}
                    </span>
                    回
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    自己ベスト:{' '}
                    <span className="font-semibold text-emerald-700">
                      {bestScore}
                    </span>
                    問
                  </p>
                </div>
              </div>
              <div className="mt-2 w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-rose-400 transition-[width] duration-200"
                  style={{ width: `${timeRatio * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* 中央：問題＆的エリア */}
          <div className="flex-1 px-3 py-2 flex flex-col items-center">
            {current && (
              <div className="w-full max-w-xl flex flex-col gap-3">
                {/* 問題パネル */}
                <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-3 py-2">
                  <p className="text-[11px] text-slate-500 mb-1">問題</p>
                  <p className="text-xs sm:text-sm font-medium text-slate-900 whitespace-pre-wrap">
                    {current.text}
                  </p>
                </div>

                {/* 的（選択肢）グリッド */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {current.options.map((opt, i) => {
                    const isSelected = selected === i;
                    const isCorrectOpt = current.correctOptions.some(
                      (ans) => norm(ans) === norm(opt)
                    );
                    const isHitCorrect = isSelected && isCorrectOpt;
                    const isHitWrong = isSelected && !isCorrectOpt;
                    const isShot = shotIndex === i && isFiring;

                    let baseBg = 'bg-blue-500';
                    let baseBorder = 'border-blue-700';
                    let baseText = 'text-slate-50';
                    let extra = 'shadow-md';

                    if (isHitCorrect) {
                      baseBg = 'bg-emerald-500';
                      baseBorder = 'border-emerald-700';
                      extra = 'shadow-lg scale-95';
                    } else if (isHitWrong) {
                      baseBg = 'bg-red-500';
                      baseBorder = 'border-red-700';
                      extra = 'shadow-lg scale-95';
                    } else if (isShot) {
                      extra = 'shadow-lg scale-95';
                    }

                    return (
                      <button
                        key={i}
                        disabled={selected != null}
                        onClick={() => handleAnswer(i)}
                        className={`relative h-14 sm:h-16 rounded-xl border ${baseBg} ${baseBorder} ${baseText} text-[11px] sm:text-sm font-semibold flex items-center justify-center transition transform hover:-translate-y-0.5 disabled:opacity-80 ${extra}`}
                      >
                        {/* 的の枠 */}
                        <span className="absolute inset-1 rounded-lg border border-white/40 pointer-events-none" />

                        {/* 正解: 星 + 赤丸 */}
                        {isHitCorrect && (
                          <>
                            <span className="absolute text-2xl sm:text-3xl text-red-600">
                              ★
                            </span>
                            <span className="absolute w-10 h-10 sm:w-12 sm:h-12 rounded-full border-[3px] border-red-500" />
                          </>
                        )}

                        {/* 不正解: 星 + バツ */}
                        {isHitWrong && (
                          <>
                            <span className="absolute text-2xl sm:text-3xl text-red-600">
                              ★
                            </span>
                            <span className="absolute w-9 h-[3px] sm:w-10 sm:h-[4px] bg-slate-900/80 rotate-45 rounded-full" />
                            <span className="absolute w-9 h-[3px] sm:w-10 sm:h-[4px] bg-slate-900/80 -rotate-45 rounded-full" />
                          </>
                        )}

                        {/* 発砲直後フラッシュ */}
                        {isShot && !isHitCorrect && !isHitWrong && (
                          <span className="absolute w-6 h-6 rounded-full bg-amber-300/80 blur-[1px] shadow-md" />
                        )}

                        <span className="relative px-2 text-center leading-snug">
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 下部：銃エリア（選択肢と重ならないよう高さ少なめ） */}
          <div className="relative h-[90px] sm:h-[100px] flex items-end justify-center pb-1">
            <Gun isFiring={isFiring} />
          </div>
        </div>
      </div>

      {message && (
        <p className="mt-3 text-xs text-slate-800 text-center min-h-[1.5rem]">
          {message}
        </p>
      )}

      <div className="mt-2 text-center">
        <Link
          href="/"
          className="text-[11px] text-sky-700 hover:underline"
        >
          ホームへ戻る
        </Link>
      </div>
    </SoloLayout>
  );
}

// ===== 銃画像（一人称視点 / フリントロック画像をそのまま表示） =====

function Gun({ isFiring }) {
  return (
    <div className="relative w-16 h-20 sm:w-20 sm:h-24 flex items-end justify-center pointer-events-none">
      {/* 銃本体 */}
      <img
        src="/solo_sniper/gun.png"
        alt="gun"
        className={`h-full w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.6)] transition-transform duration-100 ${
          isFiring ? '-translate-y-1' : ''
        }`}
      />

      {/* マズルフラッシュ（銃口の少し先だけ光らせる） */}
      {isFiring && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-6 h-8 bg-gradient-to-t from-amber-300 via-yellow-200 to-transparent rounded-t-full blur-[1px] opacity-90 pointer-events-none" />
      )}
    </div>
  );
}

// ===== レイアウト =====

function SoloLayout({ title, children }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-100 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          <Link
            href="/"
            className="text-xs text-sky-700 hover:underline"
          >
            ホームへ戻る
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}
