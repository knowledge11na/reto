// file: components/StoryPlayer.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

function resolveCharImage(charKey, characters) {
  if (!charKey) return '';
  const c = characters?.[charKey];
  // left/center/right に tarou2 とか入る想定なので
  // charactersシートに tarou2 が無い場合は keyそのものを画像キーとして使えるようにする
  const img = c?.default_image || '';
  if (img) return img;

  // フォールバック： /story/char/{key}.PNG
  return `/story/char/${charKey}.PNG`;
}

function resolveBg(bgKey, backgrounds) {
  if (!bgKey) return '/story/bg/black.png';
  const p = backgrounds?.[bgKey]?.image_path;
  if (p) return p;
  // フォールバック： /story/bg/{bgKey}.png
  return `/story/bg/${bgKey}.png`;
}

export default function StoryPlayer({ chapterId }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [shakeOn, setShakeOn] = useState(false);
  const waitTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const r = await fetch('/api/story/data', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          setErr(j?.error || 'story load failed');
          return;
        }
        if (cancelled) return;
        setData(j);
        setIdx(0);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr('story load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const chapterLines = useMemo(() => {
    if (!data?.lines) return [];
    return data.lines.filter((l) => l.chapter === chapterId);
  }, [data, chapterId]);

  const line = chapterLines[idx] || null;

  const speakerName = useMemo(() => {
    if (!line) return '';
    const sp = line.speaker;
    const ch = data?.characters?.[sp];
    return ch?.display_name || sp || '';
  }, [line, data]);

  // wait_ms 自動進行
  useEffect(() => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (!line) return;

    const w = line.wait_ms;
    if (typeof w === 'number' && w > 0) {
      waitTimerRef.current = setTimeout(() => {
        goNext();
      }, w);
    }
    return () => {
      if (waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, line?.wait_ms]);

  function doShake() {
    setShakeOn(true);
    setTimeout(() => setShakeOn(false), 250);
  }

  function handleCommand(cmd) {
    if (!cmd) return false;

    // battle_start: battleへ（mode=story）
    if (cmd === 'battle_start') {
      const tag = line?.quiz_tag || '';
      // ここから先はあなたのバトル実装に合わせてクエリを増やせる
      router.push(`/battle?mode=story&tag=${encodeURIComponent(tag)}&chapter=${encodeURIComponent(chapterId)}`);
      return true;
    }

    // battle_end: 戻ってきた想定で次へ
    if (cmd === 'battle_end') {
      return false;
    }

    // chapter_end とか入れたくなったらここに追加
    return false;
  }

  function goNext() {
    if (!chapterLines.length) return;

    // commandを踏む
    const cmd = line?.command || '';
    const handled = handleCommand(cmd);
    if (handled) return;

    // shake 指定
    if (line?.shake) doShake();

    // 次へ
    if (idx < chapterLines.length - 1) setIdx((v) => v + 1);
  }

  function goPrev() {
    if (idx > 0) setIdx((v) => v - 1);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-sm font-bold">ストーリー読み込み中...</p>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-sm font-extrabold">ストーリー読込エラー</p>
          <p className="mt-2 text-xs text-rose-200 whitespace-pre-wrap">{err}</p>
          <p className="mt-3 text-xs text-white/70">public/story/story.xlsx が存在するか確認してね</p>
        </div>
      </main>
    );
  }

  if (!line) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-sm font-bold">この章の行がありません（chapter={chapterId}）</p>
      </main>
    );
  }

  const bgUrl = resolveBg(line.bg, data?.backgrounds);

  const leftImg = resolveCharImage(line.left, data?.characters);
  const centerImg = resolveCharImage(line.center, data?.characters);
  const rightImg = resolveCharImage(line.right, data?.characters);

  return (
    <main className={'min-h-screen text-white relative overflow-hidden ' + (shakeOn ? 'storyShake' : '')}>
      {/* 横持ち強制（縦だと操作できないようにする） */}
      <div className="portraitBlock">
        <div className="p-6 text-center">
          <p className="text-lg font-extrabold">📱 端末を横にしてね</p>
          <p className="mt-2 text-sm text-white/80">ストーリーモードは横持ち専用です</p>
        </div>
      </div>

      {/* 背景 */}
      <div className="absolute inset-0 bg-black">
        <img src={bgUrl} alt="bg" className="w-full h-full object-cover opacity-95" />
        <div className="absolute inset-0 bg-black/35" />
      </div>

      {/* タイトル（bigTitle） */}
      {line.bigTitle ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-3 rounded-3xl bg-black/60 border border-white/15 text-4xl sm:text-5xl font-extrabold tracking-wide">
            {line.bigTitle}
          </div>
        </div>
      ) : null}

      {/* キャラ配置 */}
      <div className="absolute inset-0 z-10">
        {/* 左 */}
        {leftImg ? (
          <img
            src={leftImg}
            alt="left"
            className="absolute left-2 bottom-[92px] h-[62vh] max-h-[520px] object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.55)]"
          />
        ) : null}

        {/* 中央 */}
        {centerImg ? (
          <img
            src={centerImg}
            alt="center"
            className="absolute left-1/2 -translate-x-1/2 bottom-[92px] h-[68vh] max-h-[560px] object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.55)]"
          />
        ) : null}

        {/* 右 */}
        {rightImg ? (
          <img
            src={rightImg}
            alt="right"
            className="absolute right-2 bottom-[92px] h-[62vh] max-h-[520px] object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.55)]"
          />
        ) : null}
      </div>

      {/* セリフ枠（少し大きめ） */}
      <div className="absolute left-0 right-0 bottom-0 z-40 px-4 pb-4">
        <div className="rounded-3xl border border-white/15 bg-black/55 backdrop-blur-md shadow-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm sm:text-base font-extrabold text-white">
              {speakerName ? speakerName : '　'}
            </div>
            <div className="text-[11px] text-white/70 font-bold">
              {idx + 1}/{chapterLines.length}
            </div>
          </div>

          <p className="mt-2 text-base sm:text-lg font-bold leading-relaxed whitespace-pre-wrap text-white">
            {line.text}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={idx === 0}
              className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-extrabold disabled:opacity-30"
            >
              戻る
            </button>

            <button
              type="button"
              onClick={goNext}
              className="px-5 py-2.5 rounded-full bg-sky-500 hover:bg-sky-600 text-xs font-extrabold shadow"
            >
              次へ（タップ）
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* 端末縦持ちブロック */
        .portraitBlock {
          position: absolute;
          inset: 0;
          z-index: 999;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.92);
        }
        @media (orientation: portrait) {
          .portraitBlock {
            display: flex;
          }
        }

        .storyShake {
          animation: sshake 0.25s linear;
        }
        @keyframes sshake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-8px, 2px); }
          50% { transform: translate(8px, -2px); }
          75% { transform: translate(-6px, -2px); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </main>
  );
}
