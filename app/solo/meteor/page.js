// file: app/solo/meteor/page.js
'use client';

import GameLayout from '../GameLayout';
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

  const over = len - 15;
  const steps = Math.floor(over / 15);
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

  // 不備報告用の回答履歴
  const [answerHistory, setAnswerHistory] = useState([]);

  const totalRatio = Math.max(0, totalMs / TOTAL_TIME_MS);

  // 自己ベスト読み込み
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

  // 問題取得
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
        setAnswerHistory([]);
        setStatus('playing');

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

  // 終了時：自己ベスト更新 & 称号チェック
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

    // ★ サーバー側にスコアを送って称号付与チェック
    fetch('/api/solo/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'meteor',
        value: score,
      }),
    }).catch(() => {});
  }, [status, score, errorText]);

  // 全体タイマー & 各隕石タイマー
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questions.length || !slots.length) return;

    const id = setInterval(() => {
      setTotalMs((prev) => {
        const next = prev - 250;
        if (next <= 0) {
          clearInterval(id);
          setStatus('finished');
          return 0;
        }
        return next;
      });

      setSlots((prevSlots) => {
        if (!prevSlots.length) return prevSlots;

        const newSlots = prevSlots.map((slot) => ({ ...slot }));
        for (let i = 0; i < newSlots.length; i++) {
          const slot = newSlots[i];
          if (!slot) continue;

          if (slot.exploding) continue;

          const nextMs = slot.remainingMs - 250;
          if (nextMs <= 0) {
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

  const destroyMeteor = (slotIndex) => {
    const slot = slots[slotIndex];
    if (!slot) return;
    const q = questions[slot.questionIndex];

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

    setSlots((prevSlots) =>
      prevSlots.map((s, i) =>
        i === slotIndex ? { ...s, exploding: true } : s
      )
    );

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
    }, 350);

    setSelectedMeteor(null);
  };

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
      setMessage('砲撃は外れた…どの隕石にも当たらなかった。');
      setAnswerInput('');
    }

    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  if (status === 'finished') {
    return (
      <GameLayout>
        <div className="w-full max-w-5xl mx-auto px-3 pb-8 space-y-4">
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

  if (status === 'loading') {
    return (
      <GameLayout>
        <p className="text-slate-100 text-sm">問題を読み込み中...</p>
      </GameLayout>
    );
  }

  // 以下、プレイ中画面は元のまま（割愛せずにそのまま残して OK）
  // ……（ここはあなたの元コードをそのまま使ってください。上の useEffect だけ変えれば動きます）
}
