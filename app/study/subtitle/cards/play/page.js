// file: app/study/subtitle/cards/play/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ---- 色ルール：下一桁で色 ----
// 1=赤, 2=燈, 3=黄, 4=緑, 5=青, 6=藍, 7=紫, 8=白, 9=灰, 0=薄茶（10）
function colorClassByLastDigit(ep) {
  const d = Math.abs(Number(ep || 0)) % 10;
  if (d === 1) return { bg: 'bg-rose-50', bd: 'border-rose-400', tx: 'text-rose-900' };
  if (d === 2) return { bg: 'bg-orange-50', bd: 'border-orange-400', tx: 'text-orange-900' };
  if (d === 3) return { bg: 'bg-yellow-50', bd: 'border-yellow-400', tx: 'text-yellow-900' };
  if (d === 4) return { bg: 'bg-emerald-50', bd: 'border-emerald-400', tx: 'text-emerald-900' };
  if (d === 5) return { bg: 'bg-sky-50', bd: 'border-sky-400', tx: 'text-sky-900' };
  if (d === 6) return { bg: 'bg-indigo-50', bd: 'border-indigo-400', tx: 'text-indigo-900' }; // 藍
  if (d === 7) return { bg: 'bg-violet-50', bd: 'border-violet-400', tx: 'text-violet-900' };
  if (d === 8) return { bg: 'bg-white', bd: 'border-slate-300', tx: 'text-slate-900' };
  if (d === 9) return { bg: 'bg-slate-100', bd: 'border-slate-400', tx: 'text-slate-900' };
  // 0(10)
  return { bg: 'bg-amber-50', bd: 'border-amber-300', tx: 'text-amber-900' }; // 薄茶
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// セーブキー（範囲＋ランダム有無で分離）
function buildCardsKey({ mode, rangeStart, rangeEnd, randomOrder }) {
  const m = mode || 'range';
  const rs = Number(rangeStart || 1);
  const re = Number(rangeEnd || 0);
  const rnd = randomOrder ? 1 : 0;
  return `study_subtitle_cards_${m}_${rs}_${re}_${rnd}`;
}

export default function StudySubtitleCardsPlayPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const modeRaw = sp.get('mode') || 'range';
  const mode = modeRaw === 'all' ? 'all' : modeRaw === 'custom' ? 'custom' : 'range';

  const rangeStart = Number(sp.get('rangeStart') || '1') || 1;
  const rangeEnd = Number(sp.get('rangeEnd') || '0') || 0;
  const randomOrder = sp.get('randomOrder') === '1';

  const saveKey = useMemo(() => {
    return buildCardsKey({ mode, rangeStart, rangeEnd, randomOrder });
  }, [mode, rangeStart, rangeEnd, randomOrder]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // 進捗
  const [learnedSet, setLearnedSet] = useState(() => new Set()); // episodeのSet
  const [deck, setDeck] = useState([]); // 今周回のエピソード配列（learned除外済み）
  const [idx, setIdx] = useState(0); // deck内index
  const [side, setSide] = useState('front'); // front/back

  const lastSavedRef = useRef(0);

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
    return rows[rows.length - 1]?.episode || 0;
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

  const totalTargets = targets.length;

  // 復元（targetsが揃ったタイミングで）
  useEffect(() => {
    if (loading) return;
    if (!targets.length) return;

    // localStorageから復元
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);

          const learnedArr = Array.isArray(obj?.learned) ? obj.learned : [];
          const learned = new Set(learnedArr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0));

          const savedDeck = Array.isArray(obj?.deck) ? obj.deck : null;
          const savedIdx = typeof obj?.idx === 'number' ? obj.idx : 0;
          const savedSide = obj?.side === 'back' ? 'back' : 'front';

          // deckが無い場合は作り直す
          let nextDeck = savedDeck && savedDeck.length ? savedDeck : null;

          // deckの中に範囲外のepisodeが紛れたら作り直す
          const targetSet = new Set(targets.map((t) => t.episode));
          if (nextDeck) {
            for (const ep of nextDeck) {
              if (!targetSet.has(ep)) {
                nextDeck = null;
                break;
              }
            }
          }

          if (!nextDeck) {
            const pool = targets.map((t) => t.episode).filter((ep) => !learned.has(ep));
            nextDeck = randomOrder ? shuffle(pool) : pool;
          }

          setLearnedSet(learned);
          setDeck(nextDeck);
          setIdx(Math.max(0, Math.min(savedIdx, Math.max(0, nextDeck.length - 1))));
          setSide(savedSide);
          return;
        }
      } catch {
        // ignore
      }
    }

    // 新規
    const pool = targets.map((t) => t.episode);
    const nextDeck = randomOrder ? shuffle(pool) : pool;
    setLearnedSet(new Set());
    setDeck(nextDeck);
    setIdx(0);
    setSide('front');
  }, [loading, targets.length, saveKey, randomOrder]);

  // 自動セーブ（頻繁すぎないように軽く間引く）
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
          randomOrder: randomOrder ? 1 : 0,
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
  }, [saveKey, targets.length, learnedSet, deck, idx, side, mode, rangeStart, rangeEnd, randomOrder]);

  const remaining = useMemo(() => {
    const learnedCount = learnedSet?.size || 0;
    return Math.max(0, totalTargets - learnedCount);
  }, [totalTargets, learnedSet]);

  const currentEp = deck.length ? deck[idx] : null;
  const currentRow = currentEp ? mapByEpisode.get(currentEp) : null;

  // 周回処理：deckが空になったら未習得だけで新しい周回を作る
  function rebuildDeckIfNeeded(nextLearnedSet) {
    const learned = nextLearnedSet || learnedSet;
    const pool = targets.map((t) => t.episode).filter((ep) => !learned.has(ep));

    if (!pool.length) {
      setDeck([]);
      setIdx(0);
      setSide('front');
      return;
    }

    const nextDeck = randomOrder ? shuffle(pool) : pool;
    setDeck(nextDeck);
    setIdx(0);
    setSide('front');
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
  }

  function prevCard() {
    if (!deck.length) return;
    const prev = Math.max(0, idx - 1);
    setIdx(prev);
    setSide('front');
  }

  function flip() {
    if (!deck.length) return;
    setSide((s) => (s === 'front' ? 'back' : 'front'));
  }

  function markLearned() {
    if (!currentEp) return;

    // learnedに追加
    setLearnedSet((prev) => {
      const next = new Set(prev);
      next.add(currentEp);
      return next;
    });

    // deckから除外（この周回でも消す）
    setDeck((prevDeck) => {
      const nextDeck = prevDeck.filter((ep) => ep !== currentEp);

      if (!nextDeck.length) {
        setTimeout(() => {
          rebuildDeckIfNeeded(new Set([...learnedSet, currentEp]));
        }, 0);
        return nextDeck;
      }

      const nextIdx = Math.min(idx, nextDeck.length - 1);
      setIdx(nextIdx);
      setSide('front');
      return nextDeck;
    });
  }

  function markUnknown() {
    nextCard();
  }

  function resetProgress() {
    if (!confirm('進捗をリセットしますか？（覚えたが全て復活します）')) return;
    setLearnedSet(new Set());
    const pool = targets.map((t) => t.episode);
    setDeck(randomOrder ? shuffle(pool) : pool);
    setIdx(0);
    setSide('front');

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(saveKey);
      }
    } catch {
      // ignore
    }
  }

  function onQuit() {
    router.push('/study/subtitle/cards');
  }

  const headerText = useMemo(() => {
    if (mode === 'all') return `全話（1〜${maxEpisode || '---'}）`;
    return `範囲（${rangeStart}〜${rangeEnd || '---'}）`;
  }, [mode, maxEpisode, rangeStart, rangeEnd]);

  const color = useMemo(() => colorClassByLastDigit(currentEp || 0), [currentEp]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">🗂️ 単語カード：サブタイ</h1>
            <p className="text-[11px] text-slate-700">
              {headerText}
              {randomOrder ? <span className="ml-2 text-[10px] text-slate-600">（ランダム）</span> : null}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onQuit}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              戻る
            </button>

            <Link href="/study/subtitle" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              サブタイへ
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
            style={{ minHeight: 180 }}
          >
            {currentRow ? (
              <>
                {side === 'front' ? (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>TAPでめくる</p>
                    <p className={`mt-2 text-4xl font-extrabold ${color.tx}`}>#{currentRow.episode}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（表：話数）</p>
                  </>
                ) : (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>答え</p>
                    <p className={`mt-2 text-lg font-extrabold ${color.tx} leading-relaxed`}>{currentRow.title}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（裏：サブタイトル）</p>
                  </>
                )}
              </>
            ) : (
              <div className="text-center text-slate-700">
                {loading ? '読み込み中...' : deck.length === 0 ? 'この範囲は全て「覚えた」になりました！' : 'データがありません'}
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

          <p className="mt-3 text-[11px] text-slate-500">※自動セーブされます（範囲＋ランダムごとに別保存）</p>
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
