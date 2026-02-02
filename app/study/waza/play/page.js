// file: app/study/waza/play/page.js
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

// 技：有無を問わない語（判定から除外）
const OPTIONAL_PHRASES = [
  '必殺',
  '緑星',
  'ゴムゴムの',
  '奥義',
  '遠距離',
  '曲技',
  'カラーズトラップ',
  'オカマ拳法',
  '居合',
  'ロープアクション',
  '悪魔風脚',
  '悪魔風',
  '魔神風',
  '武装',
  '武装硬化',
  '八衝拳',
  '魚人空手',
  '魚人柔術',
  'R・A',
  'おでん',
  '一刀流',
  '二刀流',
  '三刀流',
  '四刀流',
  '八刀流',
  '九刀流',
];

// 記号除去（中黒「・」だけ残す）
function stripSymbolsExceptNakaguro(s) {
  let x = String(s ?? '');

  // 英数記号を消す
  x = x.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '');

  // 和文記号（中黒「・」は含めない）
  x = x.replace(/[、。「」『』【】〔〕［］｛｝〈〉《》“”‘’＂＇…‥〜～−―–—]/g, '');

  // 全角ASCII相当も消す
  x = x.replace(/[！-～]/g, '');

  return x;
}

// 小書き母音は無視（ぁぃぅぇぉ/ァィゥェォ）
function dropSmallVowels(s) {
  return String(s ?? '').replace(/[ぁぃぅぇぉァィゥェォ]/g, '');
}

// っ/ッ 無視
function dropSmallTsu(s) {
  return String(s ?? '').replace(/[っッ]/g, '');
}

// ～ / ー 無視
function dropWaveAndLong(s) {
  return String(s ?? '').replace(/[ー〜～]/g, '');
}

function removeOptionalPhrases(s) {
  let x = String(s ?? '');
  for (const p of OPTIONAL_PHRASES) {
    x = x.split(p).join('');
  }
  return x;
}

function normalizeWaza(raw) {
  let s = String(raw ?? '').trim();

  s = toHalfWidthAscii(s);
  s = stripParensAll(s);

  // スペース全部無視
  s = s.replace(/\s+/g, '');

  // 大小無視
  s = s.toLowerCase();

  // 有無を問わない語を除去
  s = removeOptionalPhrases(s);

  // っ/ッ 無視
  s = dropSmallTsu(s);

  // ～/ー 無視
  s = dropWaveAndLong(s);

  // 小書き母音 無視
  s = dropSmallVowels(s);

  // 記号は中黒以外すべて無視（・は残る）
  s = stripSymbolsExceptNakaguro(s);

  // 念のためもう一回スペース除去
  s = s.replace(/\s+/g, '');

  return s;
}

// セーブキー
function buildSaveKey({ mode, rangeStart, rangeEnd, who, whom }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const a = String(who || 'ALL');
  const b = String(whom || 'ALL');
  return `study_waza_save_${m}_${rs}_${re}_${a}_${b}`;
}

function StudyWazaPlayInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeRaw = sp.get('mode') || 'range';
  const mode = modeRaw === 'all' ? 'all' : modeRaw === 'custom' ? 'custom' : 'range';

  const rangeStart = Number(sp.get('rangeStart') || '1') || 1;
  const rangeEnd = Number(sp.get('rangeEnd') || '0') || 0;

  const who = sp.get('who') || 'ALL';
  const whom = sp.get('whom') || 'ALL';

  // ★ resume=1 のときだけ復元する
  const resume = sp.get('resume') === '1';

  const opts = useMemo(() => {
    return {
      ignoreWrongAndGo: sp.get('ignoreWrongAndGo') === '1',
    };
  }, [sp]);

  const saveKey = useMemo(() => {
    return buildSaveKey({ mode, rangeStart, rangeEnd, who, whom });
  }, [mode, rangeStart, rangeEnd, who, whom]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [startedAt, setStartedAt] = useState(null);
  const [nowMs, setNowMs] = useState(0);

  const [targets, setTargets] = useState([]); // 出題対象（行そのもの）
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');

  const [phase, setPhase] = useState('playing'); // playing / reveal
  const [lastJudge, setLastJudge] = useState(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState([]);

  // ★最新値を常に保持（finishGameで古いstateを掴まないため）
  const mistakesRef = useRef([]);
  const correctRef = useRef(0);
  const nowRef = useRef(0);

  useEffect(() => {
    mistakesRef.current = mistakes;
  }, [mistakes]);
  useEffect(() => {
    correctRef.current = correctCount;
  }, [correctCount]);
  useEffect(() => {
    nowRef.current = nowMs;
  }, [nowMs]);

  // ---- ヒント：個別トグル ----
  const [hintOpen, setHintOpen] = useState({
    who: false,
    whom: false,
    scene: false,
    se: false,
    place_use: false,
    place_hit: false,
  });
  function toggleHint(k) {
    setHintOpen((p) => ({ ...p, [k]: !p[k] }));
  }
  function resetHints() {
    setHintOpen({
      who: false,
      whom: false,
      scene: false,
      se: false,
      place_use: false,
      place_hit: false,
    });
  }

  const inputRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/waza', { cache: 'no-store' });
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
    return rows[rows.length - 1]?.episode || 0;
  }, [rows]);

  const filteredTargets = useMemo(() => {
    if (!rows?.length) return [];

    let start = 1;
    let end = maxEpisode || 0;

    if (mode === 'range' || mode === 'custom') {
      start = Math.max(1, rangeStart);
      end = rangeEnd > 0 ? rangeEnd : Math.min(maxEpisode || 0, start + 99);
      end = Math.min(maxEpisode || end, end);
      if (end < start) end = start;
    }

    return rows.filter((r) => {
      if (!(r.episode >= start && r.episode <= end)) return false;
      if (who !== 'ALL' && r.who !== who) return false;
      if (whom !== 'ALL' && r.whom !== whom) return false;
      return true;
    });
  }, [rows, mode, rangeStart, rangeEnd, maxEpisode, who, whom]);

  const total = targets.length;
  const current = total ? targets[idx] : null;

  // タイマー
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNowMs(Date.now() - startedAt), 100);
    return () => clearInterval(t);
  }, [startedAt]);

  // セーブ（自動）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!startedAt) return;
    if (!targets.length) return;

    try {
      window.localStorage.setItem(
        saveKey,
        JSON.stringify({
          v: 1,
          mode,
          rangeStart,
          rangeEnd,
          who,
          whom,
          idx,
          total: targets.length,
          correctCount,
          mistakes,
          elapsedMs: nowMs,
        })
      );
    } catch {
      // ignore
    }
  }, [saveKey, startedAt, targets, idx, correctCount, mistakes, nowMs, mode, rangeStart, rangeEnd, who, whom]);

  // 初期化：resume=1なら復元、resume=0なら必ず新規
  useEffect(() => {
    if (loading) return;

    const t = filteredTargets;
    setTargets(t);

    if (!t.length) return;

    // ★復元は resume=1 のときだけ
    if (resume && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj.idx === 'number' && Array.isArray(obj.mistakes)) {
            setIdx(Math.min(obj.idx, t.length - 1));
            setCorrectCount(Number(obj.correctCount || 0));
            setMistakes(obj.mistakes || []);
            const elapsed = Number(obj.elapsedMs || 0);
            setStartedAt(Date.now() - Math.max(0, elapsed));
            setNowMs(Math.max(0, elapsed));
            setInput('');
            setPhase('playing');
            setLastJudge(null);
            resetHints();
            setTimeout(() => inputRef.current?.focus?.(), 50);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    // 新規開始（resume=0 or 復元不可）
    setIdx(0);
    setCorrectCount(0);
    setMistakes([]);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    setStartedAt(Date.now());
    setNowMs(0);
    resetHints();
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }, [loading, saveKey, filteredTargets, resume]);

  // idx が進んだらヒント閉じる
  useEffect(() => {
    resetHints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // 自己ベストキー（範囲＋絞り込み＋モードごと）
  const bestKey = useMemo(() => {
    if (mode === 'all') return `study_waza_best_all_${who}_${whom}`;
    return `study_waza_best_custom_${rangeStart}_${rangeEnd}_${who}_${whom}`;
  }, [mode, rangeStart, rangeEnd, who, whom]);

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
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(saveKey);
    } catch {}

    saveBestIfNeeded(finalCorrect, finalTimeMs);

    try {
      const payload = {
        mode,
        rangeStart,
        rangeEnd,
        maxEpisode,
        who,
        whom,
        correct: finalCorrect,
        timeMs: finalTimeMs,
        mistakes: finalMistakes,
        opts,
      };
      sessionStorage.setItem('study_waza_last_result', JSON.stringify(payload));
    } catch {}

    router.push('/study/waza/result');
  }

  function goNext() {
    const nextIdx = idx + 1;
    if (nextIdx >= total) {
      // ★最新refを使う（stateの取りこぼし防止）
      finishGame(correctRef.current, nowRef.current, mistakesRef.current);
      return;
    }
    setIdx(nextIdx);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    resetHints();
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

    const userNorm = normalizeWaza(userText);
    const correctNorm = normalizeWaza(current.waza_name);

    const ok = !isSkip && userNorm && userNorm === correctNorm;

    const judge = {
      ok,
      user: userText,
      correct: current.waza_name,
      episode: current.episode,
      isSkip,
    };

    if (ok) {
      setCorrectCount((c) => {
        const next = c + 1;
        correctRef.current = next; // ★refも即更新
        return next;
      });
      setPhase('reveal');
      setLastJudge(judge);
      setTimeout(() => goNext(), 700);
      return;
    }

    setMistakes((arr) => {
      const nextArr = [
        ...arr,
        {
          episode: current.episode,
          who: current.who,
          whom: current.whom,
          correctWaza: current.waza_name,
          userAnswer: isSkip ? '(スキップ)' : String(userText ?? ''),
        },
      ];
      mistakesRef.current = nextArr; // ★refも即更新
      return nextArr;
    });

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
    router.push('/study/waza');
  }

  const headerText = useMemo(() => {
    if (mode === 'all') return `全技RTA（1〜${maxEpisode || '---'}話）`;
    return `範囲（${rangeStart}〜${rangeEnd || '---'}話）`;
  }, [mode, maxEpisode, rangeStart, rangeEnd]);

  const hintValue = useMemo(() => {
    if (!current) return {};
    return {
      who: current.who || '—',
      whom: current.whom || '—',
      scene: current.scene || '—',
      se: current.se || '—',
      place_use: current.place_use || '—',
      place_hit: current.place_hit || '—',
    };
  }, [current]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">📘 技 学習</h1>
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

            <Link href="/study/waza" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              戻る
            </Link>
          </div>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">
            {msg}
          </div>
        )}

        {!total ? (
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-900">出題データがありません</p>
            <p className="text-[12px] text-slate-600 mt-1">範囲やキャラ絞り込みの条件で0件かも。</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-slate-600">
                進捗：<b className="text-slate-900">{idx + 1}</b> / {total}
              </p>
              <p className="text-[12px] text-slate-600">
                タイム：<b className="text-slate-900">{startedAt ? msToClock(nowMs) : '--:--'}</b>
              </p>
            </div>

            <div className="mt-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
              <p className="text-[12px] text-cyan-900 font-bold mb-1">第{current?.episode ?? '---'}話</p>
              <p className="text-sm text-cyan-950 leading-relaxed">技名を入力してください</p>

              {/* ヒント（個別ボタン） */}
              <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3">
                <p className="text-[12px] font-extrabold text-violet-900 mb-2">ヒント</p>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleHint('who')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    誰が
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHint('whom')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    誰に
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHint('scene')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    技補足/シーン
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleHint('se')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    効果音
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHint('place_use')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    使った場所
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHint('place_hit')}
                    className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                  >
                    当たった場所
                  </button>
                </div>

                {(hintOpen.who ||
                  hintOpen.whom ||
                  hintOpen.scene ||
                  hintOpen.se ||
                  hintOpen.place_use ||
                  hintOpen.place_hit) && (
                  <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-3 text-[12px] text-slate-800">
                    {hintOpen.who && (
                      <p className="mb-1">
                        誰が：<b className="text-slate-900">{hintValue.who}</b>
                      </p>
                    )}
                    {hintOpen.whom && (
                      <p className="mb-1">
                        誰に：<b className="text-slate-900">{hintValue.whom}</b>
                      </p>
                    )}
                    {hintOpen.scene && (
                      <p className="mb-1">
                        技補足/シーン：<b className="text-slate-900">{hintValue.scene}</b>
                      </p>
                    )}
                    {hintOpen.se && (
                      <p className="mb-1">
                        効果音：<b className="text-slate-900">{hintValue.se}</b>
                      </p>
                    )}
                    {hintOpen.place_use && (
                      <p className="mb-1">
                        使った場所：<b className="text-slate-900">{hintValue.place_use}</b>
                      </p>
                    )}
                    {hintOpen.place_hit && (
                      <p className="mb-1">
                        当たった場所：<b className="text-slate-900">{hintValue.place_hit}</b>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || !current || phase !== 'playing'}
                placeholder="ここに技名"
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
        )}

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

export default function StudyWazaPlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sky-50" />}>
      <StudyWazaPlayInner />
    </Suspense>
  );
}
