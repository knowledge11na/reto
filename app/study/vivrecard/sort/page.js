// file:  app/study/vivrecard/sort/page.js

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SortMenu() {

  const router = useRouter();

  const [profiles,setProfiles]=useState([]);

  const [loading,setLoading]=useState(true);

  const [type,setType]=useState("height");

  const [start,setStart]=useState(1);

  const [end,setEnd]=useState(999999);

const [minValue,setMinValue]=useState(0);
const [maxValue,setMaxValue]=useState(999999);

  useEffect(()=>{

    async function load(){

      const res=await fetch("/api/profile");

      const data=await res.json();

      if(data.ok){

        setProfiles(data.items);

        setEnd(
          Math.max(
            ...data.items.map(p=>p.number)
          )
        );

      }

      setLoading(false);

    }

    load();

  },[]);

  function startGame(){

    localStorage.setItem(

      "vivreSortSetting",

JSON.stringify({

 start,
 end,
 type,
 minValue,
 maxValue,

})

    );

    router.push("/study/vivrecard/sort/game");

  }

const count = profiles.filter(p=>{

  if(
    p.number < start ||
    p.number > end
  ){
    return false;
  }


  if(type==="height"){

    return (
      Number(p.height)>=minValue &&
      Number(p.height)<=maxValue
    );

  }


  if(type==="age"){

    return (
      Number(p.age)>=minValue &&
      Number(p.age)<=maxValue
    );

  }


  return true;

}).length;

  return(

<main className="min-h-screen bg-rose-50 text-gray-900">

      <div className="max-w-md mx-auto p-6">

        <div className="flex justify-between mb-6">

          <h1 className="text-3xl font-bold">

            仕分けゲーム

          </h1>

          <Link

            href="/study/vivrecard"

            className="underline"

          >

            戻る

          </Link>

        </div>

        {loading?

          <div>読み込み中...</div>

        :

        <>

        <div className="bg-white text-gray-900 rounded-2xl p-5 shadow mb-5">

          <div className="font-bold mb-3">

            項目

          </div>

          <label className="block">

            <input

              type="radio"

              checked={type==="height"}

              onChange={()=>setType("height")}

            />

            <span className="ml-2">

              身長

            </span>

          </label>

          <label className="block mt-2">

            <input

              type="radio"

              checked={type==="age"}

              onChange={()=>setType("age")}

            />

            <span className="ml-2">

              年齢

            </span>

          </label>

          <label className="block mt-2">

            <input

              type="radio"

              checked={type==="blood"}

              onChange={()=>setType("blood")}

            />

            <span className="ml-2">

              血液型

            </span>

          </label>

        </div>

<div className="bg-white text-gray-900 rounded-2xl p-5 shadow mb-5">

  <div className="font-bold mb-3">
    条件範囲
  </div>


  {
    type==="blood" ? (

      <div className="text-gray-500">
        血液型は範囲指定できません
      </div>

    ) : (

      <div className="flex gap-2">

        <input
          type="number"
          value={minValue}
          onChange={
            e=>setMinValue(Number(e.target.value))
          }
          className="border rounded p-2 w-full"
        />

        <span>
          〜
        </span>

        <input
          type="number"
          value={maxValue}
          onChange={
            e=>setMaxValue(Number(e.target.value))
          }
          className="border rounded p-2 w-full"
        />

      </div>

    )
  }


  <div className="text-sm text-gray-500 mt-2">

    {
      type==="height"
      ?
      "身長(cm)"
      :
      "年齢"
    }

  </div>


</div>

       <div className="bg-white text-gray-900 rounded-2xl p-5 shadow mb-5">

          <div className="font-bold mb-3">

            学習範囲

          </div>

          <div className="flex gap-2">

            <input

              type="number"

              value={start}

              onChange={e=>setStart(Number(e.target.value))}

              className="border rounded p-2 w-full"

            />

            <span>～</span>

            <input

              type="number"

              value={end}

              onChange={e=>setEnd(Number(e.target.value))}

              className="border rounded p-2 w-full"

            />

          </div>

          <button

            onClick={()=>{

              setStart(1);

              setEnd(

                Math.max(

                  ...profiles.map(p=>p.number)

                )

              );

            }}

            className="mt-3 bg-purple-200 rounded-lg px-4 py-2"

          >

            全て

          </button>

          <div className="text-sm text-gray-500 mt-2">

            対象 {count}人

          </div>

        </div>

        <button

          onClick={startGame}

          className="w-full bg-emerald-500 text-white py-4 rounded-2xl text-xl font-bold"

        >

          ゲーム開始

        </button>

        </>

        }

      </div>

    </main>

  );

}