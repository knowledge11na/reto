// file: app/study/door/cards/play/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 扉絵カード：セーブキー（シート＋ランダム有無で分離）----
function buildCardsKey({ sheet, randomOrder }) {
  const s = String(sheet || 'ALL');
  const rnd = randomOrder ? 1 : 0;
  return `study_door_cards_${s}_${rnd}`;
}

// ヒント用：記号などを軽く落とした「見た目の文字列」
function simplifyForHint(s) {
  let x = String(s ?? '');

  // （）内は無視
  x = x.replace(/（[^）]*）/g, '');
  x = x.replace(/\([^)]*\)/g, '');

  // 記号/！/ー/～系を無視
  x = x.replace(/[!！?？"“”'’、。,.・:：;；/／\\\-‐-‒–—―~〜～_＿]/g, '');

  // スペースは詰める
  x = x.replace(/\s+/g, '');

  return x.trim();
}

function maskHead(s, n = 2) {
  const x = simplifyForHint(s);
  if (!x) return '—';
  const head = x.slice(0, n);
  return `${head}…`;
}

function maskTail(s, n = 2) {
  const x = simplifyForHint(s);
  if (!x) return '—';
  const tail = x.slice(Math.max(0, x.length - n));
  return `…${tail}`;
}

// ---- 色ルール：カードを少し見やすく（文字列のhashで安定色）----
function hashStrToDigit(s) {
  const x = String(s || '');
  let h = 0;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return h % 10;
}
function colorClassByDigit(d) {
  const n = Math.abs(Number(d || 0)) % 10;
  if (n === 1) return { bg: 'bg-rose-50', bd: 'border-rose-300', tx: 'text-rose-900' };
  if (n === 2) return { bg: 'bg-orange-50', bd: 'border-orange-300', tx: 'text-orange-900' };
  if (n === 3) return { bg: 'bg-yellow-50', bd: 'border-yellow-300', tx: 'text-yellow-900' };
  if (n === 4) return { bg: 'bg-emerald-50', bd: 'border-emerald-300', tx: 'text-emerald-900' };
  if (n === 5) return { bg: 'bg-sky-50', bd: 'border-sky-300', tx: 'text-sky-900' };
  if (n === 6) return { bg: 'bg-indigo-50', bd: 'border-indigo-300', tx: 'text-indigo-900' };
  if (n === 7) return { bg: 'bg-violet-50', bd: 'border-violet-300', tx: 'text-violet-900' };
  if (n === 8) return { bg: 'bg-white', bd: 'border-slate-300', tx: 'text-slate-900' };
  if (n === 9) return { bg: 'bg-slate-100', bd: 'border-slate-300', tx: 'text-slate-900' };
  return { bg: 'bg-amber-50', bd: 'border-amber-300', tx: 'text-amber-900' };
}

export default function StudyDoorCardsPlayPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const sheet = sp.get('sheet') || 'ALL';
  const randomOrder = sp.get('randomOrder') === '1'; // 将来拡張用

  const saveKey = useMemo(() => buildCardsKey({ sheet, randomOrder }), [sheet, randomOrder]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // 進捗
  const [learnedSet, setLearnedSet] = useState(() => new Set()); // id の Set
  const [deck, setDeck] = useState([]); // 今周回の id 配列（learned除外済み）
  const [idx, setIdx] = useState(0); // deck内index
  const [side, setSide] = useState('front'); // front/back

  // ヒント（表だけ）
  const [hintOpen, setHintOpen] = useState({
    len: false,
    head: false,
    tail: false,
  });
  function toggleHint(k) {
    setHintOpen((p) => ({ ...p, [k]: !p[k] }));
  }
  function resetHints() {
    setHintOpen({ len: false, head: false, tail: false });
  }

  const lastSavedRef = useRef(0);

  // データ取得
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/door', { cache: 'no-store' });
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

  // 対象（シートで絞る）
  const targets = useMemo(() => {
    if (!rows?.length) return [];
    return rows.filter((r) => (sheet === 'ALL' ? r.sheet === 'ALL' : r.sheet === sheet));
  }, [rows, sheet]);

  const mapById = useMemo(() => {
    const m = new Map();
    for (const r of rows || []) m.set(Number(r.id), r);
    return m;
  }, [rows]);

  const totalTargets = targets.length;

  // 復元（targetsが揃ったタイミングで）
  useEffect(() => {
    if (loading) return;

    if (!targets.length) {
      setLearnedSet(new Set());
      setDeck([]);
      setIdx(0);
      setSide('front');
      resetHints();
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);

          const learnedArr = Array.isArray(obj?.learned) ? obj.learned : [];
          const learned = new Set(
            learnedArr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
          );

          const savedDeck = Array.isArray(obj?.deck) ? obj.deck : null;
          const savedIdx = typeof obj?.idx === 'number' ? obj.idx : 0;
          const savedSide = obj?.side === 'back' ? 'back' : 'front';

          // deckが無い or 範囲外IDが混ざったら作り直す
          const targetIdSet = new Set(targets.map((t) => Number(t.id)));
          let nextDeck = savedDeck && savedDeck.length ? savedDeck.map((x) => Number(x)) : null;

          if (nextDeck) {
            for (const id of nextDeck) {
              if (!targetIdSet.has(id)) {
                nextDeck = null;
                break;
              }
            }
          }

          if (!nextDeck) {
            const pool = targets.map((t) => Number(t.id)).filter((id) => !learned.has(id));
            nextDeck = randomOrder ? shuffle(pool) : pool;
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
    const pool = targets.map((t) => Number(t.id));
    const nextDeck = randomOrder ? shuffle(pool) : pool;
    setLearnedSet(new Set());
    setDeck(nextDeck);
    setIdx(0);
    setSide('front');
    resetHints();
  }, [loading, targets.length, saveKey, randomOrder]);

  // 自動セーブ（軽く間引く）
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
          sheet,
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
  }, [saveKey, targets.length, learnedSet, deck, idx, side, sheet, randomOrder]);

  const remaining = useMemo(() => {
    const learnedCount = learnedSet?.size || 0;
    return Math.max(0, totalTargets - learnedCount);
  }, [totalTargets, learnedSet]);

  const currentId = deck.length ? Number(deck[idx]) : null;
  const currentRow = currentId ? mapById.get(currentId) : null;

  // deckが空になったら未習得だけで新しい周回を作る
  function rebuildDeckIfNeeded(nextLearnedSet) {
    const learned = nextLearnedSet || learnedSet;
    const pool = targets.map((t) => Number(t.id)).filter((id) => !learned.has(id));

    if (!pool.length) {
      setDeck([]);
      setIdx(0);
      setSide('front');
      resetHints();
      return;
    }

    const nextDeck = randomOrder ? shuffle(pool) : pool;
    setDeck(nextDeck);
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
    const prev = Math.max(0, idx - 1);
    setIdx(prev);
    setSide('front');
    resetHints();
  }

  function flip() {
    if (!deck.length) return;
    setSide((s) => (s === 'front' ? 'back' : 'front'));
    // 裏に行ったらヒントは閉じる（「表のみ」）
    if (side === 'front') resetHints();
  }

  function markLearned() {
    if (!currentId) return;

    setLearnedSet((prev) => {
      const next = new Set(prev);
      next.add(currentId);
      return next;
    });

    setDeck((prevDeck) => {
      const nextDeck = prevDeck.filter((id) => Number(id) !== currentId);

      if (!nextDeck.length) {
        setTimeout(() => {
          rebuildDeckIfNeeded(new Set([...learnedSet, currentId]));
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
    const pool = targets.map((t) => Number(t.id));
    setDeck(randomOrder ? shuffle(pool) : pool);
    setIdx(0);
    setSide('front');
    resetHints();

    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(saveKey);
    } catch {
      // ignore
    }
  }

  function onQuit() {
    router.push('/study/door');
  }

  // ヒント値（答えから作る）
  const hint = useMemo(() => {
    const ans = currentRow?.a || '';
    const simp = simplifyForHint(ans);
    return {
      len: simp ? String(simp.length) : '—',
      head: maskHead(ans, 2),
      tail: maskTail(ans, 2),
    };
  }, [currentRow]);

  const headerText = useMemo(() => {
    return sheet === 'ALL' ? 'ALL（全ての扉絵）' : `シート：${sheet}`;
  }, [sheet]);

  const color = useMemo(() => {
    const d = hashStrToDigit(currentRow?.q || sheet);
    return colorClassByDigit(d);
  }, [currentRow, sheet]);

  const showHintBox = hintOpen.len || hintOpen.head || hintOpen.tail;

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">🗂️ 単語カード：扉絵</h1>
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

            <Link href="/study" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              学習メニュー
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

          {/* カード（buttonの入れ子禁止なので、外側はdiv） */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (loading || !currentRow) return;
              flip();
            }}
            onKeyDown={(e) => {
              if (loading || !currentRow) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                flip();
              }
            }}
            className={`mt-3 w-full text-left rounded-3xl border-2 ${color.bd} ${color.bg} p-5 shadow-sm active:scale-[0.99] transition ${
              loading || !currentRow ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{ minHeight: 190 }}
          >
            {currentRow ? (
              <>
                {side === 'front' ? (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>TAPでめくる</p>
                    <p className={`mt-2 text-3xl font-extrabold ${color.tx}`}>{currentRow.q}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（表：シリーズ＋番号）</p>
                  </>
                ) : (
                  <>
                    <p className={`text-[12px] font-bold ${color.tx}`}>答え</p>
                    <p className={`mt-2 text-lg font-extrabold ${color.tx} leading-relaxed`}>{currentRow.a}</p>
                    <p className="mt-3 text-[12px] text-slate-700">（裏：扉絵サブタイトル）</p>
                  </>
                )}

                {/* ヒント（表のみ） */}
                {side === 'front' && (
                  <div
                    className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-[12px] font-extrabold text-violet-900 mb-2">ヒント（表のみ）</p>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleHint('len');
                        }}
                        className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                      >
                        文字数
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleHint('head');
                        }}
                        className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                      >
                        先頭2
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleHint('tail');
                        }}
                        className="py-2 rounded-xl bg-white border border-violet-200 text-[12px] font-bold text-violet-900 shadow-sm hover:bg-violet-100"
                      >
                        末尾2
                      </button>
                    </div>

                    {showHintBox && (
                      <div className="mt-3 rounded-2xl border border-violet-200 bg-white p-3 text-[12px] text-slate-800">
                        {hintOpen.len && (
                          <p className="mb-1">
                            文字数：<b className="text-slate-900">{hint.len}</b>
                          </p>
                        )}
                        {hintOpen.head && (
                          <p className="mb-1">
                            先頭2：<b className="text-slate-900">{hint.head}</b>
                          </p>
                        )}
                        {hintOpen.tail && (
                          <p className="mb-1">
                            末尾2：<b className="text-slate-900">{hint.tail}</b>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-slate-700">
                {loading ? '読み込み中...' : deck.length === 0 ? 'このシートは全て「覚えた」になりました！' : 'データがありません'}
              </div>
            )}
          </div>

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

          <p className="mt-3 text-[11px] text-slate-500">※自動セーブされます（シートごとに別保存）</p>
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
