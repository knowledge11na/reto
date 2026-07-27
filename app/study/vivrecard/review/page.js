// file: app/study/vivrecard/review/page.js

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getRecentlyWrong,
  getWeakProfiles,
} from "@/lib/vivreStudy";

export default function VivreCardReviewPage() {

  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState("recent");

  const [type, setType] = useState("age");

  const [maxRate, setMaxRate] = useState(50);

  useEffect(() => {

    async function load() {

      const res =
        await fetch("/api/profile");

      const data =
        await res.json();

      if (data.ok) {

        setProfiles(data.items);

      }

      setLoading(false);

    }

    load();

  }, []);

  const reviewList = useMemo(() => {

    if (mode === "recent") {

      return getRecentlyWrong(
        profiles,
        100
      );

    }

    return getWeakProfiles(
      profiles,
      type,
      maxRate
    );

  }, [
    profiles,
    mode,
    type,
    maxRate,
  ]);

  if (loading) {

    return (

      <main className="min-h-screen flex items-center justify-center">

        読み込み中...

      </main>

    );

  }

  return (

    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-xl mx-auto px-4 py-8">

        <div className="flex justify-between items-center mb-6">

          <h1 className="text-2xl font-extrabold">

            📚 苦手復習

          </h1>

          <Link
            href="/study/vivrecard"
            className="underline"
          >

            戻る

          </Link>

        </div>

        <div className="bg-white rounded-3xl shadow p-6 mb-6">

          <div className="flex gap-3 mb-4">

            <button
              onClick={() => setMode("recent")}
              className={`flex-1 rounded-xl py-2 font-bold ${
                mode === "recent"
                  ? "bg-rose-500 text-white"
                  : "bg-gray-100"
              }`}
            >

              最近間違えた

            </button>

            <button
              onClick={() => setMode("weak")}
              className={`flex-1 rounded-xl py-2 font-bold ${
                mode === "weak"
                  ? "bg-rose-500 text-white"
                  : "bg-gray-100"
              }`}
            >

              正答率

            </button>

          </div>

          {mode === "weak" && (

            <>

              <div className="grid grid-cols-3 gap-2 mb-4">

                <button
                  onClick={() => setType("age")}
                  className={`rounded-lg py-2 ${
                    type === "age"
                      ? "bg-sky-500 text-white"
                      : "bg-gray-100"
                  }`}
                >

                  年齢

                </button>

                <button
                  onClick={() => setType("height")}
                  className={`rounded-lg py-2 ${
                    type === "height"
                      ? "bg-sky-500 text-white"
                      : "bg-gray-100"
                  }`}
                >

                  身長

                </button>

                <button
                  onClick={() => setType("blood")}
                  className={`rounded-lg py-2 ${
                    type === "blood"
                      ? "bg-sky-500 text-white"
                      : "bg-gray-100"
                  }`}
                >

                  血液型

                </button>

              </div>

              <div>

                <p className="text-sm mb-2">

                  正答率 {maxRate}% 以下

                </p>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={maxRate}
                  onChange={(e)=>
                    setMaxRate(
                      Number(e.target.value)
                    )
                  }
                  className="w-full"
                />

              </div>

            </>

          )}

        </div>

        <div className="bg-white rounded-3xl shadow">

          <div className="px-5 py-4 border-b font-bold">

            対象キャラ

            <span className="ml-2 text-rose-500">

              {reviewList.length}人

            </span>

          </div>

          {reviewList.length === 0 && (

            <div className="text-center py-10 text-gray-500">

              該当するキャラがありません

            </div>

          )}

          {reviewList.map(profile => (

            <div
              key={profile.number}
              className="flex justify-between items-center px-5 py-3 border-b last:border-none"
            >

              <div>

                <div className="font-bold">

                  {profile.name}

                </div>

                <div className="text-xs text-gray-500">

                  No.{profile.number}

                </div>

              </div>

              <Link
                href={`/study/vivrecard/play?start=${profile.number}&end=${profile.number}&mode=character&age=1&height=1&blood=1`}
                className="bg-rose-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-rose-600"
              >

                復習

              </Link>

            </div>

          ))}

        </div>

      </div>

    </main>

  );

}