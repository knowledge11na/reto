// file: app/solo/knowledge-tower/debug-boss/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const MAX_FLOOR = 20;
const STORAGE_KEY = 'tower_boss_layout_v1';

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function loadAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveAll(obj) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

function getDefaultLayout(floor) {
  // いまの見た目に近い初期値
  const f = Number(floor) || 1;
  // 1〜20で微調整したくなるならここで分岐してもOK
  return {
    // 位置：親の中央を基準にpxで動かす（+右 / +下）
    x: 0,
    y: 0,
    // 大きさ：幅を%で（今の w-[78%] 相当）
    wPct: 78,
    // 追加で拡大縮小したい時
    scale: 1,
    // 回転
    rotate: 0,
  };
}

export default function TowerBossDebugPage() {
  const [floor, setFloor] = useState(1);
  const [all, setAll] = useState({});
  const [layout, setLayout] = useState(getDefaultLayout(1));
  const [copied, setCopied] = useState(false);

  const bossImage = useMemo(() => `/tower/boss${floor}.png`, [floor]);

  useEffect(() => {
    const a = loadAll();
    setAll(a);
  }, []);

  useEffect(() => {
    const key = String(floor);
    const cur = all?.[key] || null;
    setLayout(cur ? cur : getDefaultLayout(floor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, all]);

  function update(patch) {
    setLayout((prev) => ({ ...prev, ...patch }));
  }

  function save() {
    const next = { ...(all || {}) };
    next[String(floor)] = {
      x: clamp(layout.x, -500, 500),
      y: clamp(layout.y, -500, 500),
      wPct: clamp(layout.wPct, 10, 140),
      scale: clamp(layout.scale, 0.2, 3),
      rotate: clamp(layout.rotate, -180, 180),
    };
    setAll(next);
    saveAll(next);
    alert(`保存した！ ${floor}F`);
  }

  function resetThis() {
    const next = { ...(all || {}) };
    delete next[String(floor)];
    setAll(next);
    saveAll(next);
    setLayout(getDefaultLayout(floor));
  }

  function exportJson() {
    const text = JSON.stringify(all || {}, null, 2);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    });
  }

  function importJson() {
    const raw = prompt('JSON貼り付けてOK（全フロア上書き）');
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') throw new Error('invalid');
      setAll(obj);
      saveAll(obj);
      alert('取り込みOK！');
    } catch {
      alert('JSONが壊れてるっぽい');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold">🧪 Tower Boss 位置調整（デバッグ）</h1>
            <p className="text-xs text-white/70 mt-1">
              ここで保存した値は localStorage に入り、タワー本体に即反映されます。
            </p>
          </div>
          <div className="text-right text-xs font-bold">
            <Link href="/solo/knowledge-tower" className="underline hover:text-amber-200">
              タワーへ
            </Link>
            <span className="mx-2">|</span>
            <Link href="/solo" className="underline hover:text-amber-200">
              ソロへ
            </Link>
          </div>
        </header>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">階</span>
              <select
                value={floor}
                onChange={(e) => setFloor(Number(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold"
              >
                {Array.from({ length: MAX_FLOOR }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}F
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={save}
                className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-extrabold text-sm"
              >
                保存
              </button>
              <button
                onClick={resetThis}
                className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 font-extrabold text-sm"
              >
                この階をリセット
              </button>
            </div>
          </div>

          {/* プレビュー */}
          <div className="mt-4 relative w-full max-w-3xl mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <img
              src="/tower/boss0.png"
              alt="boss-bg"
              className="w-full h-[260px] sm:h-[320px] object-cover opacity-90"
            />

            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={bossImage}
                alt={`boss-${floor}`}
                style={{
                  width: `${layout.wPct}%`,
                  transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale}) rotate(${layout.rotate}deg)`,
                  transformOrigin: 'center center',
                }}
                className="max-h-[90%] object-contain"
              />
            </div>

            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-extrabold">
              Boss {floor}F
            </div>
          </div>

          {/* スライダー */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Slider label="x（右＋）" min={-300} max={300} step={1} value={layout.x} onChange={(v) => update({ x: v })} />
            <Slider label="y（下＋）" min={-300} max={300} step={1} value={layout.y} onChange={(v) => update({ y: v })} />
            <Slider label="幅 w%" min={20} max={120} step={1} value={layout.wPct} onChange={(v) => update({ wPct: v })} />
            <Slider label="scale" min={0.2} max={2.2} step={0.01} value={layout.scale} onChange={(v) => update({ scale: v })} />
            <Slider label="rotate" min={-45} max={45} step={0.1} value={layout.rotate} onChange={(v) => update({ rotate: v })} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={exportJson}
              className="px-4 py-2 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 font-extrabold text-xs"
            >
              JSONコピー {copied ? '✅' : ''}
            </button>
            <button
              onClick={importJson}
              className="px-4 py-2 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 font-extrabold text-xs"
            >
              JSON取り込み（上書き）
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Slider({ label, min, max, step, value, onChange }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold">{label}</span>
        <span className="text-xs text-white/70 font-bold">{Number(value).toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2"
      />
    </div>
  );
}
