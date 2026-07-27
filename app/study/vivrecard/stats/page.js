// file: app/study/vivrecard/stats/page.js

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  getProfile,
  getAccuracy,
} from "@/lib/vivreStudy";

export default function VivreCardStatsPage() {

  const [profiles, setProfiles] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [sort, setSort] =
    useState("number");

  const [type, setType] =
    useState("all");

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

  function totalRate(number) {

    const age =
      getAccuracy(number,"age");

    const height =
      getAccuracy(number,"height");

    const blood =
      getAccuracy(number,"blood");

    return Math.round(

      (age + height + blood) / 3

    );

  }

  function star(rate){

    if(rate>=95) return 5;
    if(rate>=80) return 4;
    if(rate>=60) return 3;
    if(rate>=40) return 2;
    if(rate>=20) return 1;

    return 0;

  }

  const list =
    useMemo(()=>{

      let arr=[...profiles];

      if(search){

        arr=arr.filter(profile=>

          profile.name.includes(search)

        );

      }

      if(sort==="number"){

        arr.sort((a,b)=>

          a.number-b.number

        );

      }

      if(sort==="rate"){

        arr.sort((a,b)=>

          totalRate(b.number)-

          totalRate(a.number)

        );

      }

      if(sort==="weak"){

        arr.sort((a,b)=>

          totalRate(a.number)-

          totalRate(b.number)

        );

      }

      if(sort==="recent"){

        arr.sort((a,b)=>{

          const aa=

            getProfile(a.number).lastWrong||0;

          const bb=

            getProfile(b.number).lastWrong||0;

          return bb-aa;

        });

      }

      return arr;

    },[
      profiles,
      search,
      sort
    ]);

  if(loading){

    return(

      <main className="min-h-screen flex items-center justify-center">

        読み込み中...

      </main>

    );

  }

  return(

    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-3xl mx-auto px-4 py-6">

        <header className="flex justify-between items-center mb-6">

          <h1 className="text-2xl font-extrabold">

            📊 学習データ

          </h1>

          <Link
            href="/study/vivrecard"
            className="underline"
          >

            戻る

          </Link>

        </header>

        <div className="bg-white rounded-3xl shadow p-5 mb-5">

          <input

            value={search}

            onChange={(e)=>

              setSearch(e.target.value)

            }

            placeholder="キャラ検索"

            className="w-full border rounded-xl p-3"

          />

          <div className="grid grid-cols-2 gap-3 mt-4">

            <select

              value={sort}

              onChange={(e)=>

                setSort(e.target.value)

              }

              className="border rounded-xl p-3"

            >

              <option value="number">

                No順

              </option>

              <option value="rate">

                正答率順

              </option>

              <option value="weak">

                苦手順

              </option>

              <option value="recent">

                最近間違えた順

              </option>

            </select>

            <select

              value={type}

              onChange={(e)=>

                setType(e.target.value)

              }

              className="border rounded-xl p-3"

            >

              <option value="all">

                総合

              </option>

              <option value="age">

                年齢

              </option>

              <option value="height">

                身長

              </option>

              <option value="blood">

                血液型

              </option>

            </select>

          </div>

        </div>


        <div className="space-y-4">

          {list.map(profile=>{

            const ageRate =
              getAccuracy(profile.number,"age");

            const heightRate =
              getAccuracy(profile.number,"height");

            const bloodRate =
              getAccuracy(profile.number,"blood");

            const total =
              totalRate(profile.number);

            const rate =

              type==="age"
                ? ageRate
                : type==="height"
                ? heightRate
                : type==="blood"
                ? bloodRate
                : total;

            const stars =
              star(rate);

            return(

              <div
                key={profile.number}
                className="bg-white rounded-3xl shadow p-5"
              >

                <div className="flex justify-between items-center">

                  <div>

                    <div className="text-xs text-gray-500">

                      No.{profile.number}

                    </div>

                    <div className="text-xl font-extrabold">

                      {profile.name}

                    </div>

                  </div>

                  <div className="text-right">

                    <div className="text-yellow-500 text-xl">

                      {"★".repeat(stars)}

                      <span className="text-gray-300">

                        {"★".repeat(5-stars)}

                      </span>

                    </div>

                    <div className="font-bold">

                      {rate}%

                    </div>

                  </div>

                </div>

                <div className="mt-5 space-y-4">

                  {(type==="all"||type==="age")&&(

                    <div>

                      <div className="flex justify-between text-sm mb-1">

                        <span>

                          年齢

                        </span>

                        <span>

                          {ageRate}%

                        </span>

                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-3">

                        <div
                          className="bg-green-500 h-3 rounded-full"
                          style={{
                            width:`${ageRate}%`
                          }}
                        />

                      </div>

                    </div>

                  )}

                  {(type==="all"||type==="height")&&(

                    <div>

                      <div className="flex justify-between text-sm mb-1">

                        <span>

                          身長

                        </span>

                        <span>

                          {heightRate}%

                        </span>

                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-3">

                        <div
                          className="bg-sky-500 h-3 rounded-full"
                          style={{
                            width:`${heightRate}%`
                          }}
                        />

                      </div>

                    </div>

                  )}

                  {(type==="all"||type==="blood")&&(

                    <div>

                      <div className="flex justify-between text-sm mb-1">

                        <span>

                          血液型

                        </span>

                        <span>

                          {bloodRate}%

                        </span>

                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-3">

                        <div
                          className="bg-rose-500 h-3 rounded-full"
                          style={{
                            width:`${bloodRate}%`
                          }}
                        />

                      </div>

                    </div>

                  )}

                </div>

                <div className="mt-5 border-t pt-4">

                  {(() => {

                    const data =
                      getProfile(profile.number);

                    const ageTotal =
                      data.age.correct +
                      data.age.wrong;

                    const heightTotal =
                      data.height.correct +
                      data.height.wrong;

                    const bloodTotal =
                      data.blood.correct +
                      data.blood.wrong;

                    return (

                      <div className="grid grid-cols-3 gap-3 text-center text-sm">

                        <div className="rounded-xl bg-green-50 p-3">

                          <div className="font-bold text-green-700">

                            年齢

                          </div>

                          <div className="mt-2">

                            ○ {data.age.correct}

                          </div>

                          <div>

                            × {data.age.wrong}

                          </div>

                          <div className="text-xs text-gray-500 mt-2">

                            {ageTotal}問

                          </div>

                        </div>

                        <div className="rounded-xl bg-sky-50 p-3">

                          <div className="font-bold text-sky-700">

                            身長

                          </div>

                          <div className="mt-2">

                            ○ {data.height.correct}

                          </div>

                          <div>

                            × {data.height.wrong}

                          </div>

                          <div className="text-xs text-gray-500 mt-2">

                            {heightTotal}問

                          </div>

                        </div>

                        <div className="rounded-xl bg-rose-50 p-3">

                          <div className="font-bold text-rose-700">

                            血液型

                          </div>

                          <div className="mt-2">

                            ○ {data.blood.correct}

                          </div>

                          <div>

                            × {data.blood.wrong}

                          </div>

                          <div className="text-xs text-gray-500 mt-2">

                            {bloodTotal}問

                          </div>

                        </div>

                      </div>

                    );

                  })()}

                  <div className="mt-4 flex justify-between items-center text-sm">

                    <span className="text-gray-500">

                      最後に間違えた

                    </span>

                    <span className="font-bold">

                      {getProfile(profile.number).lastWrong
                        ? new Date(
                            getProfile(profile.number).lastWrong
                          ).toLocaleDateString("ja-JP")
                        : "なし"}

                    </span>

                  </div>

                </div>

              </div>

            );

          })}

          {list.length===0&&(

            <div className="bg-white rounded-3xl shadow p-8 text-center text-gray-500">

              該当するキャラがいません

            </div>

          )}

        </div>

      </div>

    </main>

  );

}

