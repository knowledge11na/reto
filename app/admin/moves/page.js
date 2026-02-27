// file: app/admin/moves/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function keyOf(dx, dy) {
  return `${dx},${dy}`;
}

// 盤面（中心=0,0）
// 画像イメージに合わせて 9x9（-4..+4）
const R = 4;
const N = R * 2 + 1;

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function AdminMovesPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [moves, setMoves] = useState({}); // { "18": [{dx,dy},...] }

  const [moveId, setMoveId] = useState(18);
  const [selected, setSelected] = useState(() => new Set()); // "dx,dy"
  const [centerLocked, setCenterLocked] = useState(true); // (0,0) は常にONにしたい人向け

  const load = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/moves', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg(json?.error || `取得失敗 status=${res.status}`);
        setMoves({});
        return;
      }
      setMoves(json.moves || {});
    } catch (e) {
      setMsg(e?.message || '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // moveId 変更時：既存を反映
  useEffect(() => {
    const arr = Array.isArray(moves?.[String(moveId)]) ? moves[String(moveId)] : [];
    const s = new Set();
    for (const c of arr) {
      const dx = Number(c?.dx);
      const dy = Number(c?.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      s.add(keyOf(dx, dy));
    }
    if (centerLocked) s.add(keyOf(0, 0));
    setSelected(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveId, moves]);

  const cellsList = useMemo(() => {
    const out = [];
    for (const k of selected) {
      const [dxs, dys] = k.split(',');
      const dx = Number(dxs);
      const dy = Number(dys);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      out.push({ dx, dy });
    }
    // 見やすく：dy↑優先、dx→
    out.sort((a, b) => (a.dy - b.dy) || (a.dx - b.dx));
    return out;
  }, [selected]);

  const toggleCell = (dx, dy) => {
    const k = keyOf(dx, dy);
    if (centerLocked && dx === 0 && dy === 0) return;

    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);

      if (centerLocked) n.add(keyOf(0, 0));
      return n;
    });
  };

  const save = async () => {
    setMsg('');
    const id = clampInt(moveId, 1, 9999);

    const payload = {
      move_id: id,
      cells: cellsList,
    };

    try {
      const res = await fetch('/api/admin/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg(json?.error || `保存失敗 status=${res.status}`);
        return;
      }
      setMsg(`保存しました：move ${id}（${cellsList.length} cells）`);
      await load();
    } catch (e) {
      setMsg(e?.message || '保存に失敗しました');
    }
  };

  const clear = () => {
    const s = new Set();
    if (centerLocked) s.add(keyOf(0, 0));
    setSelected(s);
  };

  const presetPlus = () => {
    const s = new Set();
    s.add(keyOf(0, 0));
    s.add(keyOf(1, 0));
    s.add(keyOf(-1, 0));
    s.add(keyOf(0, 1));
    s.add(keyOf(0, -1));
    setSelected(s);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <p className="text-sm font-bold">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold">Move 登録（デバッグ）</h1>
            <p className="text-[11px] text-slate-600 mt-1">
              黄色のマスをタップして move.json に登録（dx,dy の相対移動）
            </p>
          </div>
          <div className="text-right text-[11px] font-bold text-slate-700">
            <Link href="/admin" className="underline hover:text-slate-900">
              管理へ
            </Link>
            <span className="mx-2">|</span>
            <Link href="/" className="underline hover:text-slate-900">
              ホーム
            </Link>
          </div>
        </header>

        {msg ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-bold">
            {msg}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[12px] font-extrabold">move番号</div>
              <input
                value={moveId}
                onChange={(e) => setMoveId(clampInt(e.target.value, 1, 9999))}
                className="w-24 px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                inputMode="numeric"
              />
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={centerLocked}
                  onChange={(e) => {
                    const v = !!e.target.checked;
                    setCenterLocked(v);
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (v) n.add(keyOf(0, 0));
                      return n;
                    });
                  }}
                />
                中心(0,0)は常にON
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={presetPlus}
                className="px-3 py-2 rounded-2xl border border-amber-300 bg-amber-50 text-[11px] font-extrabold hover:bg-amber-100"
              >
                ＋プリセット
              </button>
              <button
                type="button"
                onClick={clear}
                className="px-3 py-2 rounded-2xl border border-slate-300 bg-white text-[11px] font-extrabold hover:bg-slate-50"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={save}
                className="px-4 py-2 rounded-2xl bg-sky-600 text-white text-[11px] font-extrabold hover:bg-sky-700"
              >
                保存
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col lg:flex-row gap-4">
            {/* grid */}
            <div className="flex-1">
              <div className="text-[11px] text-slate-600 mb-2">
                タップでON/OFF（中心が赤枠）
              </div>

              <div className="inline-block rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: N * N }).map((_, i) => {
                    const gx = i % N; // 0..N-1
                    const gy = Math.floor(i / N);

                    // 画面上：上が dy=-R
                    const dx = gx - R;
                    const dy = gy - R;

                    const k = keyOf(dx, dy);
                    const on = selected.has(k);
                    const isCenter = dx === 0 && dy === 0;

                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleCell(dx, dy)}
                        className={
                          'w-10 h-10 sm:w-11 sm:h-11 rounded-xl border transition relative ' +
                          (isCenter
                            ? 'border-rose-400'
                            : 'border-slate-200 hover:border-slate-300')
                        }
                        style={{
                          background: on ? 'rgba(250,204,21,0.95)' : 'rgba(255,255,255,1)',
                        }}
                        title={`dx=${dx}, dy=${dy}`}
                      >
                        {isCenter ? (
                          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-rose-700">
                            ●
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* list */}
            <div className="w-full lg:w-80">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[12px] font-extrabold">登録される move_cells</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  形式：<span className="font-mono">{"[{dx,dy}, ...]"}</span>
                </div>

                <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {cellsList.length ? (
                    cellsList.map((c, idx) => (
                      <div
                        key={`${c.dx},${c.dy}`}
                        className="text-[11px] font-bold text-slate-800 border-b border-slate-200 last:border-b-0 py-1"
                      >
                        {String(idx + 1).padStart(2, '0')}: dx {c.dx}, dy {c.dy}
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-500">（なし）</div>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-slate-600">
                  ※ この move は <span className="font-extrabold">現在位置 + (dx,dy)</span> の着地点を許可します
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="text-[12px] font-extrabold">既存 move 一覧</div>
                <div className="mt-2 max-h-44 overflow-auto space-y-1">
                  {Object.keys(moves || {}).length ? (
                    Object.keys(moves)
                      .map((k) => Number(k))
                      .filter((n) => Number.isFinite(n))
                      .sort((a, b) => a - b)
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setMoveId(id)}
                          className={
                            'w-full text-left px-3 py-2 rounded-xl border text-[11px] font-extrabold ' +
                            (Number(moveId) === id
                              ? 'border-sky-300 bg-sky-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50')
                          }
                        >
                          move {id}（{(moves?.[String(id)] || []).length}）
                        </button>
                      ))
                  ) : (
                    <div className="text-[11px] text-slate-500">（move.json が空）</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[12px] font-extrabold">使い方</div>
          <ol className="mt-2 list-decimal list-inside text-[11px] text-slate-700 space-y-1">
            <li>move番号を入れる（例：18）</li>
            <li>移動可能にしたいマス（黄色）をタップしてON</li>
            <li>保存 → <span className="font-mono">data/move.json</span> に反映</li>
            <li>sim-quiz の bootstrap が move.json を読み、move_cells が反映される</li>
          </ol>
        </section>
      </div>
    </main>
  );
}