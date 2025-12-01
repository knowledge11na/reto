// app/rate-battle/page.js
'use client';

import { Suspense } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io from 'socket.io-client';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

let socket;

const PER_QUESTION_BASE = 15000; // 15秒ベース
const EXTRA_PER_10CHARS = 10000; // 10文字ごと +10秒

function ReteBattlePageInner() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room');
  const router = useRouter();

  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState([]);

  // ★ 追加：不備報告用に、各問題の履歴を保存
  const [answerHistory, setAnswerHistory] = useState([]);

  const currentQuestion = questions[index];

  const addLog = (msg) => {
    setLog((prev) => [...prev, msg]);
  };

  // タイマー計算
  const calcTimeForQuestion = (q) => {
    if (!q) return 20000;
    // 選択肢 or 複数選択 → 25秒
    if (q.type === 'choice' || q.type === 'multi') return 25000;
    if (q.type === 'ordering') return 25000;
    // 記述
    const len = (q.answer || '').length;
    const extra =
      len > 10 ? Math.floor((len - 1) / 10) * EXTRA_PER_10CHARS : 0;
    return PER_QUESTION_BASE + extra;
  };

  // ソケット初期化
  useEffect(() => {
    if (!roomId) return;
if (!socket) {
  const SOCKET_URL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
  });
}


    socket.on('connect', () => {
      console.log('battle socket connected', socket.id);
    });

    socket.on('rate:result-finalized', (payload) => {
      setResult(payload);
      setFinished(true);
      setSending(false);
    });

    socket.on('rate:result-waiting', () => {
      setSending(true);
      addLog('相手の結果送信待ちです…');
    });

    socket.on('rate:error', (payload) => {
      setSending(false);
      addLog(payload?.message || 'エラーが発生しました');
    });

    return () => {
      if (socket) {
        socket.off('rate:result-finalized');
        socket.off('rate:result-waiting');
        socket.off('rate:error');
      }
    };
  }, [roomId]);

  // 問題取得
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await fetch('/api/questions');
        const data = await res.json();
        // ランダムに最大 30問
        const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 30);
        setQuestions(
          shuffled.map((q) => ({
            ...q,
            options: Array.isArray(q.options)
              ? shuffle(q.options)
              : JSON.parse(q.options || '[]').sort(
                  () => Math.random() - 0.5
                ),
          }))
        );
      } catch (e) {
        console.error(e);
      }
    };
    fetchQuestions();
  }, []);

  // タイマー
  useEffect(() => {
    if (!currentQuestion || finished) return;

    const limit = calcTimeForQuestion(currentQuestion);
    setTimeLeft(limit);

    let last = performance.now();

    const frame = (now) => {
      const dt = now - last;
      last = now;
      setTimeLeft((prev) => {
        const next = prev - dt;
        if (next <= 0) {
          handleTimeout(limit);
          return 0;
        }
        return next;
      });
      if (!finished && currentQuestion === questions[index]) {
        requestAnimationFrame(frame);
      }
    };

    const id = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, currentQuestion, finished]);

  const handleTimeout = (used) => {
    if (!currentQuestion || finished) return;
    addLog(`時間切れ: ${(used / 1000).toFixed(1)}秒使用`);
    setTotalTime((t) => t + used);

    // ★ 不備報告用履歴に追加（時間切れ扱い）
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: currentQuestion.id,
        text: currentQuestion.question || '',
        userAnswerText: '（時間切れ）',
        correctAnswerText: currentQuestion.answer || '',
      },
    ]);

    goNext();
  };

  const handleAnswer = (option) => {
    if (!currentQuestion || finished) return;
    const used = calcTimeForQuestion(currentQuestion) - timeLeft;
    const correct = option === currentQuestion.answer;
    if (correct) {
      setScore((s) => s + 1);
    }
    setTotalTime((t) => t + used);

    // ★ 不備報告用履歴に追加（プレイヤー回答付き）
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: currentQuestion.id,
        text: currentQuestion.question || '',
        userAnswerText: option,
        correctAnswerText: currentQuestion.answer || '',
      },
    ]);

    goNext();
  };

  const goNext = () => {
    if (index + 1 >= questions.length) {
      finishBattle();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const finishBattle = () => {
    setFinished(true);
    if (!socket || !roomId) return;
    setSending(true);
    socket.emit('rate:submit-result', {
      roomId,
      score,
      totalTimeMs: Math.round(totalTime),
    });
  };

  const timeDisplay = useMemo(() => {
    return (timeLeft / 1000).toFixed(1);
  }, [timeLeft]);

  if (!roomId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sky-50">
        <div className="bg-white rounded-2xl shadow px-6 py-4">
          <p className="mb-2">ルームIDがありません。</p>
          <button
            className="px-4 py-2 rounded-full bg-sky-500 text-white"
            onClick={() => router.push('/rate-match')}
          >
            マッチングへ戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-sky-50 text-slate-900">
      <header className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sky-300 rounded-full" />
          <span className="font-bold text-lg">レート戦</span>
        </div>
        <span className="text-xs text-slate-500">room: {roomId}</span>
      </header>

      {!finished && currentQuestion && (
        <section className="flex-1 flex flex-col px-4 pb-4 gap-3">
          <div className="bg-white rounded-xl shadow p-3 space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>
                {index + 1}問目 / {questions.length}問
              </span>
              <span>スコア: {score}</span>
            </div>

            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-sky-500 transition-all"
                style={{
                  width: `${
                    (timeLeft / calcTimeForQuestion(currentQuestion)) * 100
                  }%`,
                }}
              />
            </div>
            <div className="text-right text-sm font-mono text-slate-600">
              残り {timeDisplay} 秒
            </div>

            <p className="mt-2 text-sm whitespace-pre-wrap">
              {currentQuestion.question}
            </p>
          </div>

          <div className="space-y-2">
            {currentQuestion.options &&
              currentQuestion.options.map((opt) => (
                <button
                  key={opt}
                  className="w-full text-left px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
                  onClick={() => handleAnswer(opt)}
                >
                  {opt}
                </button>
              ))}
          </div>
        </section>
      )}

      {finished && (
        <section className="flex-1 flex flex-col items-center justify-center px-4">
          {!result && (
            <div className="bg-white rounded-2xl shadow p-4 w-full max-w-md text-center space-y-3">
              <p className="text-lg font-bold">結果送信中…</p>
              <p className="text-sm text-slate-500">
                相手の結果を待っています。
              </p>
            </div>
          )}

          {result && (
            <div className="w-full max-w-md space-y-4">
              <div className="bg-white rounded-2xl shadow p-4 text-center space-y-3">
                <p className="text-xs text-slate-500 mb-1">対戦結果</p>
                <p className="text-xl font-bold">
                  {result.isDraw
                    ? 'DRAW'
                    : result.winnerId && result.ratingDiff >= 0
                    ? 'WIN'
                    : 'LOSE'}
                </p>
                <p className="text-sm">
                  あなた: {result.myScore} / 相手: {result.oppScore}
                </p>
                <p className="text-sm">
                  レート変動: {result.ratingDiff > 0 ? '+' : ''}
                  {result.ratingDiff}（新レート: {result.newRating}）
                </p>

                <div className="flex gap-2 justify-center mt-3">
                  <button
                    className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm"
                    onClick={() => router.push('/rate-match')}
                  >
                    もう一度レート戦
                  </button>
                  <button
                    className="px-4 py-2 rounded-full border border-slate-300 text-sm"
                    onClick={() => router.push('/ranking')}
                  >
                    ランキングを見る
                  </button>
                </div>
              </div>

              {/* ★ 不備報告コンポーネント */}
              <QuestionReviewAndReport
                questions={answerHistory}
                sourceMode="rate"
              />
            </div>
          )}
        </section>
      )}

      {log.length > 0 && (
        <section className="px-4 pb-2">
          <details className="text-xs text-slate-500">
            <summary>ログ</summary>
            <ul className="mt-1 space-y-0.5">
              {log.map((l, i) => (
                <li key={i}>・{l}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </main>
  );
}

// 外側ラッパ（Suspense で包む default export）
export default function RateBattlePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-sky-50 text-slate-900">
          <div className="bg-white rounded-2xl shadow px-6 py-4 text-center">
            レート戦画面を読み込み中…
          </div>
        </main>
      }
    >
      <ReteBattlePageInner />
    </Suspense>
  );
}

// 配列シャッフル
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
