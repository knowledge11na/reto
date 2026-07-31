// file: app/study/vivrecard/all/Allpage.js


"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

export default function VivreCardAllPage() {

const [start, setStart] = useState(1);

const [end, setEnd] = useState(100);

const [type, setType] = useState("age");

const inputRef = useRef(null);


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

const [questionList,setQuestionList] =
  useState([]);

const [questionIndex,setQuestionIndex] =
  useState(0);

  const [wrongMessage,setWrongMessage] =
    useState("");

const [showSuggestions, setShowSuggestions] = useState(false);

  const [giveUp,setGiveUp] =
    useState(false);

useEffect(() => {

  const setting = JSON.parse(
    localStorage.getItem("vivreAllSetting")
  );

  if (!setting) {
    setLoading(false);
    return;
  }

  setStart(setting.start);
  setEnd(setting.end);
  setType(setting.type);

const selectedType = setting.type;

  async function load() {

    const res = await fetch("/api/profile");


      const data =
        await res.json();

      if(data.ok){

const save = JSON.parse(
  localStorage.getItem("vivreAllProgress")
);

const list =

  data.items.filter(profile=>{

    if(
profile.number < setting.start ||
profile.number > setting.end
    ){
      return false;
    }


    if(selectedType==="age"){

      return (
        profile.age !== "不明" &&
        profile.age !== ""
      );

    }


    if(selectedType==="height"){

      return (
        profile.height !== "不明" &&
        profile.height !== ""
      );

    }


    if(selectedType==="blood"){

      return (
        profile.blood !== "不明" &&
        profile.blood !== ""
      );

    }


    return true;

  });

setProfiles(list);

if(
  save &&
  save.type === setting.type &&
  save.questionList &&
  save.questionList.length>0
){

  setQuestionList(save.questionList);

  setQuestionIndex(save.questionIndex);

  setAnswered(save.answered);

  setGiveUp(save.giveUp);

  setQuestion(
    save.questionList[
      save.questionIndex
    ]
  );

}else{

createQuestion(list, setting.type);

}

      setLoading(false);

    }

}

    load();

  },[]);


function createQuestion(list, selectedType){

  const map={};

  list.forEach(profile=>{

    let key="";

    if(selectedType==="age")
      key=String(profile.age);

if(selectedType==="height")
  key=String(profile.height);

if(selectedType==="blood")
  key=String(profile.blood);
    if(!map[key]){
      map[key]=[];
    }

    map[key].push(profile);

  });


  const questions=Object.keys(map).map(key=>({

    value:key,

    answers:map[key]

  }));


  // シャッフル
  questions.sort(()=>Math.random()-0.5);

  setQuestionList(questions);

  setQuestionIndex(0);

  setQuestion(questions[0]);

saveProgress(

  questions,

  0,

  [],

  false

);

}

function saveProgress(
  questions,
  index,
  answeredList,
  giveUpState
){

  localStorage.setItem(
    "vivreAllProgress",
    JSON.stringify({

      questionList:questions,

      questionIndex:index,

      answered:answeredList,

      giveUp:giveUpState

    })
  );

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

const remain = question
  ? question.answers.length - answered.length
  : 0;


useEffect(()=>{

  if(
    remain===0 &&
    questionIndex===questionList.length-1 &&
    questionList.length>0
  ){

    localStorage.removeItem(
      "vivreAllProgress"
    );

  }

},[
  remain,
  questionIndex,
  questionList
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

<button
  onClick={()=>{

    saveProgress(
      questionList,
      questionIndex,
      answered,
      giveUp
    );

    window.location.href="/study/vivrecard";

  }}
  className="underline"
>
  中断する
</button>

        </header>


        <div className="bg-white rounded-3xl shadow-lg p-6">

<div className="mb-6">

<div className="flex justify-between text-sm">

<span>進捗</span>

<span>

{questionIndex+1} / {questionList.length}問

</span>

</div>

<div className="w-full h-3 bg-gray-200 rounded-full mt-2">

<div

className="bg-sky-500 h-3 rounded-full"

style={{

width:`${((questionIndex+1)/questionList.length)*100}%`

}}

></div>

</div>

</div>

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

{answered.map((profile,index)=>(

<span
  key={`${profile.number}-${profile.name}-${index}`}

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
  ref={inputRef}
  autoComplete="new-password"
  spellCheck={false}
  value={input}

                onChange={(e)=>{

  setInput(e.target.value);

  setWrongMessage("");

  setShowSuggestions(true);

}}

                placeholder="キャラ名を入力"

                className="w-full border rounded-xl p-3"

              />


              {showSuggestions && suggestions.length>0 && (

                <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-lg z-20">

 {suggestions.map((profile,index)=>(

<button
  key={`${profile.number}-${profile.name}-${index}`}

                      type="button"

onClick={()=>{
  setInput(profile.name);
  setShowSuggestions(false);
  inputRef.current?.blur();
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

                const target = profiles.find(
  profile => profile.name === input.trim()
);

const answer = question.answers.find(
  profile => profile.name === input.trim()
);

if(!answer){

  if(target){

    let value = "";

    if(selectedType==="age"){
      value = `${target.age}歳`;
    }

    if(selectedType==="height"){
      value = `${target.height}cm`;
    }

    if(selectedType==="blood"){
      value = `${target.blood}型`;
    }

    setWrongMessage(
      `❌ ${target.name}は${value}です`
    );

  }else{

    setWrongMessage(
      "❌ そのキャラは存在しません"
    );

  }

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


const newAnswered = [

  ...answered,

  answer

];

setAnswered(newAnswered);

saveProgress(

  questionList,

  questionIndex,

  newAnswered,

  giveUp

);

                setInput("");
setShowSuggestions(false);

                setWrongMessage("");

              }}

              className="w-full mt-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl py-3 font-bold"

            >

              回答

            </button>

          )}


          {remain===0 && questionIndex<questionList.length-1 && (

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

setGiveUp(false);

const next = questionIndex + 1;

setQuestionIndex(next);

setQuestion(questionList[next]);

saveProgress(

  questionList,

  next,

  [],

  false

);

                }}

                className="mt-6 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl px-8 py-3 font-bold"

              >

                次の問題

              </button>

            </div>

          )}

{remain===0 && questionIndex===questionList.length-1 && (

<div className="mt-6 text-center">

<div className="text-3xl font-extrabold text-green-600">

🎉 全問題クリア！

</div>

<p className="mt-4">

全{questionList.length}問クリアしました！

</p>

</div>

)}


          <button

            onClick={()=>{

  setGiveUp(true);

  saveProgress(

    questionList,

    questionIndex,

    answered,

    true

  );

}}

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

{question.answers.map((profile,index)=>(

<div
  key={`${profile.number}-${profile.name}-${index}`}

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

const next = questionIndex + 1;

setQuestionIndex(next);

setQuestion(questionList[next]);

saveProgress(

  questionList,

  next,

  [],

  false

);

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