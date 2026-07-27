// file: app/study/vivrecard/result/page.js

"use client";

import Link from "next/link";
import { loadStudy } from "@/lib/vivreStudy";

export default function VivreCardResultPage() {

  const study = loadStudy();

  const profiles = Object.values(study.profiles);

  let ageCorrect = 0;
  let ageTotal = 0;

  let heightCorrect = 0;
  let heightTotal = 0;

  let bloodCorrect = 0;
  let bloodTotal = 0;

  profiles.forEach(profile => {

    ageCorrect += profile.age.correct;
    ageTotal += profile.age.correct + profile.age.wrong;

    heightCorrect += profile.height.correct;
    heightTotal += profile.height.correct + profile.height.wrong;

    bloodCorrect += profile.blood.correct;
    bloodTotal += profile.blood.correct + profile.blood.wrong;

  });

  const ageRate =
    ageTotal === 0
      ? 0
      : Math.round(ageCorrect / ageTotal * 100);

  const heightRate =
    heightTotal === 0
      ? 0
      : Math.round(heightCorrect / heightTotal * 100);

  const bloodRate =
    bloodTotal === 0
      ? 0
      : Math.round(bloodCorrect / bloodTotal * 100);

  const totalCorrect =
    study.total.correct;

  const totalWrong =
    study.total.wrong;

  const total =
    totalCorrect + totalWrong;

  const totalRate =
    total === 0
      ? 0
      : Math.round(totalCorrect / total * 100);

  return (

    <main className="min-h-screen bg-rose-50 text-rose-900">

      <div className="max-w-xl mx-auto px-4 py-8">

        <h1 className="text-3xl font-extrabold text-center mb-8">

          🎉 学習結果

        </h1>

        <div className="bg-white rounded-3xl shadow-lg p-8 space-y-6">

          <div className="text-center">

            <p className="text-gray-500">

              総合正答率

            </p>

            <div className="text-5xl font-extrabold mt-2">

              {totalRate}%

            </div>

            <div className="mt-3 text-lg">

              {totalCorrect} / {total}

            </div>

          </div>

          <hr />

          <div className="space-y-4">

            <div className="flex justify-between">

              <span>

                年齢

              </span>

              <span className="font-bold">

                {ageRate}%

              </span>

            </div>

            <div className="flex justify-between">

              <span>

                身長

              </span>

              <span className="font-bold">

                {heightRate}%

              </span>

            </div>

            <div className="flex justify-between">

              <span>

                血液型

              </span>

              <span className="font-bold">

                {bloodRate}%

              </span>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-4 mt-8">

          <Link
            href="/study/vivrecard"
            className="bg-sky-500 text-white rounded-2xl py-3 text-center font-bold hover:bg-sky-600"
          >

            もう一度

          </Link>

          <Link
            href="/study"
            className="bg-gray-500 text-white rounded-2xl py-3 text-center font-bold hover:bg-gray-600"
          >

            学習メニュー

          </Link>

        </div>

      </div>

    </main>

  );

}