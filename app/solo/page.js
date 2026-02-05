// file: app/solo/page.js
'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';

export default function SoloMenuPage() {
  const [meteorBest, setMeteorBest] = useState(0);
  const [sniperBest, setSniperBest] = useState(0);
  const [dungeonBest, setDungeonBest] = useState(null);
  const [bombBest, setBombBest] = useState(0);
const [beforeBest, setBeforeBest] = useState(0);


  // ★ 仕分け（出身）
  const [bornBest, setBornBest] = useState(0);

  // ★ 仕分け（血液型）
  const [bloodtypeBest, setBloodtypeBest] = useState(0);

  // ★ 風船割り：各モード自己ベスト（ローカル保存）
  const [balloonBests, setBalloonBests] = useState({
    food: 0,
    height: 0,
    age: 0,
    bounty: 0,
    other: 0,
  });

  const [me, setMe] = useState(null);

  const soloTitlesSentRef = useRef(false);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          setMe(data.user);
        } else {
          setMe(null);
        }
      } catch {
        setMe(null);
      }
    };
    fetchMe();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawMeteor = window.localStorage.getItem('meteor_best_score');
      const m = rawMeteor ? Number(rawMeteor) : 0;
      if (!Number.isNaN(m) && m > 0) setMeteorBest(m);

      const rawSniper = window.localStorage.getItem('sniper_best_score');
      const s = rawSniper ? Number(rawSniper) : 0;
      if (!Number.isNaN(s) && s > 0) setSniperBest(s);

      const rawDungeon = window.localStorage.getItem('dungeon_best_score');
      const d = rawDungeon ? Number(rawDungeon) : 0;
      if (!Number.isNaN(d) && d > 0) setDungeonBest(d);
      else setDungeonBest(null);

      const rawBomb = window.localStorage.getItem('bomb_best_score');
      const b = rawBomb ? Number(rawBomb) : 0;
      if (!Number.isNaN(b) && b > 0) setBombBest(b);

      // ★ 仕分け（出身）
      const rawBorn = window.localStorage.getItem('born_best_score');
      const bb = rawBorn ? Number(rawBorn) : 0;
      if (!Number.isNaN(bb) && bb > 0) setBornBest(bb);

      // ★ 仕分け（血液型）
      const rawBlood = window.localStorage.getItem('bloodtype_best_score');
      const bt = rawBlood ? Number(rawBlood) : 0;
      if (!Number.isNaN(bt) && bt > 0) setBloodtypeBest(bt);

      // ★ 時系列（before pacman）
      const rawBefore = window.localStorage.getItem('before_pac_best_score');
      const bp = rawBefore ? Number(rawBefore) : 0;
      if (!Number.isNaN(bp) && bp > 0) setBeforeBest(bp);


      // ★ 風船割り（5モード）
      const keys = ['food', 'height', 'age', 'bounty', 'other'];
      const next = {};
      for (const k of keys) {
        const raw = window.localStorage.getItem(`balloon_best_${k}`);
        const n = raw ? Number(raw) : 0;
        next[k] = Number.isFinite(n) && n > 0 ? n : 0;
      }
      setBalloonBests((prev) => ({ ...prev, ...next }));
    } catch {
      // 無視
    }
  }, []);

  useEffect(() => {
    if (!me || !me.id) return;
    if (soloTitlesSentRef.current) return;

    // 何も記録が無いときは送らない（無駄打ち防止）
    const hasAny =
      meteorBest > 0 ||
      sniperBest > 0 ||
      (typeof dungeonBest === 'number' && dungeonBest > 0) ||
      bombBest > 0 ||
      bornBest > 0 ||
      bloodtypeBest > 0 ||
      Math.max(
        balloonBests.food || 0,
        balloonBests.height || 0,
        balloonBests.age || 0,
        balloonBests.bounty || 0,
        balloonBests.other || 0
      ) > 0;

    if (!hasAny) return;

    soloTitlesSentRef.current = true;

    fetch('/api/solo/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'solo_menu',
        userId: me.id,

        meteorBest,
        sniperBest,

        dungeonBest: typeof dungeonBest === 'number' ? dungeonBest : 0,
        bombBest,
        bornBest,

        // ★ 血液型も送る（API側で未対応なら無視されるだけ）
        bloodtypeBest,

        balloonBests: {
          food: balloonBests.food || 0,
          height: balloonBests.height || 0,
          age: balloonBests.age || 0,
          bounty: balloonBests.bounty || 0,
          other: balloonBests.other || 0,
        },
      }),
    }).catch(() => {});
  }, [me, meteorBest, sniperBest, dungeonBest, bombBest, bornBest, bloodtypeBest, balloonBests]);

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">🎮 ソロゲームメニュー</h1>
          <Link href="/" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ホームに戻る
          </Link>
        </header>

        <p className="text-[12px] text-sky-900 mb-4">1人でプレイできるモードです。レートは変動しません。</p>

        <div className="space-y-3">
          {/* 隕石クラッシュ */}
          <div className="rounded-2xl border border-indigo-400 bg-indigo-50 px-3 py-3 shadow-sm">
            <Link href="/solo/meteor" className="block">
              <p className="text-sm font-bold text-indigo-900">隕石クラッシュ（記述式）</p>
              <p className="text-[11px] text-indigo-950 leading-tight mt-1">
                記述式だけ出題。問題が隕石のように降ってくる。制限時間内にどれだけ破壊できるか。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-indigo-900">
              <span>
                自己ベスト: <span className="font-semibold">{meteorBest}</span> 個
              </span>
              <Link href="/solo/meteor/rules" className="underline text-indigo-700 hover:text-indigo-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* 正答スナイパー */}
          <div className="rounded-2xl border border-emerald-400 bg-emerald-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/sniper"
              className="block hover:bg-emerald-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-emerald-900">正答スナイパー（単一選択）</p>
              <p className="text-[11px] text-emerald-950 leading-tight mt-1">
                単一選択の正解だけを素早く撃ち抜く3分間のタイムアタック。正解で時間回復・ミスで時間減少。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-900">
              <span>
                自己ベスト: <span className="font-semibold">{sniperBest}</span> 問
              </span>
              <Link href="/solo/sniper/rules" className="underline text-emerald-700 hover:text-emerald-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ダンジョン */}
          <div className="rounded-2xl border border-amber-400 bg-amber-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/dungeon"
              className="block hover:bg-amber-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-amber-900">ダンジョン（複数回答）</p>
              <p className="text-[11px] text-amber-950 leading-tight mt-1">
                モンスターの弱点だけを選んで魔法攻撃する複数選択専用モード。5回ミスで終了。
              </p>
            </Link>

            <div className="mt-2 flex items-center justify-between text-[11px] text-amber-900">
              <span>
                自己ベスト: <span className="font-semibold">{dungeonBest != null ? dungeonBest : '--'}</span> 問
              </span>
              <Link href="/solo/dungeon/rules" className="underline text-amber-700 hover:text-amber-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* 爆弾解除 */}
          <div className="rounded-2xl border border-fuchsia-400 bg-fuchsia-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/bomb"
              className="block hover:bg-fuchsia-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-fuchsia-900">爆弾解除（並び替え）</p>
              <p className="text-[11px] text-fuchsia-950 leading-tight mt-1">
                並び替え問題だけを使った爆弾解除モード。正しい順にコードを切って、できるだけ多くの爆弾を解除しよう。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-fuchsia-900">
              <span>
                自己ベスト: <span className="font-semibold">{bombBest}</span> 個
              </span>
              <Link href="/solo/bomb/rules" className="underline text-fuchsia-700 hover:text-fuchsia-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ボス討伐 */}
          <Link
            href="/solo/boss"
            className="block rounded-2xl border border-rose-400 bg-rose-50 px-3 py-3 shadow-sm hover:bg-rose-100"
          >
            <p className="text-sm font-bold text-rose-900">ボス討伐（全形式）</p>
            <p className="text-[11px] text-rose-950 leading-tight mt-1">
              単一・複数・並び替え・記述、全形式の問題を使ってボスのHPを削るモード。
            </p>
          </Link>

          {/* サブタイミニゲーム */}
          <div className="rounded-2xl border border-cyan-400 bg-cyan-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/subtitle-game"
              className="block hover:bg-cyan-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-cyan-900">サブタイミニゲーム</p>
              <p className="text-[11px] text-cyan-950 leading-tight mt-1">サブタイトル系のワード当てミニゲーム。</p>
            </Link>
          </div>

          {/* 技ミニゲーム */}
          <div className="rounded-2xl border border-teal-400 bg-teal-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/waza-game"
              className="block hover:bg-teal-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-teal-900">技ミニゲーム</p>
              <p className="text-[11px] text-teal-950 leading-tight mt-1">技名のワード当てミニゲーム。</p>
            </Link>
          </div>

          {/* ナンバーゲーム */}
          <div className="rounded-2xl border border-lime-500 bg-lime-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/number"
              className="block hover:bg-lime-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-lime-900">ナンバーゲーム</p>
              <p className="text-[11px] text-lime-950 leading-tight mt-1">カードを使ったミニゲーム集。</p>
            </Link>
            <div className="mt-2 flex items-center justify-end text-[11px] text-lime-900" />
          </div>

          {/* ★ 風船割り（ナンバーゲームの下 / 未使用色：blue） */}
          <div className="rounded-2xl border border-blue-400 bg-blue-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/balloon"
              className="block hover:bg-blue-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-blue-900">風船割り（5モード）</p>
              <p className="text-[11px] text-blue-950 leading-tight mt-1">
                キャラ名の風船を、ルールに沿って答えを入力して割ろう。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-blue-900">
              <span>
                最高自己ベスト:{' '}
                <span className="font-semibold">
                  {Math.max(
                    balloonBests.food || 0,
                    balloonBests.height || 0,
                    balloonBests.age || 0,
                    balloonBests.bounty || 0,
                    balloonBests.other || 0
                  )}
                </span>{' '}
                個
              </span>
              <span className="text-[10px] text-blue-800">
                好物:{balloonBests.food} / 身長:{balloonBests.height} / 年齢:{balloonBests.age} / 懸賞金:
                {balloonBests.bounty} / その他:{balloonBests.other}
              </span>
            </div>
          </div>

          {/* ★ 仕分けゲーム（出身）（風船割りの下 / 未使用色：orange） */}
          <div className="rounded-2xl border border-orange-400 bg-orange-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/born"
              className="block hover:bg-orange-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-orange-900">仕分けゲーム（出身）</p>
              <p className="text-[11px] text-orange-950 leading-tight mt-1">
                動き回るキャラを掴んで、東/西/南/北/偉の正しい仕切りへ運び込む。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-orange-900">
              <span>
                自己ベスト: <span className="font-semibold">{bornBest}</span> 人
              </span>
              <Link href="/solo/born/rules" className="underline text-orange-700 hover:text-orange-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ★ 仕分けゲーム（血液型）（出身の下 / 同じ色・同じ様式） */}
          <div className="rounded-2xl border border-orange-400 bg-orange-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/bloodtype"
              className="block hover:bg-orange-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-orange-900">仕分けゲーム（血液型）</p>
              <p className="text-[11px] text-orange-950 leading-tight mt-1">
                動き回るキャラを掴んで、X/F/XF/S/S型RH- の正しい仕切りへ運び込む。
              </p>
            </Link>
            <div className="mt-2 flex items-center justify-between text-[11px] text-orange-900">
              <span>
                自己ベスト: <span className="font-semibold">{bloodtypeBest}</span> 人
              </span>
              <Link
                href="/solo/bloodtype/rules"
                className="underline text-orange-700 hover:text-orange-500"
              >
                ルールを見る
              </Link>
            </div>
          </div>

{/* ★ 時系列（仕分けの下 / 薄い黄色） */}
<div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3 shadow-sm">
  <Link
    href="/solo/before"
    className="block hover:bg-amber-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
  >
    <p className="text-sm font-bold text-amber-900">時系列</p>
    <p className="text-[11px] text-amber-950 leading-tight mt-1">
      A〜Eの出来事を、古い順 or 新しい順で選択する。
          </p>
  </Link>

  <div className="mt-2 flex items-center justify-between text-[11px] text-amber-900">
    <span>
      自己ベスト:{' '}
      <span className="font-semibold">
        {beforeBest > 0 ? beforeBest : '--'}
      </span>
    </span>
    <Link href="/solo/before/rules" className="underline text-amber-700 hover:text-amber-500">
      ルールを見る
    </Link>
  </div>
</div>



          {/* ワードル */}
          <div className="rounded-2xl border border-slate-400 bg-slate-50 px-3 py-3 shadow-sm">
            <Link
              href="/solo/wordle"
              className="block hover:bg-slate-100 rounded-2xl -mx-3 -my-3 px-3 py-3 transition"
            >
              <p className="text-sm font-bold text-slate-900">ワードル（5〜9文字）</p>
              <p className="text-[11px] text-slate-950 leading-tight mt-1">ひらがな単語を当てるパズル。</p>
            </Link>
            <div className="mt-2 flex items-center justify-end text-[11px] text-slate-900">
              <Link href="/solo/wordle/rules" className="underline text-slate-700 hover:text-slate-500">
                ルールを見る
              </Link>
            </div>
          </div>

          {/* ナレッジタワー（未公開） */}
          {/*
          <Link
  href="/solo/knowledge-tower"
  className="block rounded-2xl border border-violet-500 bg-violet-50 px-4 py-5 shadow-sm hover:bg-violet-100 transition"
>
  <p className="text-base font-extrabold text-violet-900">
    ナレッジタワー（タグ別）
  </p>
  <p className="text-[12px] text-violet-950 leading-relaxed mt-2">
    20階層の塔を、タグ別問題でひとつずつ攻略していくソロモード。
    <br />
    各フロア30問正解 → ボス戦で塔のてっぺんを目指そう。
  </p>
</Link>
          */}
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
