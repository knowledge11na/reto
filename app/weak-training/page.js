// file: app/weak-training/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

// 問題タイプ別の制限時間（ミリ秒）
const TIME_SINGLE = 30000; // 単一選択
const TIME_MULTI_ORDER = 40000; // 複数選択 / 並び替え
const TIME_TEXT = 60000; // 記述（15文字以内）
const TIME_TEXT_LONG = 80000; // 記述（16文字以上）

const LS_KEY = 'weak_training_state_v1';
const LS_LAST_WRONG = 'weak_training_last_wrong_ids_v1';

// ちょい強め正規化（別解拾う用）
function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[・。．，,、/／\-\(\)（）「」『』"'\[\]【】]/g, '')
    .toLowerCase();
}

// 正解文字列をパース（JSON配列 or 区切り文字）
function parseCorrectValues(ans) {
  if (!ans) return [];
  try {
    const parsed = JSON.parse(ans);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {}
  return String(ans)
    .split(/[、,／\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function calcTimeLimit(type, answer) {
  if (type === 'single') return TIME_SINGLE;
  if (type === 'multi' || type === 'ordering') return TIME_MULTI_ORDER;

  const len = (answer || '').length;
  if (len > 15) return TIME_TEXT_LONG;
  return TIME_TEXT;
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export default function WeakTrainingPage() {
  const [allMistakes, setAllMistakes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // settings
  const [step, setStep] = useState('setup'); // setup / running / finished / paused
  const [orderMode, setOrderMode] = useState('shuffle'); // shuffle / id / weak

  // ★ 4モード
  // allIncludeLearned: 全て（覚えた含む）
  // excludeLearned: 覚えた以外
  // lastWrongOnly: 前回の不正解だけ
  // favoritesOnly: お気に入りのみ
  const [trainMode, setTrainMode] = useState('excludeLearned');

  const [limitCount, setLimitCount] = useState(20);

  // running state
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('question'); // question / result
  const [timeLeft, setTimeLeft] = useState(0);

  const [multiSelected, setMultiSelected] = useState([]);
  const [orderSelected, setOrderSelected] = useState([]);
  const [textAnswer, setTextAnswer] = useState('');

  const [judge, setJudge] = useState(null); // { isCorrect, correctAnswer }
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // まとめ振り返り用
  const [history, setHistory] = useState([]); // [{id, questionId, text, type, correctAnswer, yourAnswer, isCorrect}]

  const timerStopRef = useRef(false);

  // resume用：一度だけ「残り時間」を引き継ぐ
  const resumeRemainRef = useRef(null);

  // 初回：間違えた問題一覧から問題を取得
  useEffect(() => {
    const fetchMistakes = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/my-mistakes', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error || '間違えた問題の取得に失敗しました。');
          setAllMistakes([]);
          return;
        }
        if (!data.ok) {
          setAllMistakes([]);
          return;
        }

        const normalized =
          (data.mistakes || []).map((row) => {
            let options = [];
            try {
              if (Array.isArray(row.options_json)) {
                options = row.options_json;
              } else if (typeof row.options_json === 'string') {
                const parsed = JSON.parse(row.options_json);
                if (Array.isArray(parsed)) options = parsed;
              }
            } catch {
              options = [];
            }

            return {
              id: row.id, // user_mistakes の id
              questionId: row.question_id,
              text: row.question || row.question_text || '',
              type: row.question_type || 'single',
              options,
              answer: row.correct_answer || '',
              wrongCount: row.wrong_count ?? 1,
              lastWrongAt: row.last_wrong_at,
              isLearned: !!row.is_learned,
              isFavorite: !!row.is_favorite,
            };
          }) || [];

        setAllMistakes(normalized);
        setError('');
      } catch (e) {
        console.error(e);
        setError('間違えた問題の取得に失敗しました。');
        setAllMistakes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMistakes();
  }, []);

  const hasResume = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const st = safeJsonParse(raw, null);
    return !!st && st.step === 'paused' && Array.isArray(st.questions) && st.questions.length > 0;
  }, [loading]);

  // ★ 出題リスト生成（4モード＋順番＋上限）
  const buildQuestions = () => {
    const all = [...allMistakes];
    let picked = all;

    if (trainMode === 'excludeLearned') {
      picked = all.filter((m) => !m.isLearned);
    } else if (trainMode === 'favoritesOnly') {
      // お気に入りのみ（覚えたでもお気に入りなら出る）
      picked = all.filter((m) => !!m.isFavorite);
    } else if (trainMode === 'lastWrongOnly') {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_LAST_WRONG) : null;
      const ids = raw ? safeJsonParse(raw, []) : [];
      if (Array.isArray(ids) && ids.length > 0) {
        const setIds = new Set(ids.map(String));
        picked = all.filter((m) => setIds.has(String(m.id)));
      } else {
        picked = [];
      }
    } else if (trainMode === 'allIncludeLearned') {
      picked = all; // 全て（覚えた含む）
    }

    // order
    let arranged = [...picked];

    if (orderMode === 'shuffle') {
      for (let i = arranged.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arranged[i], arranged[j]] = [arranged[j], arranged[i]];
      }
    } else if (orderMode === 'id') {
      arranged.sort((a, b) => Number(a.questionId || 0) - Number(b.questionId || 0));
    } else if (orderMode === 'weak') {
      arranged.sort((a, b) => {
        const wa = Number(a.wrongCount || 0);
        const wb = Number(b.wrongCount || 0);
        if (wb !== wa) return wb - wa;
        const ta = a.lastWrongAt ? new Date(a.lastWrongAt).getTime() : 0;
        const tb = b.lastWrongAt ? new Date(b.lastWrongAt).getTime() : 0;
        return tb - ta;
      });
    }

    const lim = Math.max(1, Math.min(arranged.length, Number(limitCount || arranged.length)));
    arranged = arranged.slice(0, lim);

    return arranged;
  };

  const startNew = () => {
    const qs = buildQuestions();

    setQuestions(qs);
    setIndex(0);
    setPhase('question');
    setTimeLeft(0); // ★ ここで一旦リセット（次のeffectで問題ごとの制限時間へ）
    setMultiSelected([]);
    setOrderSelected([]);
    setTextAnswer('');
    setJudge(null);
    setCorrectCount(0);
    setTotalCount(0);
    setHistory([]);

    timerStopRef.current = false;
    resumeRemainRef.current = null;

    if (qs.length === 0) {
      setStep('setup');
      setError(
        trainMode === 'lastWrongOnly'
          ? '前回の不正解データがないため開始できません。先に弱点克服を1回やってください。'
          : '出題できる問題がありません。'
      );
      return;
    }

    setStep('running');
    setError('');
  };

  const savePausedState = () => {
    if (typeof window === 'undefined') return;
    const payload = {
      step: 'paused',
      orderMode,
      trainMode,
      limitCount,
      questions,
      index,
      phase,
      timeLeft,
      multiSelected,
      orderSelected,
      textAnswer,
      judge,
      correctCount,
      totalCount,
      history,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  };

  const clearPausedState = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(LS_KEY);
  };

  const resume = () => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const st = safeJsonParse(raw, null);
    if (!st || st.step !== 'paused') return;

    setOrderMode(st.orderMode || 'shuffle');
    setTrainMode(st.trainMode || 'excludeLearned');
    setLimitCount(st.limitCount || 20);

    setQuestions(st.questions || []);
    setIndex(st.index || 0);
    setPhase(st.phase || 'question');

    // ★ 「残り時間」は “次のタイマーeffect” で 1回だけ引き継ぐ
    resumeRemainRef.current = Number(st.timeLeft || 0) || null;
    setTimeLeft(0);

    setMultiSelected(st.multiSelected || []);
    setOrderSelected(st.orderSelected || []);
    setTextAnswer(st.textAnswer || '');
    setJudge(st.judge || null);

    setCorrectCount(st.correctCount || 0);
    setTotalCount(st.totalCount || 0);
    setHistory(st.history || []);

    timerStopRef.current = false;
    setStep('running');
  };

  const pause = () => {
    timerStopRef.current = true;
    savePausedState();
    setStep('paused');
  };

  const quit = () => {
    timerStopRef.current = true;
    clearPausedState();
    setStep('setup');
  };

  const current = questions[index] || null;

  // ★ タイマー制御：問題が変わるたびに、その問題の制限時間で必ず開始する
  useEffect(() => {
    if (step !== 'running') return;
    if (!current || phase !== 'question') return;

    timerStopRef.current = false;

    const limit = calcTimeLimit(current.type, current.answer);

    // ★ resume直後だけ、保存してた残り時間を使う（1回だけ）
    let startRemain = limit;
    if (resumeRemainRef.current != null) {
      const saved = Number(resumeRemainRef.current);
      if (saved > 0 && saved <= limit) startRemain = saved;
      resumeRemainRef.current = null;
    }

    setTimeLeft(startRemain);

    const startAt = Date.now();
    const base = startRemain;

    const timerId = setInterval(() => {
      if (timerStopRef.current) {
        clearInterval(timerId);
        return;
      }

      const elapsed = Date.now() - startAt;
      const remain = base - elapsed;

      if (remain <= 0) {
        clearInterval(timerId);
        setTimeLeft(0);
        handleTimeout();
      } else {
        setTimeLeft(remain);
      }
    }, 50);

    return () => clearInterval(timerId);
    // ★ current?.id も依存に入れて「次の問題で必ず再生成」
  }, [step, phase, index, current?.id]);

  const timeDisplay = useMemo(() => {
    if (step !== 'running' || phase !== 'question' || !current || timeLeft <= 0) return '---';
    return (timeLeft / 1000).toFixed(1);
  }, [step, phase, current, timeLeft]);

  const progress = useMemo(() => {
    if (!current) return 0;
    const limitMs = calcTimeLimit(current.type, current.answer);
    if (limitMs <= 0) return 0;
    return Math.max(0, Math.min(1, timeLeft / limitMs));
  }, [current, timeLeft]);

  const sendTrainResult = (isCorrect) => {
    if (!current || !current.questionId) return;
    fetch('/api/mistakes/train-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: current.questionId,
        correct: !!isCorrect,
      }),
    }).catch(() => {});
  };

  const goNext = () => {
    const nextIndex = index + 1;

    // ★ 次の問題へ行く瞬間にタイマー表示を一旦リセット（取り残し防止）
    setTimeLeft(0);

    if (nextIndex >= questions.length) {
      // 前回不正解リスト保存（次回「前回不正解のみ」で使う）
      if (typeof window !== 'undefined') {
        const wrongIds = history.filter((h) => !h.isCorrect).map((h) => String(h.id));
        localStorage.setItem(LS_LAST_WRONG, JSON.stringify(wrongIds));
      }

      clearPausedState();
      setStep('finished');
    } else {
      setIndex(nextIndex);
      setPhase('question');
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
    }
  };

  const finishQuestion = (isCorrect, correctText, yourAnswer) => {
    if (!current) return;
    if (step !== 'running') return;
    if (phase !== 'question') return;

    setPhase('result');
    setJudge({ isCorrect, correctAnswer: correctText });

    setTotalCount((c) => c + 1);
    if (isCorrect) setCorrectCount((c) => c + 1);

    setHistory((prev) => [
      ...prev,
      {
        id: current.id,
        questionId: current.questionId,
        text: current.text,
        type: current.type,
        correctAnswer: correctText,
        yourAnswer: yourAnswer ?? '',
        isCorrect: !!isCorrect,
      },
    ]);

    sendTrainResult(isCorrect);

    setTimeout(() => {
      goNext();
    }, 2000);
  };

  const handleTimeout = () => {
    if (!current || step !== 'running' || phase !== 'question') return;
    const candidates = parseCorrectValues(current.answer);
    const correctText = (candidates.length ? candidates.join(' / ') : current.answer || '') || '';
    finishQuestion(false, correctText, '（時間切れ）');
  };

  // ===== 各タイプの回答（別解拾う強化） =====

  const handleSelectSingle = (opt) => {
    if (!current || step !== 'running' || phase !== 'question') return;

    const candidates = parseCorrectValues(current.answer);
    const optN = normalizeText(opt);

    let isCorrect = false;
    if (candidates.length === 0) {
      isCorrect = normalizeText(opt) === normalizeText(current.answer || '');
    } else {
      isCorrect = candidates.some((c) => normalizeText(c) === optN);
    }

    const correctText = candidates.length ? candidates.join(' / ') : current.answer || '';
    finishQuestion(isCorrect, correctText, opt);
  };

  const toggleMultiOption = (opt) => {
    if (step !== 'running' || phase !== 'question') return;
    setMultiSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  };

  const submitMulti = () => {
    if (!current || step !== 'running' || phase !== 'question') return;

    const candidates = parseCorrectValues(current.answer);
    const sel = multiSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      const setA = new Set(sel.map((s) => normalizeText(s)));
      const setB = new Set(candidates.map((s) => normalizeText(s)));
      isCorrect = [...setA].every((v) => setB.has(v)) && [...setB].every((v) => setA.has(v));
    }

    const correctText = candidates.length ? candidates.join(' / ') : current.answer || '';
    finishQuestion(isCorrect, correctText, sel.join(' / '));
  };

  const toggleOrderOption = (opt) => {
    if (step !== 'running' || phase !== 'question') return;
    setOrderSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  };

  const resetOrder = () => {
    setOrderSelected([]);
  };

  const submitOrder = () => {
    if (!current || step !== 'running' || phase !== 'question') return;

    const candidates = parseCorrectValues(current.answer);
    const sel = orderSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      isCorrect = candidates.every((v, i) => normalizeText(sel[i]) === normalizeText(v));
    }

    const correctText = candidates.length ? candidates.join(' / ') : current.answer || '';
    finishQuestion(isCorrect, correctText, sel.join(' → '));
  };

  const submitText = () => {
    if (!current || step !== 'running' || phase !== 'question') return;

    const inputRaw = textAnswer;
    const inputNorm = normalizeText(inputRaw);

    const baseCandidates = parseCorrectValues(current.answer);
    const allCandidates = baseCandidates.length > 0 ? baseCandidates : [current.answer || ''];

    let isCorrect = false;
    if (inputNorm !== '') {
      const normalizedList = allCandidates.map((s) => normalizeText(s)).filter((v) => v.length > 0);
      isCorrect = normalizedList.includes(inputNorm);
    }

    const correctText = baseCandidates.length ? baseCandidates.join(' / ') : current.answer || '';
    finishQuestion(isCorrect, correctText, inputRaw);
  };

  // ===== 覚えた（DB永続） =====

  const updateMistake = async ({ action, id, value }) => {
    const res = await fetch('/api/mistakes/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, value }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || data.reason || '更新に失敗しました');
  };

  const markLearned = async (mistakeId, learned) => {
    try {
      await updateMistake({ action: 'learned', id: mistakeId, value: !!learned });
      setAllMistakes((prev) => prev.map((m) => (m.id === mistakeId ? { ...m, isLearned: !!learned } : m)));
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
    }
  };

  // ======= レンダリング =======

  if (loading) {
    return (
      <main className="min-h-screen bg-sky-50 text-slate-900 flex items-center justify-center">
        <p className="text-sm">弱点克服モードを準備中です...</p>
      </main>
    );
  }

  // 出題可能数表示（setup用）
  const availableCount =
    trainMode === 'allIncludeLearned'
      ? allMistakes.length
      : trainMode === 'favoritesOnly'
      ? allMistakes.filter((m) => !!m.isFavorite).length
      : trainMode === 'lastWrongOnly'
      ? (() => {
          if (typeof window === 'undefined') return 0;
          const raw = localStorage.getItem(LS_LAST_WRONG);
          const ids = raw ? safeJsonParse(raw, []) : [];
          const setIds = new Set((Array.isArray(ids) ? ids : []).map(String));
          return allMistakes.filter((m) => setIds.has(String(m.id))).length;
        })()
      : allMistakes.filter((m) => !m.isLearned).length;

  // SETUP
  if (step === 'setup') {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
        <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-skull.png" alt="ナレバト" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-xl font-extrabold tracking-widest">弱点克服モード</h1>
              <p className="text-[11px] text-slate-500">間違えた問題だけで特訓しよう！</p>
            </div>
          </div>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </header>

        <section className="w-full max-w-md px-4 pb-10 mt-4 space-y-3">
          {error && <p className="text-xs text-rose-600 whitespace-pre-line">{error}</p>}

          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">開始設定</p>

            <div className="text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">出題モード</span>
                <select
                  value={trainMode}
                  onChange={(e) => setTrainMode(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 bg-slate-50 text-slate-900"
                >
                  <option value="allIncludeLearned">全て（覚えた問題も含む）</option>
                  <option value="excludeLearned">覚えた問題以外</option>
                  <option value="lastWrongOnly">前回の弱点克服の間違いだけ</option>
                  <option value="favoritesOnly">お気に入りのみ</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">問題順</span>
                <select
                  value={orderMode}
                  onChange={(e) => setOrderMode(e.target.value)}
                  className="border border-slate-300 rounded-lg px-2 py-1 bg-slate-50 text-slate-900"
                >
                  <option value="shuffle">シャッフル</option>
                  <option value="id">番号順（questionId昇順）</option>
                  <option value="weak">記憶度低い順（ミス多い順）</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">問題数</span>
                <input
                  type="number"
                  min={1}
                  max={availableCount || 1}
                  value={limitCount}
                  onChange={(e) => setLimitCount(e.target.value)}
                  className="w-24 border border-slate-300 rounded-lg px-2 py-1 bg-slate-50 text-slate-900"
                />
              </div>

              <p className="text-[11px] text-slate-500">出題可能：{availableCount}問</p>
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={startNew} className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold">
                この設定で開始
              </button>

              {hasResume && (
                <button onClick={resume} className="w-full py-2 rounded-full bg-emerald-500 text-white text-sm font-bold">
                  中断から再開
                </button>
              )}

              <Link
                href="/mistakes"
                className="w-full text-center py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold"
              >
                間違えた問題一覧に戻る
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // PAUSED
  if (step === 'paused') {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
        <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-skull.png" alt="ナレバト" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-xl font-extrabold tracking-widest">弱点克服モード</h1>
              <p className="text-[11px] text-slate-500">中断中</p>
            </div>
          </div>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </header>

        <section className="w-full max-w-md px-4 pb-10 mt-6">
          <div className="bg-white rounded-2xl shadow p-4 text-center space-y-3">
            <p className="text-xs text-slate-500">中断しました</p>
            <p className="text-sm text-slate-700">
              {index + 1} / {questions.length} 問目の途中です
            </p>
            <div className="flex flex-col gap-2 mt-2">
              <button onClick={resume} className="px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-bold">
                再開する
              </button>
              <button onClick={quit} className="px-4 py-2 rounded-full bg-rose-500 text-white text-sm font-bold">
                破棄してやめる
              </button>
              <Link href="/mistakes" className="px-4 py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold">
                間違えた問題一覧へ
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // FINISHED
  if (step === 'finished') {
    const wrongList = history.filter((h) => !h.isCorrect);

    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
        <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-skull.png" alt="ナレバト" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-xl font-extrabold tracking-widest">弱点克服モード</h1>
              <p className="text-[11px] text-slate-500">まとめ</p>
            </div>
          </div>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </header>

        <section className="w-full max-w-md px-4 pb-10 mt-4 space-y-3">
          {error && <p className="text-xs text-rose-600 whitespace-pre-line">{error}</p>}

          <div className="bg-white rounded-2xl shadow p-4 text-center space-y-2">
            <p className="text-xs text-slate-500">弱点克服モード 終了</p>
            <p className="text-2xl font-extrabold">おつかれさま！</p>
            <p className="text-sm text-slate-700">
              正解数 {correctCount} / {totalCount} 問（不正解 {wrongList.length}）
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">振り返り（押して整理）</p>

            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={`${h.id}-${i}`} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700">
                      {i + 1}. {h.isCorrect ? '✅ 正解' : '❌ 不正解'}
                    </p>
                    <button
                      onClick={() => markLearned(h.id, true)}
                      className="px-2 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-bold"
                      title="覚えたに移す"
                    >
                      覚えた
                    </button>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 mt-1 whitespace-pre-wrap">{h.text}</p>

                  <p className="text-xs text-slate-700 mt-2">
                    あなた： <span className="font-bold">{h.yourAnswer || '（未入力）'}</span>
                  </p>
                  <p className="text-xs text-slate-700 mt-1">
                    正解： <span className="font-bold">{h.correctAnswer || '（正解データなし）'}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-bold" onClick={() => setStep('setup')}>
              もう一度（設定から）
            </button>
            <Link
              href="/mistakes"
              className="px-4 py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold text-center"
            >
              間違えた問題一覧に戻る
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-full bg-white border border-sky-500 text-sky-700 text-sm font-bold text-center"
            >
              ホームへ戻る
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // RUNNING
  if (!current) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
        <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-skull.png" alt="ナレバト" className="w-10 h-10 object-contain" />
            <h1 className="text-xl font-extrabold tracking-widest">弱点克服モード</h1>
          </div>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </header>

        <section className="w-full max-w-md px-4 pb-10 mt-4">
          <p className="text-sm text-slate-700">出題できる問題がありません。</p>
          <div className="mt-3">
            <button onClick={() => setStep('setup')} className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold">
              設定へ戻る
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo-skull.png" alt="ナレバト" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-extrabold tracking-widest">弱点克服モード</h1>
            <p className="text-[11px] text-slate-500">間違えた問題だけで特訓しよう！</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={pause}
            className="border-2 border-amber-500 px-3 py-1 rounded-full text-sm font-bold text-amber-700 bg-white shadow-sm"
          >
            中断
          </button>
          <Link
            href="/mypage"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            マイページへ戻る
          </Link>
        </div>
      </header>

      <section className="w-full max-w-md px-4 pb-10 mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">進行状況</p>
            <p>
              {index + 1}問目 / {questions.length}問
            </p>
            <p>
              正解数: {correctCount} / {totalCount}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">残り時間</p>
            <p>{timeDisplay} 秒</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>弱点克服中…</span>
            <span>残り時間: {timeDisplay} 秒</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progress * 100}%` }} />
          </div>

          <p className="text-sm font-semibold whitespace-pre-wrap text-slate-900">{current.text}</p>

          <div className="mt-2 space-y-2">
            {current.type === 'single' && current.options && current.options.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {current.options.map((opt, i) => (
                  <button
                    key={i}
                    disabled={phase !== 'question'}
                    onClick={() => handleSelectSingle(opt)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                      phase === 'question'
                        ? 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-900'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {current.type === 'multi' && current.options && current.options.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  {current.options.map((opt, i) => {
                    const isOn = multiSelected.includes(opt);
                    return (
                      <button
                        key={i}
                        disabled={phase !== 'question'}
                        onClick={() => toggleMultiOption(opt)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                          phase === 'question'
                            ? isOn
                              ? 'bg-sky-500 text-white border-sky-500'
                              : 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                            : 'bg-slate-100 border-slate-200 text-slate-900'
                        }`}
                      >
                        <span className="mr-2">{isOn ? '☑' : '☐'}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {phase === 'question' && (
                  <button onClick={submitMulti} className="w-full mt-1 py-2 rounded-full bg-sky-500 text-white text-sm font-bold">
                    この選択で回答する
                  </button>
                )}
              </div>
            )}

            {current.type === 'ordering' && current.options && current.options.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  {current.options.map((opt, i) => {
                    const idx = orderSelected.indexOf(opt);
                    const selectedOrder = idx >= 0 ? idx + 1 : null;
                    return (
                      <button
                        key={i}
                        disabled={phase !== 'question'}
                        onClick={() => toggleOrderOption(opt)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                          phase === 'question'
                            ? selectedOrder
                              ? 'bg-sky-500 text-white border-sky-500'
                              : 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                            : 'bg-slate-100 border-slate-200 text-slate-900'
                        }`}
                      >
                        <span className="mr-2 text-xs">{selectedOrder ? `${selectedOrder}.` : '・'}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {phase === 'question' && (
                  <div className="flex gap-2">
                    <button onClick={resetOrder} className="flex-1 py-2 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
                      リセット
                    </button>
                    <button onClick={submitOrder} className="flex-1 py-2 rounded-full bg-sky-500 text-white text-xs font-bold">
                      この順番で回答
                    </button>
                  </div>
                )}
              </div>
            )}

            {current.type === 'text' && (
              <div className="space-y-2">
                <textarea
                  disabled={phase !== 'question'}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  rows={2}
                  placeholder="ここに答えを入力"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                />
                {phase === 'question' && (
                  <button onClick={submitText} className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold">
                    この答えで回答する
                  </button>
                )}
              </div>
            )}
          </div>

          {judge && (
            <div className="mt-2 text-xs">
              <p className={judge.isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                {judge.isCorrect ? '◯ 正解！' : '× 不正解'}
              </p>
              <p className="text-slate-700 mt-1">
                正解:&nbsp;
                <span className="font-semibold">
                  {judge.correctAnswer && judge.correctAnswer.trim() !== '' ? judge.correctAnswer : '（正解データなし）'}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">2秒後に次の問題へ進みます…</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
