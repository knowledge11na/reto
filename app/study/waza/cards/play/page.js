// file: app/study/waza/cards/play/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ---- 色ルール：下一桁で色（サブタイと同じ）----
function colorClassByLastDigit(ep) {
  const d = Math.abs(Number(ep || 0)) % 10;
  if (d === 1) return { bg: 'bg-rose-50', bd: 'border-rose-400', tx: 'text-rose-900' };
  if (d === 2) return { bg: 'bg-orange-50', bd: 'border-orange-400', tx: 'text-orange-900' };
  if (d === 3) return { bg: 'bg-yellow-50', bd: 'border-yellow-400', tx: 'text-yellow-900' };
  if (d === 4) return { bg: 'bg-emerald-50', bd: 'border-emerald-400', tx: 'text-emerald-900' };
  if (d === 5) return { bg: 'bg-sky-50', bd: 'border-sky-400', tx: 'text-sky-900' };
  if (d === 6) return { bg: 'bg-indigo-50', bd: 'border-indigo-400', tx: 'text-indigo-900' };
  if (d === 7) return { bg: 'bg-violet-50', bd: 'border-violet-400', tx: 'text-violet-900' };
  if (d === 8) return { bg: 'bg-white', bd: 'border-slate-300', tx: 'text-slate-900' };
  if (d === 9) return { bg: 'bg-slate-100', bd: 'border-slate-400', tx: 'text-slate-900' };
  return { bg: 'bg-amber-50', bd: 'border-amber-300', tx: 'text-amber-900' };
}

// セーブキー（範囲＋絞り込みで分離）
function buildCardsKey({ mode, rangeStart, rangeEnd, who, whom }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const a = String(who || 'ALL');
  const b = String(whom || 'ALL');
  return `study_waza_cards_${m}_${rs}_${re}_${a}_${b}`;
}

export default function StudyWazaCardsPlayPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeRaw = sp.get('mode') || 'range';
  const mode = modeRaw === 'all' ? 'all' : modeRaw === 'custom' ? 'custom' : 'range';

  const rangeStart = Number(sp.get('rangeStart') || '1') || 1;
  const rangeEnd = Number(sp.get('rangeEnd') || '0') || 0;

  const who = sp.get('who') || 'ALL';
  const whom = sp.get('whom') || 'ALL';

  const saveKey = useMemo(() => {
    return buildCardsKey({ mode, rangeStart, rangeEnd, who, whom });
  }, [mode, rangeStart, rangeEnd, who, whom]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // 進捗
  const [learnedSet, setLearnedSet] = useState(() => new Set()); // rowKey の Set
  const [deck, setDeck] = useState([]); // rowKey配列（learned除外済み）
  const [idx, setIdx] = useState(0);
  const [side, setSide] = useState('front'); // front/back

  // ヒント（個別トグル）※表だけ
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

  const lastSavedRef = useRef(0);

  // データ取得
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

  // 対象範囲＋絞り込み
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

    return rows.filter((r) => {
      if (!(r.episode >= start && r.episode <= end)) return false;
      if (who !== 'ALL' && r.who !== who) return false;
      if (whom !== 'ALL' && r.whom !== whom) return false;
      return true;
    });
  }, [rows, mode, rangeStart, rangeEnd, maxEpisode, who, whom]);

  // 技は同じ話数に複数あるので「話数だけ」だと被る → 安定キー
  // ※APIで id を返せるなら id を使うのが一番良い
  function makeRowKey(r) {
    const ep = Number(r?.episode || 0);
    const w = String(r?.waza_name || '');
    const a = String(r?.who || '');
    const b = String(r?.whom || '');
    return `${ep}__${a}__${b}__${w}`;
  }

  const mapByKey = useMemo(() => {
    const m = new Map();
    for (const r of targets || []) {
      m.set(makeRowKey(r), r);
    }
    return m;
  }, [targets]);

  const totalTargets = targets.length;

  // 復元
  useEffect(() => {
    if (loading) return;
    if (!targets.length) return;

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);

          const learnedArr = Array.isArray(obj?.learned) ? obj.learned : [];
          const learned = new Set(learnedArr.map((x) => String(x)).filter(Boolean));

          const savedDeck = Array.isArray(obj?.deck) ? obj.deck : null;
          const savedIdx = typeof obj?.idx === 'number' ? obj.idx : 0;
          const savedSide = obj?.side === 'back' ? 'back' : 'front';

          let nextDeck = savedDeck && savedDeck.length ? savedDeck : null;

          const targetKeys = new Set(targets.map((t) => makeRowKey(t)));
          if (nextDeck) {
            for (const k of nextDeck) {
              if (!targetKeys.has(k)) {
                nextDeck = null;
                break;
              }
            }
          }

          if (!nextDeck) {
            const pool = targets.map((t) => makeRowKey(t)).filter((k) => !learned.has(k));
            nextDeck = pool; // ランダム無し
          }

          setLearnedSet(learned);
          setDeck(nextDeck);
          setIdx(Math.max(0, Math.min(savedIdx, Math.max(0, nextDeck.length - 1))));
          setSide(savedSide);
          resetHints();
          return;
        }
      } catch {
        // ignore
      }
    }

    // 新規
    const pool = targets.map((t) => makeRowKey(t));
    setLearnedSet(new Set());
    setDeck(pool);
    setIdx(0);
    setSide('front');
    resetHints();
  }, [loading, targets.length, saveKey]);

  // 自動セーブ
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!targets.length) return;

    const now = Date.now();
    if (now - lastSavedRef.current < 200) return;
    lastSavedRef.current = now;

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
          learned: Array.from(learnedSet),
          deck,
          idx,
          side,
          savedAt: now,
        })
      );
    } catch {
      // ignore
    }
  }, [saveKey, targets.length, learnedSet, deck, idx, side, mode, rangeStart, rangeEnd, who, whom]);

  // カードが変わったらヒント閉じる（表のみ）
  useEffect(() => {
    resetHints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, side]);

  const remaining = useMemo(() => {
    const learnedCount = learnedSet?.size || 0;
    return Math.max(0, totalTargets - learnedCount);
  }, [totalTargets, learnedSet]);

  const currentKey = deck.length ? deck[idx] : null;
  const currentRow = currentKey ? mapByKey.get(currentKey) : null;

  const hintValue = useMemo(() => {
    if (!currentRow) return {};
    return {
      who: currentRow.who || '—',
      whom: currentRow.whom || '—',
      scene: currentRow.scene || '—',
      se: currentRow.se || '—',
      place_use: currentRow.place_use || '—',
      place_hit: currentRow.place_hit || '—',
    };
  }, [currentRow]);

  function rebuildDeckIfNeeded(nextLearnedSet) {
    const learned = nextLearnedSet || learnedSet;
    const pool = targets.map((t) => makeRowKey(t)).filter((k) => !learned.has(k));

    if (!pool.length) {
      setDeck([]);
      setIdx(0);
      setSide('front');
      resetHints();
      return;
    }

    setDeck(pool); // ランダム無し
    setIdx(0);
    setSide('front');
    resetHints();
  }

  function nextCard() {
    if (!deck.length) return;
    const next = idx + 1;
    if (next >= deck.length) {
      rebuildDeckIfNeeded();
      return;
    }
    setIdx(next);
    setSide('front');
    resetHints();
  }

  function prevCard() {
    if (!deck.length) return;
    setIdx(Math.max(0, idx - 1));
    setSide('front');
    resetHints();
  }

  function flip() {
    if (!deck.length) return;
    setSide((s) => (s === 'front' ? 'back' : 'front'));
    resetHints();
  }

  function markLearned() {
    if (!currentKey) return;

    setLearnedSet((prev) => {
      const next = new Set(prev);
      next.add(currentKey);
      return next;
    });

    setDeck((prevDeck) => {
      const nextDeck = prevDeck.filter((k) => k !== currentKey);

      if (!nextDeck.length) {
        setTimeout(() => {
          rebuildDeckIfNeeded(new Set([...learnedSet, currentKey]));
        }, 0);
        return nextDeck;
      }

      const nextIdx = Math.min(idx, nextDeck.length - 1);
      setIdx(nextIdx);
      setSide('front');
      resetHints();
      return nextDeck;
    });
  }

  function markUnknown() {
    nextCard();
  }

  function resetProgress() {
    if (!confirm('進捗をリセットしますか？（覚えたが全て復活します）')) return;

    setLearnedSet(new Set());
    const pool = targets.map((t) => makeRowKey(t));
    setDeck(pool);
    setIdx(0);
    setSide('front');
    resetHints();

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(saveKey);
      }
    } catch {
      // ignore
    }
  }

  function onQuit() {
    router.push('/study/waza/cards');
  }

  const headerText = useMemo(() => {
    if (mode === 'all') return `全技（1〜${maxEpisode || '---'}話）`;
    return `範囲（${rangeStart}〜${rangeEnd || '---'}話）`;
  }, [mode, maxEpisode, rangeStart, rangeEnd]);

  const color = useMemo(() => colorClassByLastDigit(currentRow?.episode || 0), [currentRow?.episode]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">🗂️ 単語カード：技</h1>
            <p className="text-[11px] text-slate-700">{headerText}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onQuit}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              戻る
            </button>

            <Link href="/study/waza" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              技へ
            </Link>
          </div>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">{msg}</div>
        )}

        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-slate-600">
              進捗：<b className="text-slate-900">{learnedSet.size}</b> / {totalTargets || 0}（残り {remaining}）
            </p>
            <p className="text-[12px] text-slate-600">
              デッキ：<b className="text-slate-900">{deck.length ? idx + 1 : 0}</b> / {deck.length || 0}
            </p>
          </div>

          {/* カード */}
          <button
            type="button"
            onClick={flip}
            disabled={loading || !currentRow}
            className={`mt-3 w-full text-left rounded-3xl border-2 ${color.bd} ${color.bg} p-5 shadow-sm active:scale-[0.99] transition disabled:opacity-60`}
            style={{ minHeight: 240 }}
          >
            {currentRow ? (
              <>
                {side === 'front' ? (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>TAPでめくる</p>
                    <p className={`mt-2 text-4xl font-extrabold ${color.tx}`}>#{currentRow.episode}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（表：話数）</p>

                    {/* ヒント（表だけ） */}
                    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3">
                      <p className="text-[12px] font-extrabold text-violet-900 mb-2">ヒント</p>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('who');
                          }}
                          className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                        >
                          誰が
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('whom');
                          }}
                          className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                        >
                          誰に
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('scene');
                          }}
                          className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                        >
                          技補足/シーン
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('se');
                          }}
                          className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                        >
                          効果音
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('place_use');
                          }}
                          className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                        >
                          使った場所
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleHint('place_hit');
                          }}
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
                  </>
                ) : (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>答え</p>
                    <p className={`mt-2 text-lg font-extrabold ${color.tx} leading-relaxed`}>{currentRow.waza_name}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（裏：技名）</p>
                  </>
                )}
              </>
            ) : (
              <div className="text-center text-slate-700">
                {loading
                  ? '読み込み中...'
                  : deck.length === 0
                  ? 'この条件は全て「覚えた」になりました！'
                  : 'データがありません'}
              </div>
            )}
          </button>

          {/* 操作 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={markLearned}
              disabled={!currentRow}
              className="py-3 rounded-full bg-emerald-600 text-white font-extrabold shadow active:bg-emerald-700 disabled:bg-gray-400"
            >
              覚えた
            </button>

            <button
              type="button"
              onClick={markUnknown}
              disabled={!currentRow}
              className="py-3 rounded-full bg-slate-700 text-white font-extrabold shadow active:bg-slate-800 disabled:bg-gray-400"
            >
              分からない
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={prevCard}
              disabled={!deck.length || idx === 0}
              className="flex-1 py-2 rounded-full border border-slate-300 bg-white text-slate-900 font-bold shadow-sm disabled:opacity-50"
            >
              前へ
            </button>

            <button
              type="button"
              onClick={nextCard}
              disabled={!deck.length}
              className="flex-1 py-2 rounded-full border border-slate-300 bg-white text-slate-900 font-bold shadow-sm disabled:opacity-50"
            >
              次へ
            </button>

            <button
              type="button"
              onClick={resetProgress}
              className="px-4 py-2 rounded-full bg-rose-600 text-white font-extrabold shadow active:bg-rose-700"
            >
              リセット
            </button>
          </div>

          <p className="mt-3 text-[11px] text-slate-500">※自動セーブされます（範囲＋絞り込みごとに別保存）</p>
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
