// file: app/study/subtitle/play/page.js
'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function pad2(n) {
  return String(n).padStart(2, '0');
}
function msToClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${pad2(s)}`;
}

// 全角→半角（英数記号）寄せ
function toHalfWidthAscii(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

// （）と中身を除去（全角/半角）
function stripParensAll(s) {
  let x = String(s ?? '');
  x = x.replace(/（[^）]*）/g, '');
  x = x.replace(/\([^)]*\)/g, '');
  return x;
}

// ひらがなに寄せる（カタ→ひら）
function kataToHira(s) {
  return String(s ?? '').replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// 記号・空白をガッツリ削る（ユーザー設定）
function stripSymbolsLoose(s) {
  const x = String(s ?? '');
  return x
    .replace(/\s+/g, '')
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '')
    .replace(/[、。・「」『』【】〔〕［］｛｝〈〉《》“”‘’＂＇…‥〜～ー−―–—・]/g, '')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, '')
    .replace(/[！-～]/g, '');
}

function normalizeAnswer(raw, opts) {
  let s = String(raw ?? '').trim();
  s = toHalfWidthAscii(s);
  s = stripParensAll(s); // ★常に（）は無視（仕様）
  s = s.toLowerCase();

  if (opts.kanaFree) {
    s = kataToHira(s);
  }
  if (opts.ignoreSymbols) {
    s = stripSymbolsLoose(s);
  } else {
    s = s.replace(/\s+/g, '');
  }
  return s;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// セーブキー
function buildSaveKey({ mode, rangeStart, rangeEnd, randomOrder }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const rnd = randomOrder ? 1 : 0;
  return `study_subtitle_save_${m}_${rs}_${re}_${rnd}`;
}

function StudySubtitlePlayInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeRaw = sp.get('mode') || 'range';
  const mode = modeRaw === 'all' ? 'all' : modeRaw === 'custom' ? 'custom' : 'range';

  const rangeStart = Number(sp.get('rangeStart') || '1') || 1;
  const rangeEnd = Number(sp.get('rangeEnd') || '0') || 0;

  const opts = useMemo(() => {
    return {
      ignoreSymbols: sp.get('ignoreSymbols') === '1',
      kanaFree: sp.get('kanaFree') === '1',
      ignoreWrongAndGo: sp.get('ignoreWrongAndGo') === '1',
      randomOrder: sp.get('randomOrder') === '1',
    };
    // ✅ 依存は sp だけでOK（useSearchParamsのオブジェクトは遷移で更新される）
  }, [sp]);

  const resume = sp.get('resume') === '1';

  const saveKey = useMemo(() => {
    return buildSaveKey({
      mode,
      rangeStart,
      rangeEnd,
      randomOrder: opts.randomOrder,
    });
  }, [mode, rangeStart, rangeEnd, opts.randomOrder]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // プレイ状態
  const [startedAt, setStartedAt] = useState(null);
  const [nowMs, setNowMs] = useState(0);

  const [orderEpisodes, setOrderEpisodes] = useState([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');

  const [phase, setPhase] = useState('playing'); // playing / reveal
  const [lastJudge, setLastJudge] = useState(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState([]);

  const inputRef = useRef(null);

  // データ取得
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/subtitles', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
      } catch {
        setRows([]);
        setMsg('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const maxEpisode = useMemo(() => {
    if (!rows?.length) return 0;
    return rows[rows.length - 1].episode || 0;
  }, [rows]);

  // 対象範囲
  const targets = useMemo(() => {
    if (!rows?.length) return [];
    let start = 1;
    let end = maxEpisode || 0;

    if (mode === 'range' || mode === 'custom') {
      start = Math.max(1, rangeStart);
      end = rangeEnd > 0 ? rangeEnd : Math.min(maxEpisode || 0, start + 99);
      end = Math.min(maxEpisode || end, end);
      if (end < start) end = start;
    }

    return rows.filter((r) => r.episode >= start && r.episode <= end);
  }, [rows, mode, rangeStart, rangeEnd, maxEpisode]);

  const mapByEpisode = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) m.set(r.episode, r);
    return m;
  }, [rows]);

  const total = orderEpisodes.length;

  const current = useMemo(() => {
    if (!total) return null;
    const ep = orderEpisodes[idx];
    return mapByEpisode.get(ep) || null;
  }, [orderEpisodes, idx, total, mapByEpisode]);

  const correctNormalized = useMemo(() => {
    if (!current) return '';
    return normalizeAnswer(current.title, opts);
  }, [current, opts]);

  // タイマー
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => {
      setNowMs(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(t);
  }, [startedAt]);

  // 自動セーブ（状態が変わるたび）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!startedAt) return;
    if (!orderEpisodes.length) return;

    try {
      const obj = {
        v: 1,
        mode,
        rangeStart,
        rangeEnd,
        randomOrder: opts.randomOrder ? 1 : 0,

        orderEpisodes,
        idx,
        correctCount,
        mistakes,
        elapsedMs: nowMs,
        total: orderEpisodes.length,
      };
      window.localStorage.setItem(saveKey, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }, [
    saveKey,
    startedAt,
    orderEpisodes,
    idx,
    correctCount,
    mistakes,
    nowMs,
    mode,
    rangeStart,
    rangeEnd,
    opts.randomOrder,
  ]);

  // 初期化：セーブがあれば再開、なければ新規
  useEffect(() => {
    if (loading) return;
    if (!targets.length) return;

    // ★復元は resume=1 のときだけ
    if (resume && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (
            obj &&
            Array.isArray(obj.orderEpisodes) &&
            typeof obj.idx === 'number' &&
            (obj.randomOrder ? 1 : 0) === (opts.randomOrder ? 1 : 0)
          ) {
            setOrderEpisodes(obj.orderEpisodes);
            setIdx(Math.min(obj.idx, obj.orderEpisodes.length - 1));
            setCorrectCount(Number(obj.correctCount || 0));
            setMistakes(Array.isArray(obj.mistakes) ? obj.mistakes : []);
            const elapsed = Number(obj.elapsedMs || 0);
            setStartedAt(Date.now() - Math.max(0, elapsed));
            setNowMs(Math.max(0, elapsed));
            setInput('');
            setPhase('playing');
            setLastJudge(null);
            setTimeout(() => inputRef.current?.focus?.(), 50);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    // 新規開始
    const eps = targets.map((r) => r.episode);
    const ordered = opts.randomOrder ? shuffle(eps) : eps;

    setOrderEpisodes(ordered);
    setIdx(0);
    setCorrectCount(0);
    setMistakes([]);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    setStartedAt(Date.now());
    setNowMs(0);
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }, [loading, targets.length, saveKey, opts.randomOrder, resume]);

  // 自己ベストキー（menu側と合わせる）
  const bestKey = useMemo(() => {
    const rnd = opts.randomOrder ? 'rand1' : 'rand0';
    if (mode === 'all') return `study_subtitle_best_all_${rnd}`;
    if (mode === 'custom') return `study_subtitle_best_custom_${rangeStart}_${rangeEnd}_${rnd}`;
    // range
    return `study_subtitle_best_${rangeStart}_${rangeEnd}_${rnd}`;
  }, [mode, rangeStart, rangeEnd, opts.randomOrder]);

  function saveBestIfNeeded(finalCorrect, finalTimeMs) {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(bestKey);
      let prev = null;
      if (raw) prev = JSON.parse(raw);

      const should =
        !prev ||
        typeof prev.correct !== 'number' ||
        typeof prev.timeMs !== 'number' ||
        finalCorrect > prev.correct ||
        (finalCorrect === prev.correct && finalTimeMs < prev.timeMs);

      if (should) {
        window.localStorage.setItem(
          bestKey,
          JSON.stringify({
            correct: finalCorrect,
            timeMs: finalTimeMs,
            savedAt: Date.now(),
          })
        );
      }
    } catch {
      // ignore
    }
  }

  function finishGame(finalCorrect, finalTimeMs, finalMistakes) {
    // 終了したらセーブは消す（次回は新規開始）
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(saveKey);
      }
    } catch {
      // ignore
    }

    saveBestIfNeeded(finalCorrect, finalTimeMs);

    try {
      const payload = {
        mode,
        rangeStart,
        rangeEnd,
        maxEpisode,
        correct: finalCorrect,
        timeMs: finalTimeMs,
        mistakes: finalMistakes,
        opts,
      };
      sessionStorage.setItem('study_subtitle_last_result', JSON.stringify(payload));
    } catch {
      // ignore
    }

    router.push('/study/subtitle/result');
  }

  function goNext() {
    const nextIdx = idx + 1;
    if (nextIdx >= total) {
      finishGame(correctCount, nowMs, mistakes);
      return;
    }
    setIdx(nextIdx);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }

  function revealThenMaybeNext(judge) {
    setPhase('reveal');
    setLastJudge(judge);

    setTimeout(() => {
      if (opts.ignoreWrongAndGo || judge?.ok) {
        goNext();
      } else {
        setPhase('playing');
        setLastJudge(null);
        setTimeout(() => inputRef.current?.focus?.(), 50);
      }
    }, 1200);
  }

  function judgeAndHandle(userText, isSkip = false) {
    if (!current) return;

    const userNorm = normalizeAnswer(userText, opts);
    const ok = !isSkip && userNorm && userNorm === correctNormalized;

    const judge = {
      ok,
      user: userText,
      correct: current.title,
      episode: current.episode,
      isSkip,
    };

    if (ok) {
      setCorrectCount((c) => c + 1);
      setPhase('reveal');
      setLastJudge(judge);
      setTimeout(() => goNext(), 700);
      return;
    }

    setMistakes((arr) => [
      ...arr,
      {
        episode: current.episode,
        correctTitle: current.title,
        userAnswer: isSkip ? '(スキップ)' : String(userText ?? ''),
      },
    ]);

    revealThenMaybeNext(judge);
  }

  function onSubmit(e) {
    e?.preventDefault?.();
    if (phase !== 'playing') return;
    judgeAndHandle(input, false);
  }

  function onSkip() {
    if (phase !== 'playing') return;
    judgeAndHandle(input, true);
  }

  function onQuit() {
    if (!confirm('中断してメニューに戻りますか？（続きから再開できます）')) return;
    router.push('/study/subtitle');
  }

  const headerText = useMemo(() => {
    if (mode === 'all') return `全サブタイトルRTA（1〜${maxEpisode || '---'}）`;
    return `範囲（${rangeStart}〜${rangeEnd || '---'}）`;
  }, [mode, maxEpisode, rangeStart, rangeEnd]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">📘 サブタイ学習</h1>
            <p className="text-[11px] text-slate-700">{headerText}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onQuit}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              中断
            </button>

            <Link href="/study/subtitle" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              戻る
            </Link>
          </div>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">
            {msg}
          </div>
        )}

        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-slate-600">
              進捗：<b className="text-slate-900">{total ? idx + 1 : 0}</b> / {total || 0}
            </p>
            <p className="text-[12px] text-slate-600">
              タイム：<b className="text-slate-900">{startedAt ? msToClock(nowMs) : '--:--'}</b>
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
            <p className="text-[12px] text-cyan-900 font-bold mb-1">
              第{current?.episode ?? '---'}話
              {opts.randomOrder ? <span className="ml-2 text-[10px] text-cyan-800">（ランダム出題）</span> : null}
            </p>
            <p className="text-sm text-cyan-950 leading-relaxed">サブタイトルを入力してください</p>
          </div>

          <form onSubmit={onSubmit} className="mt-3">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || !current || phase !== 'playing'}
              placeholder="ここに入力"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-300"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={loading || !current || phase !== 'playing'}
                className="flex-1 py-3 rounded-full bg-emerald-600 text-white font-extrabold shadow active:bg-emerald-700 disabled:bg-gray-400"
              >
                決定
              </button>

              <button
                type="button"
                onClick={onSkip}
                disabled={loading || !current || phase !== 'playing'}
                className="px-4 py-3 rounded-full bg-slate-700 text-white font-extrabold shadow active:bg-slate-800 disabled:bg-gray-400"
              >
                スキップ
              </button>
            </div>
          </form>

          {lastJudge && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className={`text-sm font-extrabold ${lastJudge.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {lastJudge.ok ? '正解！' : lastJudge.isSkip ? 'スキップ' : '不正解'}
              </p>

              {(opts.ignoreWrongAndGo || lastJudge.ok || lastJudge.isSkip) && (
                <p className="text-[12px] text-slate-700 mt-1">
                  正解：<b className="text-slate-900">{lastJudge.correct || ''}</b>
                </p>
              )}

              {!lastJudge.ok && !opts.ignoreWrongAndGo && (
                <p className="text-[11px] text-slate-600 mt-2">
                  この設定では、正解するまで次に進めません（<b>スキップ</b>のみ次へ）。
                </p>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-[12px] text-slate-700">
            <span>
              正解数：<b className="text-slate-900">{correctCount}</b>
            </span>
            <span>
              ミス：<b className="text-slate-900">{mistakes.length}</b>
            </span>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            ※プレイ中は自動セーブされます（中断しても「続きから再開」できます）
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function StudySubtitlePlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sky-50" />}>
      <StudySubtitlePlayInner />
    </Suspense>
  );
}
