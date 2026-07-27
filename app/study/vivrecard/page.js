// file: app/study/vivrecard/page.js


"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function VivreCardStudyPage() {
  const router = useRouter();

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // 範囲
const [start, setStart] = useState(1);
const [end, setEnd] = useState(9999);

  // 出題方向
  const [mode, setMode] = useState("character");

  // 項目
  const [age, setAge] = useState(true);
  const [height, setHeight] = useState(true);
  const [blood, setBlood] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();

        if (data.ok) {
          setProfiles(data.items);

          if (data.items.length < 100) {
            const maxNumber = Math.max(
  ...data.items.map(p => p.number)
);

setEnd(maxNumber);

          }
        }
      } catch (e) {
        console.error(e);
      }

      setLoading(false);
    }

    load();
  }, []);

  function startStudy() {
    if (!age && !height && !blood) {
      alert("少なくとも1項目選択してください。");
      return;
    }

    if (start > end) {
      alert("開始No.が終了No.を超えています。");
      return;
    }

    router.push(
      `/study/vivrecard/play?start=${start}&end=${end}&mode=${mode}&age=${age ? 1 : 0}&height=${height ? 1 : 0}&blood=${blood ? 1 : 0}`
    );
  }

  const count = profiles.filter(
    (p) => p.number >= start && p.number <= end
  ).length;

  return (
    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-md mx-auto px-4 py-6">

        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">
            📘 ビブルカード情報
          </h1>

          <Link
            href="/study"
            className="text-sm underline"
          >
            戻る
          </Link>
        </header>

        {loading ? (

          <div className="text-center py-10">
            読み込み中...
          </div>

        ) : (

          <>
            <div className="rounded-2xl bg-white p-5 shadow mb-4">

              <h2 className="font-bold mb-3">
                学習範囲
              </h2>

              <div className="flex items-center gap-2">

                <input
                  type="number"
                  value={start}
                  min={1}
                  max={profiles.length}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className="border rounded-lg p-2 w-full"
                />

                <span>～</span>

                <input
                  type="number"
                  value={end}
                  min={1}
                  max={profiles.length}
                  onChange={(e) => setEnd(Number(e.target.value))}
                  className="border rounded-lg p-2 w-full"
                />

              </div>

              <div className="mt-3 flex gap-2 flex-wrap">

<button
  onClick={() => {
    setStart(1);
   setEnd(
  Math.max(...profiles.map(p => p.number))
);
  }}
  className="text-xs px-3 py-2 rounded-lg bg-purple-100 hover:bg-purple-200"
>
  全て
</button>

                <button
                  onClick={() => {
                    setStart(1);
                    setEnd(100);
                  }}
                  className="text-xs px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200"
                >
                  No.1〜100
                </button>

                <button
                  onClick={() => {
                    setStart(101);
                    setEnd(200);
                  }}
                  className="text-xs px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200"
                >
                  No.101〜200
                </button>

                <button
                  onClick={() => {
                    setStart(201);
                    setEnd(300);
                  }}
                  className="text-xs px-3 py-2 rounded-lg bg-rose-100 hover:bg-rose-200"
                >
                  No.201〜300
                </button>

              </div>

              <p className="text-xs text-gray-500 mt-3">
                対象キャラ：{count}人
              </p>

            </div>

            <div className="rounded-2xl bg-white p-5 shadow mb-4">

              <h2 className="font-bold mb-3">
                出題方向
              </h2>

              <label className="block mb-2">

                <input
                  type="radio"
                  checked={mode === "character"}
                  onChange={() => setMode("character")}
                />

                <span className="ml-2">
                  キャラ → プロフィール
                </span>

              </label>

              <label>

                <input
                  type="radio"
                  checked={mode === "profile"}
                  onChange={() => setMode("profile")}
                />

                <span className="ml-2">
                  プロフィール → キャラ
                </span>

              </label>

            </div>

            <div className="rounded-2xl bg-white p-5 shadow mb-6">

              <h2 className="font-bold mb-3">
                出題項目
              </h2>

              <label className="block mb-2">

                <input
                  type="checkbox"
                  checked={age}
                  onChange={() => setAge(!age)}
                />

                <span className="ml-2">
                  年齢
                </span>

              </label>

              <label className="block mb-2">

                <input
                  type="checkbox"
                  checked={height}
                  onChange={() => setHeight(!height)}
                />

                <span className="ml-2">
                  身長
                </span>

              </label>

              <label>

                <input
                  type="checkbox"
                  checked={blood}
                  onChange={() => setBlood(!blood)}
                />

                <span className="ml-2">
                  血液型
                </span>

              </label>

            </div>

            <button
              onClick={startStudy}
              className="w-full rounded-2xl bg-rose-500 py-4 text-white font-bold text-lg hover:bg-rose-600 transition"
            >
              学習開始
            </button>

<div className="mt-4">

<button
  onClick={() => {
    localStorage.setItem(
      "vivreAllSetting",
      JSON.stringify({
        start,
        end,
        type: "age",
      })
    );

    router.push("/study/vivrecard/all");
  }}
  className="block w-full rounded-2xl bg-purple-500 py-4 text-white font-bold text-lg text-center hover:bg-purple-600 transition"
>
  🔥 年齢 全員回答チャレンジ
</button>

</div>

          </>

        )}

      </div>

    </main>
  );
}