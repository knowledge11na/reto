// file: app/study/vivrecard/play/page.js

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  saveAnswer,
} from "@/lib/vivreStudy";

export default function VivreCardPlayPage() {

  const router = useRouter();
  
const [start, setStart] = useState(1);
const [end, setEnd] = useState(100);
const [mode, setMode] = useState("character");
const [useAge, setUseAge] = useState(true);
const [useHeight, setUseHeight] = useState(true);
const [useBlood, setUseBlood] = useState(true);
const [settingLoaded, setSettingLoaded] = useState(false);

  const [profiles, setProfiles] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [answered, setAnswered] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const [ageInput, setAgeInput] =
    useState("");

  const [heightInput, setHeightInput] =
    useState("");

  const [bloodInput, setBloodInput] =
    useState("");

  const [nameInput, setNameInput] =
    useState("");

const [nameSelected, setNameSelected] = useState(false);

  useEffect(() => {

const setting = JSON.parse(
  localStorage.getItem("vivreStudySetting")
);

if (!setting) {
  setLoading(false);
  return;
}

setStart(setting.start);
setEnd(setting.end);
setMode(setting.mode);
setUseAge(setting.age);
setUseHeight(setting.height);
setUseBlood(setting.blood);
setSettingLoaded(true);

    async function load() {

      const res =
        await fetch("/api/profile");

      const data =
        await res.json();

      if (data.ok) {

        const list =
  data.items.filter(profile => {

if (
  profile.number < setting.start ||
  profile.number > setting.end
) {
  return false;
}


    // プロフィール→キャラの場合
    // 選択した項目に不明があるキャラは除外
if (setting.mode === "profile") {

  if (setting.age && profile.age === "不明") {
    return false;
  }

  if (setting.height && profile.height === "不明") {
    return false;
  }

  if (setting.blood && profile.blood === "不明") {
    return false;
  }

}


// キャラ→プロフィールの場合も
// 答えられない項目は出さない
if (setting.mode === "character") {

  if (setting.age && profile.age === "不明") {
    return false;
  }

  if (setting.height && profile.height === "不明") {
    return false;
  }

  if (setting.blood && profile.blood === "不明") {
    return false;
  }

}


    return true;

  });

        if (setting.random) {
  list.sort(() => Math.random() - 0.5);
} else {
  list.sort((a, b) => a.number - b.number);
}

        setProfiles(list);

      }

      setLoading(false);

    }

    load();

  }, []);

  const current =
    profiles[currentIndex];

  const suggestions =
    useMemo(() => {

      if (
        !nameInput.trim()
      ) return [];

      return profiles

        .filter(profile =>

          profile.name.includes(
            nameInput
          )

        )

        .slice(0, 8);

    }, [
      nameInput,
      profiles,
    ]);

function checkAnswer() {

    if (mode === "character") {

      const ageCorrect =
        !useAge ||
        ageInput.trim() ===
          String(current.age);

      const heightCorrect =
        !useHeight ||
        heightInput.trim() ===
          String(current.height);

      const bloodCorrect =
        !useBlood ||
        bloodInput
          .trim()
          .toUpperCase() ===
        String(current.blood)
          .toUpperCase();

      if (useAge)
        saveAnswer(
          current.number,
          "age",
          ageCorrect
        );

      if (useHeight)
        saveAnswer(
          current.number,
          "height",
          heightCorrect
        );

      if (useBlood)
        saveAnswer(
          current.number,
          "blood",
          bloodCorrect
        );

      setResult({

        age: ageCorrect,

        height:
          heightCorrect,

        blood:
          bloodCorrect,

      });

    } else {

      const correct =
        nameInput.trim() ===
        current.name;

      saveAnswer(
        current.number,
        "age",
        correct
      );

      setResult({

        name: correct,

      });

    }

    setAnswered(true);

  }

  function nextQuestion() {

    setAnswered(false);

    setResult(null);

    setAgeInput("");
    setHeightInput("");
    setBloodInput("");
    setNameInput("");
setNameSelected(false);

    if (currentIndex >= profiles.length - 1) {

      router.push("/study/vivrecard/result");

      return;

    }

    setCurrentIndex(i => i + 1);

  }
if (!settingLoaded) {
  return null;
}

  if (loading) {

    return (

      <main className="min-h-screen flex items-center justify-center">

        読み込み中...

      </main>

    );

  }

  if (!current) {

    return (

      <main className="min-h-screen flex items-center justify-center">

        データがありません

      </main>

    );

  }

  return (

    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-xl mx-auto px-4 py-6">

        <header className="flex justify-between items-center mb-6">

          <h1 className="text-2xl font-extrabold">

            📘 ビブルカード学習

          </h1>

          <Link
            href="/study/vivrecard"
            className="underline text-sm"
          >

            終了

          </Link>

        </header>

        <div className="mb-6">

          <div className="flex justify-between text-sm">

            <span>

              {currentIndex + 1} / {profiles.length}

            </span>

            <span>

              No.{current.number}

            </span>

          </div>

          <div className="w-full bg-gray-200 rounded-full h-3 mt-2">

            <div
              className="bg-rose-500 h-3 rounded-full transition-all"
              style={{
                width: `${((currentIndex + 1) / profiles.length) * 100}%`,
              }}
            />

          </div>

        </div>

        <div className="bg-white rounded-3xl shadow-lg p-8">

          {mode === "character" ? (

            <>

              <h2 className="text-3xl font-extrabold text-center mb-8">

                {current.name}

              </h2>

              <div className="space-y-5">

                {useAge && (

                  <div>

                    <p className="font-bold mb-1">

                      年齢

                    </p>

                    <input
                      value={ageInput}
                      disabled={answered}
                      onChange={(e)=>setAgeInput(e.target.value)}
                      className="w-full border rounded-xl p-3"
                    />

                  </div>

                )}

                {useHeight && (

                  <div>

                    <p className="font-bold mb-1">

                      身長

                    </p>

                    <input
                      value={heightInput}
                      disabled={answered}
                      onChange={(e)=>setHeightInput(e.target.value)}
                      className="w-full border rounded-xl p-3"
                    />

                  </div>

                )}

                {useBlood && (

                  <div>

                    <p className="font-bold mb-1">

                      血液型

                    </p>

                    <input
                      value={bloodInput}
                      disabled={answered}
                      onChange={(e)=>setBloodInput(e.target.value)}
                      className="w-full border rounded-xl p-3"
                    />

                  </div>

                )}

              </div>

            </>

          ) : (

            <>

              <div className="text-center mb-8">

                <p className="text-sm text-gray-500 mb-4">
                  このプロフィールのキャラ名は？
                </p>

                <div className="space-y-2 text-lg">

                  {useAge && (
                    <div>
                      年齢：
                      <span className="font-bold ml-2">
                        {current.age}
                      </span>
                    </div>
                  )}

                  {useHeight && (
                    <div>
                      身長：
                      <span className="font-bold ml-2">
                        {current.height}
                      </span>
                    </div>
                  )}

                  {useBlood && (
                    <div>
                      血液型：
                      <span className="font-bold ml-2">
                        {current.blood}
                      </span>
                    </div>
                  )}

                </div>

              </div>

              <div className="relative">

                <input
                  value={nameInput}
                  disabled={answered}
                  onChange={(e)=>{
  setNameInput(e.target.value);
  setNameSelected(false);
}}
                  placeholder="キャラ名"
                  className="w-full border rounded-xl p-3"
                />

                {!answered && !nameSelected && suggestions.length > 0 && (

                  <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto z-20">

                   {suggestions.map((profile, index) => (
  <button
    key={`${profile.number}-${index}`}
                        type="button"
                        onClick={()=>{
  setNameInput(profile.name);
  setNameSelected(true);
}}
                        className="block w-full text-left px-4 py-2 hover:bg-rose-100"
                      >
                        {profile.name}
                      </button>

                    ))}

                  </div>

                )}

              </div>

            </>

          )}

          {!answered ? (

            <div className="mt-8 text-center">

              <button
                onClick={checkAnswer}
                className="bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl px-10 py-3"
              >
                回答
              </button>

            </div>

          ) : (

            <>

              <div className="mt-8 border-t pt-6 space-y-4">

                {mode === "character" ? (

                  <>

                    {useAge && (

                      <div className="flex justify-between items-center">

                        <span>

                          {result.age ? "🟢" : "🔴"} 年齢

                        </span>

                        <span className="font-bold">

                          {current.age}

                        </span>

                      </div>

                    )}

                    {useHeight && (

                      <div className="flex justify-between items-center">

                        <span>

                          {result.height ? "🟢" : "🔴"} 身長

                        </span>

                        <span className="font-bold">

                          {current.height}

                        </span>

                      </div>

                    )}

                    {useBlood && (

                      <div className="flex justify-between items-center">

                        <span>

                          {result.blood ? "🟢" : "🔴"} 血液型

                        </span>

                        <span className="font-bold">

                          {current.blood}

                        </span>

                      </div>

                    )}

                  </>

                ) : (

                  <div className="text-center">

                    <div className="text-2xl font-bold mb-3">

                      {result.name ? "🟢 正解！" : "🔴 不正解"}

                    </div>

                    <div className="text-3xl font-extrabold">

                      {current.name}

                    </div>

                  </div>

                )}

              </div>

              <div className="mt-8 text-center">

                <button
                  onClick={nextQuestion}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-2xl px-10 py-3"
                >
                  次へ →
                </button>

              </div>

            </>

          )}

        </div>

      </div>

    </main>

  );

}