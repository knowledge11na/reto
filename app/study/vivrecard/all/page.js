// file: app/study/vivrecard/all/page.js

export const dynamic = "force-dynamic";

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function VivreCardAllPage() {

  const searchParams = useSearchParams();

  const start =
    Number(searchParams.get("start")) || 1;

  const end =
    Number(searchParams.get("end")) || 100;

  const type =
    searchParams.get("type") || "age";
    // age height blood

  const [profiles,setProfiles] =
    useState([]);

  const [loading,setLoading] =
    useState(true);

  const [question,setQuestion] =
    useState(null);

  const [input,setInput] =
    useState("");

  const [answered,setAnswered] =
    useState([]);

  const [wrongMessage,setWrongMessage] =
    useState("");

  const [giveUp,setGiveUp] =
    useState(false);

  useEffect(()=>{

    async function load(){

      const res =
        await fetch("/api/profile");

      const data =
        await res.json();

      if(data.ok){

const list =

  data.items.filter(profile=>{

    if(
      profile.number < start ||
      profile.number > end
    ){
      return false;
    }


    if(type==="age"){

      return (
        profile.age !== "不明" &&
        profile.age !== ""
      );

    }


    if(type==="height"){

      return (
        profile.height !== "不明" &&
        profile.height !== ""
      );

    }


    if(type==="blood"){

      return (
        profile.blood !== "不明" &&
        profile.blood !== ""
      );

    }


    return true;

  });

        createQuestion(list);

        setProfiles(list);

      }

      setLoading(false);

    }

    load();

  },[]);

  function createQuestion(list){

    const map = {};

    list.forEach(profile=>{

      let key="";

      if(type==="age")
        key=String(profile.age);

      if(type==="height")
        key=String(profile.height);

      if(type==="blood")
        key=String(profile.blood);

      if(!map[key])
        map[key]=[];

      map[key].push(profile);

    });

    const keys =
      Object.keys(map);

    const randomKey =

      keys[
        Math.floor(
          Math.random()*keys.length
        )
      ];

    setQuestion({

      value:randomKey,

      answers:map[randomKey],

    });

  }

  const suggestions=
    useMemo(()=>{

      if(!input.trim())
        return [];

      return profiles

        .filter(profile=>

          profile.name.includes(input)

        )

        .slice(0,8);

    },[
      input,
      profiles
    ]);

  if(loading){

    return(

      <main className="min-h-screen flex items-center justify-center">

        読み込み中...

      </main>

    );

  }

  if(!question){

    return(

      <main className="min-h-screen flex items-center justify-center">

        データがありません

      </main>

    );

  }

  const remain =

    question.answers.length-

    answered.length;

  return(

    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-xl mx-auto px-4 py-6">

        <header className="flex justify-between items-center mb-6">

          <h1 className="text-2xl font-extrabold">

            📘 全員回答モード

          </h1>

          <Link
            href="/study/vivrecard"
            className="underline"
          >

            終了

          </Link>

        </header>


        <div className="bg-white rounded-3xl shadow-lg p-6">

          <div className="text-center mb-6">

            <p className="text-sm text-gray-500">

              {type==="age" && "この年齢のキャラを全員答えよう"}

              {type==="height" && "この身長のキャラを全員答えよう"}

              {type==="blood" && "この血液型のキャラを全員答えよう"}

            </p>

            <div className="text-5xl font-extrabold mt-4">

              {question.value}

              {type==="age" && "歳"}

              {type==="height" && "cm"}

              {type==="blood" && "型"}

            </div>

          </div>


          <div className="mb-6">

            <div className="flex justify-between text-sm mb-2">

              <span>

                正解数

              </span>

              <span className="font-bold">

                {answered.length} / {question.answers.length}

              </span>

            </div>


            <div className="w-full bg-gray-200 rounded-full h-3">

              <div

                className="bg-rose-500 h-3 rounded-full transition-all"

                style={{

                  width:

                    `${

                      (answered.length /

                      question.answers.length)

                      *100

                    }%`

                }}

              />

            </div>

          </div>


          <div className="bg-rose-50 rounded-2xl p-4 mb-6">

            <div className="font-bold mb-3">

              回答済み

            </div>


            {answered.length===0 && (

              <p className="text-sm text-gray-500">

                まだ回答なし

              </p>

            )}


            <div className="flex flex-wrap gap-2">

              {answered.map(profile=>(

                <span

                  key={profile.number}

                  className="bg-white rounded-full px-3 py-1 text-sm shadow"

                >

                  ✓ {profile.name}

                </span>

              ))}

            </div>

          </div>


          {remain>0 && !giveUp && (

            <div className="relative">

              <input

                value={input}

                onChange={(e)=>{

                  setInput(e.target.value);

                  setWrongMessage("");

                }}

                placeholder="キャラ名を入力"

                className="w-full border rounded-xl p-3"

              />


              {suggestions.length>0 && (

                <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-20">

                  {suggestions.map(profile=>(

                    <button

                      key={profile.number}

                      type="button"

                      onClick={()=>{

                        setInput(profile.name);

                      }}

                      className="block w-full text-left px-4 py-2 hover:bg-rose-100"

                    >

                      {profile.name}

                    </button>

                  ))}

                </div>

              )}

            </div>

          )}


          {wrongMessage && (

            <div className="mt-4 text-center text-red-500 font-bold">

              {wrongMessage}

            </div>

          )}


          {!giveUp && remain > 0 && (

            <button

              onClick={()=>{

                const answer =

                  question.answers.find(profile =>

                    profile.name === input.trim()

                  );


                if(!answer){

                  setWrongMessage(
                    "❌ 該当するキャラではありません"
                  );

                  return;

                }


                const already =

                  answered.some(profile =>

                    profile.number === answer.number

                  );


                if(already){

                  setWrongMessage(
                    "⚠️ そのキャラは回答済みです"
                  );

                  return;

                }


                setAnswered([

                  ...answered,

                  answer

                ]);

                setInput("");

                setWrongMessage("");

              }}

              className="w-full mt-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-3 font-bold"

            >

              回答

            </button>

          )}


          {remain === 0 && (

            <div className="mt-6 text-center">

              <div className="text-3xl font-extrabold text-green-600">

                🎉 全員正解！

              </div>


              <p className="mt-3">

                {question.value}

                {type==="age" && "歳"}

                {type==="height" && "cm"}

                {type==="blood" && "型"}

                のキャラを全て答えました

              </p>


              <button

                onClick={()=>{

                  setAnswered([]);

                  setInput("");

                  setWrongMessage("");

                  createQuestion(profiles);

                }}

                className="mt-6 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl px-8 py-3 font-bold"

              >

                次の問題

              </button>

            </div>

          )}


          <button

            onClick={()=>setGiveUp(true)}

            className="w-full mt-5 border border-gray-300 rounded-2xl py-3 font-bold"

          >

            ギブアップ

          </button>


          {giveUp && (

            <div className="mt-6 border-t pt-5">

              <h2 className="font-bold text-lg mb-4">

                正解一覧

              </h2>


              <div className="space-y-2">

                {question.answers.map(profile=>(

                  <div

                    key={profile.number}

                    className={`rounded-xl px-4 py-2 ${
                      
                      answered.some(
                        item =>
                        item.number === profile.number
                      )

                      ? "bg-green-100"

                      : "bg-gray-100"

                    }`}

                  >

                    {answered.some(
                      item =>
                      item.number === profile.number
                    )

                    ? "✓ "

                    : "○ "

                    }

                    {profile.name}

                  </div>

                ))}

              </div>


              <button

                onClick={()=>{

                  setAnswered([]);

                  setGiveUp(false);

                  setInput("");

                  setWrongMessage("");

                  createQuestion(profiles);

                }}

                className="mt-6 w-full bg-sky-500 text-white rounded-2xl py-3 font-bold"

              >

                次の問題

              </button>


            </div>

          )}

        </div>

      </div>

    </main>

  );

}