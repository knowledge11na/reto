// file: app/solo/balloon/play/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const TOTAL_TIME_MS = 10 * 60 * 1000;

const BALLOON_LIFE_MS = 60 * 1000;
const ESCAPE_PENALTY_MS = 20 * 1000;

const BALLOON_SLOTS = 5;
const SPAWN_DELAY_MS = 2000;
const POP_MS = 520;

// ★ 5レーン固定（端っこはみ出し防止で内側へ寄せる）
const LANE_X = [16, 34, 50, 66, 84];

// ===== 判定ルール =====
function stripParens(s) {
  return (s || '').toString().replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
}
function normalizeLoose(s) {
  return stripParens(s)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(
      /[・、，,./／\u30fb\u3001\u3002\-ー―—_~!！?？:：;；"'“”‘’\[\]{}()（）<>＜＞@#＃$％%^&＆*＋+=|｜\\]/g,
      ''
    );
}
function splitAnswersLoose(s) {
  const base = stripParens(s || '').trim();
  if (!base) return [];
  const parts = base
    .split(/[・、，,\/／]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : [base];
}
function isCorrectLoose(answerText, userInput) {
  const inN = normalizeLoose(userInput);
  if (!inN) return false;

  const parts = splitAnswersLoose(answerText).map(normalizeLoose).filter(Boolean);
  if (!parts.length) return false;

  if (parts.length === 1) {
    const a = parts[0];
    return a === inN || a.includes(inN) || inN.includes(a);
  }

  for (const p of parts) {
    if (!(inN.includes(p) || p.includes(inN))) return false;
  }
  return true;
}

// 身長/年齢/懸賞金：数字以外無視
function digitsOnly(s) {
  return stripParens(s).toString().replace(/[^\d]/g, '');
}
function splitAnswersDigits(s) {
  const base = stripParens(s || '').trim();
  if (!base) return [];
  const rawParts = base
    .split(/[・、，,\/／\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const parts = rawParts.map(digitsOnly).filter(Boolean);
  return parts.length ? parts : [digitsOnly(base)].filter(Boolean);
}
function isCorrectDigits(answerText, userInput) {
  const inD = digitsOnly(userInput);
  if (!inD) return false;

  const parts = splitAnswersDigits(answerText);
  if (!parts.length) return false;

  if (parts.length === 1) {
    const a = parts[0];
    return a === inD || a.includes(inD) || inD.includes(a);
  }

  for (const p of parts) {
    if (!(inD.includes(p) || p.includes(inD))) return false;
  }
  return true;
}

// other のうち「船」だけ中黒厳密（半角/全角は同一扱い）
function normalizeShipStrict(s) {
  return stripParens(s)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[･·]/g, '・') // 半角中黒っぽいのも全角に寄せる
    // 中黒「・」は残す。それ以外の記号は消す
    .replace(
      /[、，,./／\u3001\u3002\-ー―—_~!！?？:：;；"'“”‘’\[\]{}()（）<>＜＞@#＃$％%^&＆*＋+=|｜\\]/g,
      ''
    );
}
function isCorrectShipStrict(answerText, userInput) {
  const a = normalizeShipStrict(answerText);
  const b = normalizeShipStrict(userInput);
  if (!a || !b) return false;
  return a === b;
}

function modeLabel(mode) {
  if (mode === 'food') return '好物';
  if (mode === 'height') return '身長';
  if (mode === 'age') return '年齢';
  if (mode === 'bounty') return '懸賞金';
  if (mode === 'other') return '趣味その他';
  return '好物';
}
function isNumberMode(mode) {
  return mode === 'height' || mode === 'age' || mode === 'bounty';
}

// ===== 風船カラー =====
const BALLOON_COLORS = ['pink', 'sky', 'lime', 'yellow', 'purple'];

function balloonStyle(colorKey) {
  const map = {
    pink: {
      balloon:
        'radial-gradient(circle at 35% 25%, rgba(255,255,255,.95), rgba(255,140,200,.95), rgba(219,39,119,.95))',
      labelBg: 'rgba(255,255,255,.92)',
      labelBorder: 'rgba(251,113,133,.35)',
    },
    sky: {
      balloon:
        'radial-gradient(circle at 35% 25%, rgba(255,255,255,.95), rgba(125,211,252,.95), rgba(14,165,233,.95))',
      labelBg: 'rgba(255,255,255,.92)',
      labelBorder: 'rgba(56,189,248,.35)',
    },
    lime: {
      balloon:
        'radial-gradient(circle at 35% 25%, rgba(255,255,255,.95), rgba(190,242,100,.95), rgba(132,204,22,.95))',
      labelBg: 'rgba(255,255,255,.92)',
      labelBorder: 'rgba(163,230,53,.35)',
    },
    yellow: {
      balloon:
        'radial-gradient(circle at 35% 25%, rgba(255,255,255,.95), rgba(253,224,71,.95), rgba(234,179,8,.95))',
      labelBg: 'rgba(255,255,255,.92)',
      labelBorder: 'rgba(250,204,21,.40)',
    },
    purple: {
      balloon:
        'radial-gradient(circle at 35% 25%, rgba(255,255,255,.95), rgba(216,180,254,.95), rgba(168,85,247,.95))',
      labelBg: 'rgba(255,255,255,.92)',
      labelBorder: 'rgba(196,181,253,.40)',
    },
  };
  return map[colorKey] || map.pink;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function BalloonPlayPage() {
  // mode は useSearchParams 使わず window から読む
  const [mode, setMode] = useState('food');

  const [questions, setQuestions] = useState([]);
  const questionsRef = useRef([]);
  useEffect(() => {
    questionsRef.current = Array.isArray(questions) ? questions : [];
  }, [questions]);

  // ★ fetchレース対策：最新リクエストだけ反映
  const reqSeqRef = useRef(0);

  /**
   * slot:
   * - active
   * - pending
   * - questionIndex
   * - remainingMs
   * - popping
   * - colorKey
   */
  const [slots, setSlots] = useState([]);

  const [totalMs, setTotalMs] = useState(TOTAL_TIME_MS);
  const [status, setStatus] = useState('loading');

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [score, setScore] = useState(0);
  const [escapes, setEscapes] = useState(0);
  const [message, setMessage] = useState('');
  const [errorText, setErrorText] = useState('');

  const [answerInput, setAnswerInput] = useState('');
  const inputRef = useRef(null);

  // 自己ベスト（modeごと）
  const bestKey = useMemo(() => `balloon_best_${mode}`, [mode]);
  const [bestScore, setBestScore] = useState(0);

  // モーダル
  const [selectedBalloon, setSelectedBalloon] = useState(null);

  // 不備報告用
  const [answerHistory, setAnswerHistory] = useState([]);

  const totalRatio = Math.max(0, totalMs / TOTAL_TIME_MS);

  // mode 初期化
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setMode((sp.get('mode') || 'food').toString());
  }, []);

  // 自己ベスト読み込み
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(bestKey);
      const n = raw ? Number(raw) : 0;
      if (!Number.isNaN(n) && n > 0) setBestScore(n);
    } catch {}
  }, [bestKey]);

  // ===== レーン(スロット)に1個出す：他のレーンは絶対触らない =====
  const spawnBalloon = (slotIndex) => {
    const qs = questionsRef.current || [];
    if (!qs.length) return;

    const qIndex = Math.floor(Math.random() * qs.length);
    const colorKey = pick(BALLOON_COLORS);

    setSlots((prev) => {
      const next = [...prev];
      const cur = next[slotIndex] || {};

      // ★ 既にactive/poppingなら上書きしない
      if (cur.active || cur.popping) return prev;

      next[slotIndex] = {
        ...cur,
        active: true,
        pending: false,
        questionIndex: qIndex,
        remainingMs: BALLOON_LIFE_MS,
        popping: false,
        colorKey,
      };
      return next;
    });
  };

  const spawnWithDelay = (slotIndex, delayMs) => {
    setSlots((prev) => {
      const next = [...prev];
      const cur = next[slotIndex] || {};
      if (cur.active || cur.popping) return prev;
      next[slotIndex] = { ...cur, active: false, pending: true, popping: false };
      return next;
    });

    setTimeout(() => {
      if (statusRef.current !== 'playing') return;
      spawnBalloon(slotIndex);
    }, delayMs);
  };

  // 問題取得（★レース対策込み）
  useEffect(() => {
    if (!mode) return;

    const mySeq = ++reqSeqRef.current;

    const fetchQuestions = async () => {
      try {
        setStatus('loading');
        statusRef.current = 'loading';
        setErrorText('');
        setMessage('');

        const res = await fetch(`/api/solo/balloon-questions?mode=${encodeURIComponent(mode)}`, {
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));

        // ★ 古いリクエストの返りは捨てる
        if (mySeq !== reqSeqRef.current) return;

        if (!res.ok || !data.ok) {
          setErrorText(data.error || '問題の取得に失敗しました。');
          setStatus('finished');
          statusRef.current = 'finished';
          return;
        }
        if (!data.questions || data.questions.length === 0) {
          setErrorText('使える問題がありません。');
          setStatus('finished');
          statusRef.current = 'finished';
          return;
        }

        // ★ APIが返すmodeが違ったら捨てる（保険）
        if (String(data.mode || '') && String(data.mode) !== String(mode)) return;

        const qs = data.questions;
        setQuestions(qs);
        questionsRef.current = qs;

        // 5レーン固定：初期は空
        const initial = Array.from({ length: BALLOON_SLOTS }).map(() => ({
          active: false,
          pending: false,
          questionIndex: -1,
          remainingMs: BALLOON_LIFE_MS,
          popping: false,
          colorKey: 'pink',
        }));
        setSlots(initial);

        setTotalMs(TOTAL_TIME_MS);
        setScore(0);
        setEscapes(0);
        setAnswerInput('');
        setAnswerHistory([]);
        setSelectedBalloon(null);

        setStatus('playing');
        statusRef.current = 'playing';

        // ★ 開幕：即1個 + 残りは2秒ずつ
        const first = Math.floor(Math.random() * BALLOON_SLOTS);
        setTimeout(() => {
          if (statusRef.current !== 'playing') return;
          // ★ もしこの時点で別modeに変わってたら捨てる（超保険）
          if (mySeq !== reqSeqRef.current) return;

          spawnBalloon(first);
          let k = 1;
          for (let i = 0; i < BALLOON_SLOTS; i++) {
            if (i === first) continue;
            spawnWithDelay(i, SPAWN_DELAY_MS * k);
            k++;
          }
        }, 0);

        setTimeout(() => inputRef.current?.focus(), 0);
      } catch (e) {
        if (mySeq !== reqSeqRef.current) return;
        console.error('[balloon] fetch error', e);
        setErrorText('問題の取得に失敗しました。');
        setStatus('finished');
        statusRef.current = 'finished';
      }
    };

    fetchQuestions();
  }, [mode]);

  // 終了時：自己ベスト更新
  useEffect(() => {
    if (status !== 'finished') return;
    if (errorText) return;

    setBestScore((prev) => {
      const next = score > prev ? score : prev;
      if (next > prev && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(bestKey, String(next));
        } catch {}
      }
      return next;
    });
  }, [status, score, errorText, bestKey]);

  // タイマー（全体 + 風船寿命）
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questionsRef.current.length || !slots.length) return;

    const id = setInterval(() => {
      setTotalMs((prev) => {
        const next = prev - 250;
        if (next <= 0) {
          clearInterval(id);
          setStatus('finished');
          statusRef.current = 'finished';
          return 0;
        }
        return next;
      });

      setSlots((prevSlots) => {
        const next = prevSlots.map((s) => ({ ...s }));

        for (let i = 0; i < next.length; i++) {
          const slot = next[i];
          if (!slot) continue;
          if (!slot.active) continue;
          if (slot.popping) continue;

          const nextMs = slot.remainingMs - 250;

          if (nextMs <= 0) {
            const q = (questionsRef.current || [])[slot.questionIndex];
            if (q) {
              const qid = q.id ?? null;
              setAnswerHistory((prev) => [
                ...prev,
                {
                  question_id: qid,
                  text: q.text || '',
                  userAnswerText: '（上空に逃げた）',
                  correctAnswerText: String(q.answerText ?? ''),
                },
              ]);
            }

            setEscapes((h) => h + 1);
            setTotalMs((t) => {
              const nt = Math.max(0, t - ESCAPE_PENALTY_MS);
              if (nt <= 0) {
                setStatus('finished');
                statusRef.current = 'finished';
              }
              return nt;
            });
            setMessage('風船が上空へ… 残り時間 -20秒！');

            // ★ このレーンだけ空にして、2秒後に補充
            next[i] = { ...slot, active: false, pending: false, popping: false, remainingMs: BALLOON_LIFE_MS };
            spawnWithDelay(i, SPAWN_DELAY_MS);
          } else {
            next[i].remainingMs = nextMs;
          }
        }

        return next;
      });
    }, 250);

    return () => clearInterval(id);
  }, [status, slots.length]);

  // 風船破裂（正解）
  const popBalloon = (slotIndex) => {
    const slot = slots[slotIndex];
    if (!slot || !slot.active || slot.popping) return;

    const q = (questionsRef.current || [])[slot.questionIndex];

    if (q) {
      const qid = q.id ?? null;
      setAnswerHistory((prev) => [
        ...prev,
        {
          question_id: qid,
          text: q.text || '',
          userAnswerText: answerInput || '（回答記録なし）',
          correctAnswerText: String(q.answerText ?? ''),
        },
      ]);
    }

    setScore((s) => s + 1);
    setMessage('パァン！風船を割った！');

    setSlots((prev) => {
      const next = [...prev];
      const cur = next[slotIndex];
      next[slotIndex] = { ...cur, popping: true };
      return next;
    });

    setTimeout(() => {
      setSlots((prev) => {
        const next = [...prev];
        const cur = next[slotIndex];
        next[slotIndex] = { ...cur, active: false, pending: false, popping: false, remainingMs: BALLOON_LIFE_MS };
        return next;
      });
      spawnWithDelay(slotIndex, SPAWN_DELAY_MS);
    }, POP_MS);

    setSelectedBalloon(null);
  };

  function isShipRow(q) {
    if (!q) return false;
    const v = q.group ?? q.category ?? q.kind ?? q.type ?? q.colA ?? q.a ?? q.metaA ?? q.A ?? q.tag ?? '';
    return String(v || '').trim() === '船';
  }

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

    let hitIndex = -1;
    let bestRemaining = Infinity;

    const useDigits = isNumberMode(mode);

    slots.forEach((slot, idx) => {
      if (!slot?.active || slot.popping) return;
      const q = (questionsRef.current || [])[slot.questionIndex];
      if (!q) return;

      let ok = false;

      if (useDigits) ok = isCorrectDigits(q.answerText || '', input);
      else if (mode === 'other' && isShipRow(q)) ok = isCorrectShipStrict(q.answerText || '', input);
      else ok = isCorrectLoose(q.answerText || '', input);

      if (ok) {
        if (slot.remainingMs < bestRemaining) {
          bestRemaining = slot.remainingMs;
          hitIndex = idx;
        }
      }
    });

    if (hitIndex >= 0) {
      popBalloon(hitIndex);
      setAnswerInput('');
    } else {
      setMessage('外れた… どの風船にも当たらなかった。');
      setAnswerInput('');
    }

    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ===== UI =====

  if (status === 'finished') {
    return (
      <SkyLayout title={`風船割り（${modeLabel(mode)}）`}>
        <div className="w-full max-w-5xl mx-auto px-3 pb-8 space-y-4">
          <div className="max-w-md mx-auto bg-white/90 border border-sky-300 rounded-2xl shadow-xl p-4 sm:p-6 text-slate-900">
            <h2 className="text-lg sm:text-xl font-extrabold mb-2">風船割り 結果（{modeLabel(mode)}）</h2>

            {errorText ? (
              <p className="text-sm text-rose-700 mb-2">{errorText}</p>
            ) : (
              <p className="text-sm text-slate-700 mb-3">10分間のチャレンジが終了しました。</p>
            )}

            <div className="space-y-1 text-sm">
              <p>
                割った数： <span className="font-extrabold text-emerald-700">{score}</span>
              </p>
              <p>
                逃げた数： <span className="font-extrabold text-rose-700">{escapes}</span>
              </p>
              <p>
                自己ベスト： <span className="font-extrabold text-sky-700">{bestScore}</span>
              </p>
            </div>

            {message && <p className="text-xs text-slate-600 mt-2">{message}</p>}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/solo/balloon/play?mode=${encodeURIComponent(mode)}`}
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-extrabold hover:bg-sky-400"
              >
                もう一度
              </Link>
              <Link
                href="/solo/balloon"
                className="px-4 py-2 rounded-full border border-sky-400 bg-white text-sm font-extrabold text-slate-900 hover:bg-sky-50"
              >
                種目選択へ
              </Link>
              <Link
                href="/solo"
                className="px-4 py-2 rounded-full border border-sky-400 bg-white text-sm font-extrabold text-slate-900 hover:bg-sky-50"
              >
                ソロへ戻る
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-full border border-sky-400 bg-white text-sm font-extrabold text-slate-900 hover:bg-sky-50"
              >
                ホームへ戻る
              </Link>
            </div>
          </div>

          {!errorText ? (
            <div className="max-w-3xl mx-auto">
              <QuestionReviewAndReport questions={answerHistory} sourceMode="solo-balloon" />
            </div>
          ) : null}
        </div>
      </SkyLayout>
    );
  }

  if (status === 'loading') {
    return (
      <SkyLayout title={`風船割り（${modeLabel(mode)}）`}>
        <p className="text-slate-900 font-bold">読み込み中...</p>
      </SkyLayout>
    );
  }

  return (
    <SkyLayout title={`風船割り（${modeLabel(mode)}）`}>
      <style jsx global>{`
        @keyframes balloonPopPiece {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.95);
            opacity: 0;
          }
        }
        @keyframes balloonPopStar {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          25% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(1.15);
            opacity: 0;
          }
        }
      `}</style>

      <div className="w-full max-w-5xl mx-auto mt-2 mb-3 px-1 sm:px-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs text-slate-900 font-bold">残り時間</span>
            <span className="text-[11px] sm:text-xs text-slate-800">
              自己ベスト: <span className="font-extrabold text-sky-700">{bestScore}</span>
            </span>
          </div>
          <div className="flex gap-3 items-center text-[11px] sm:text-xs text-slate-900 font-bold">
            <span>
              Score: <span className="font-extrabold text-emerald-700">{score}</span>
            </span>
            <span>
              Escape: <span className="font-extrabold text-rose-700">{escapes}</span>
            </span>
          </div>
        </div>

        <div className="w-full h-3 rounded-full bg-white/70 overflow-hidden border border-sky-300 shadow-inner hidden sm:block">
          <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${totalRatio * 100}%` }} />
        </div>
      </div>

      {/* ★フィールド：左右余白 + overflow-hidden */}
      <div className="relative w-full max-w-5xl mx-auto h-[62vh] mt-1 sm:mt-3 border-x border-white/50 overflow-hidden px-4">
        {slots.map((slot, i) => {
          if (!slot) return null;
          if (!slot.active && !slot.popping) return null;

          const laneX = LANE_X[i] ?? 50;

          if (slot.popping) {
            return (
              <div
                key={`pop-${i}`}
                className="absolute"
                style={{
                  left: `${laneX}%`,
                  bottom: '40%',
                  transform: 'translateX(-50%)',
                  width: 112,
                  height: 126,
                  pointerEvents: 'none',
                }}
              >
                <BalloonPopEffect colorKey={slot.colorKey} />
              </div>
            );
          }

          const q = (questionsRef.current || [])[slot.questionIndex];
          if (!q) return null;

          const ratio = Math.max(0, slot.remainingMs / BALLOON_LIFE_MS);
          const bottomPercent = 4 + (1 - ratio) * 78; // 4% → 82%

          const st = balloonStyle(slot.colorKey);
          const open = () => setSelectedBalloon({ slotNo: i + 1, text: q.text });

          return (
            <button
              key={`lane-${i}`} // ★ レーン固定
              type="button"
              onClick={open}
              className="absolute focus:outline-none"
              style={{
                left: `${laneX}%`,
                bottom: `${bottomPercent}%`,
                transform: 'translateX(-50%)',
                width: 106, // ★さらに小さく
              }}
            >
              {/* 風船本体（さらに小さく） */}
              <div className="relative mx-auto" style={{ width: 78, height: 102 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '9999px',
                    background: st.balloon,
                    boxShadow: '0 9px 18px rgba(0,0,0,.15)',
                    border: '1px solid rgba(255,255,255,.65)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: 12,
                    width: 13,
                    height: 40,
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,.30)',
                    filter: 'blur(0.6px)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(45deg)',
                    bottom: 5,
                    width: 11,
                    height: 10,
                    background: 'rgba(255,255,255,.85)',
                    borderRadius: 3,
                    border: '1px solid rgba(255,255,255,.85)',
                  }}
                />

                {/* キャラ名カード（さらに小さく） */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    top: 30,
                    width: '88%',
                    maxHeight: '60%',
                    overflowY: 'auto',
                    background: st.labelBg,
                    borderRadius: 9,
                    border: `1px solid ${st.labelBorder}`,
                    padding: '5px 7px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 7, fontWeight: 900, color: 'rgba(15,23,42,.75)', marginBottom: 2 }}>
                    風船 {i + 1}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 1000, color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.12 }}>
                    {q.text}
                  </div>
                </div>
              </div>

              <div className="mx-auto" style={{ width: 2, height: 30, background: 'rgba(255,255,255,.75)' }} />
            </button>
          );
        })}

        {/* 下部：入力 */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 gap-2">
          <div className="w-full max-w-md px-3 mt-1 sm:hidden">
            <div className="w-full h-2 rounded-full bg-white/70 overflow-hidden border border-sky-300 shadow-inner">
              <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${totalRatio * 100}%` }} />
            </div>
          </div>

          <div className="w-full max-w-md px-3">
            <label className="block text-[11px] sm:text-xs text-slate-900 font-bold mb-1 text-center">
              回答欄：画面内のどれか1つに正解すれば割れます（Enterで発射）
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
                className="flex-1 rounded-full border border-sky-300 bg-white/90 px-3 py-2 text-[12px] sm:text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                placeholder={isNumberMode(mode) ? '数字を入力' : '答えを入力'}
              />
              <button
                type="button"
                onClick={handleAnswer}
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-[12px] sm:text-sm font-extrabold hover:bg-sky-400 whitespace-nowrap"
              >
                発射
              </button>
            </div>
          </div>
        </div>
      </div>

      {message ? <div className="mt-2 text-[12px] font-bold text-slate-900">{message}</div> : null}

      {/* モーダル */}
      {selectedBalloon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedBalloon(null)}>
          <div
            className="max-w-md w-full bg-white rounded-2xl shadow-xl p-4 text-slate-900 border border-sky-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-extrabold">風船 {selectedBalloon.slotNo}</div>
              <button className="px-3 py-1 rounded-full bg-sky-500 text-white font-extrabold" onClick={() => setSelectedBalloon(null)}>
                閉じる
              </button>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
              <div className="text-sm font-extrabold whitespace-pre-wrap">{selectedBalloon.text}</div>
            </div>

            <div className="mt-3 flex justify-end">
              <button className="px-4 py-2 rounded-full bg-slate-900 text-white font-extrabold" onClick={() => setSelectedBalloon(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </SkyLayout>
  );
}

function BalloonPopEffect({ colorKey }) {
  const st = balloonStyle(colorKey);

  const pieceColor = (() => {
    if (colorKey === 'sky') return '#38bdf8';
    if (colorKey === 'lime') return '#a3e635';
    if (colorKey === 'yellow') return '#facc15';
    if (colorKey === 'purple') return '#c4b5fd';
    return '#fb7185';
  })();

  const pieces = [
    { dx: -32, dy: -48, rot: '-35deg' },
    { dx: 9, dy: -56, rot: '20deg' },
    { dx: 44, dy: -36, rot: '40deg' },
    { dx: 54, dy: 4, rot: '65deg' },
    { dx: 44, dy: 44, rot: '95deg' },
    { dx: -9, dy: 56, rot: '140deg' },
    { dx: -48, dy: 32, rot: '-120deg' },
    { dx: -54, dy: -4, rot: '-80deg' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: 10,
          top: 12,
          width: 28,
          height: 42,
          borderRadius: 9999,
          background: st.balloon,
          opacity: 0.22,
          filter: 'blur(0.4px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 40,
          transform: 'translate(-50%, -50%)',
          width: 24,
          height: 24,
          background: 'radial-gradient(circle at 50% 50%, #fff7a8 0, #facc15 55%, transparent 70%)',
          animation: 'balloonPopStar 520ms ease-out forwards',
        }}
      />

      {pieces.map((p, idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: '50%',
            top: 46,
            width: 19,
            height: 11,
            background: pieceColor,
            borderRadius: 9999,
            border: '1px solid rgba(255,255,255,.55)',
            transform: 'translate(-50%, -50%)',
            opacity: 1,
            animation: 'balloonPopPiece 520ms ease-out forwards',
            ['--dx']: `${p.dx}px`,
            ['--dy']: `${p.dy}px`,
            ['--rot']: p.rot,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 96,
          width: 36,
          height: 4,
          background: 'rgba(255,255,255,.85)',
          borderRadius: 9999,
          transform: 'translateX(-50%) rotate(10deg)',
          opacity: 0.7,
        }}
      />
    </div>
  );
}

function SkyLayout({ title, children }) {
  return (
    <main className="balloon-nozoom min-h-screen text-slate-900 relative overflow-hidden">
      <style jsx global>{`
        @media (max-width: 640px) {
          .balloon-nozoom input,
          .balloon-nozoom textarea,
          .balloon-nozoom select {
            font-size: 16px !important;
          }
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-sky-50" />
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -top-10 left-10 w-44 h-24 bg-white rounded-full blur-xl" />
        <div className="absolute top-10 right-6 w-52 h-28 bg-white rounded-full blur-xl" />
        <div className="absolute top-40 left-24 w-40 h-22 bg-white rounded-full blur-xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-start pt-3 px-3">
        <header className="w-full max-w-5xl flex items-center justify-between mb-1">
          <h1 className="text-base sm:text-lg font-extrabold tracking-wide">{title}</h1>
          <div className="flex items-center gap-3">
            <Link className="text-[12px] font-extrabold underline text-slate-900" href="/solo/balloon">
              種目選択
            </Link>
            <Link className="text-[12px] font-extrabold underline text-slate-900" href="/">
              ホームへ戻る
            </Link>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
