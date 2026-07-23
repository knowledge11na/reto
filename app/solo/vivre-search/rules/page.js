// file: app/solo/vivre-search/rules/page.js
'use client';

import Link from 'next/link';

export default function SoloVivreRulesPage() {
  return (
    <main className="min-h-screen bg-pink-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6">

        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            📖 ビブルサーチ ルール
          </h1>

          <Link
            href="/solo/vivre-search"
            className="text-xs font-bold text-pink-700 underline hover:text-pink-500"
          >
            ビブルサーチに戻る
          </Link>
        </header>


        <section className="
          bg-white
          border
          border-pink-100
          rounded-3xl
          p-4
          sm:p-5
          shadow-sm
          space-y-4
          text-[13px]
          sm:text-sm
          leading-relaxed
        ">


          <div>
            <h2 className="font-bold text-pink-800 mb-1">
              基本ルール
            </h2>

            <ul className="list-disc list-inside space-y-1.5 text-slate-800">

              <li>
                ランダムで1キャラが出題されます。
              </li>

              <li>
                回答したキャラクターの情報をヒントに、正解キャラクターを推測してください。
              </li>

              <li>
                ビブルカードナンバー・初登場話・年齢・身長は、
                <span className="font-semibold">
                  完全一致の場合は緑色
                </span>
                で表示されます。
              </li>

              <li>
                数値項目で青色の場合は、
                <span className="font-semibold">
                  正解より数字が大きい
                </span>
                ことを表します。
                赤色の場合は、
                <span className="font-semibold">
                  正解より数字が小さい
                </span>
                ことを表します。
              </li>

              <li>
                血液型・出身・性別・家族は、
                <span className="font-semibold">
                  部分一致は黄色、完全一致は緑色
                </span>
                で表示されます。
              </li>

              <li>
                条件に一致しない場合はグレーで表示されます。
              </li>

            </ul>
          </div>



          <div>
            <h2 className="font-bold text-pink-800 mb-1">
              表示について
            </h2>

            <ul className="list-disc list-inside space-y-1.5 text-slate-800">

              <li>
                初登場話は、実際に姿が描かれた場面ではなく、
                <span className="font-semibold">
                  ビブルカードに記載されている初登場情報
                </span>
                を基準にしています。
              </li>

              <li>
                亡くなったキャラクターの年齢は、
                <span className="font-semibold">
                  享年
                </span>
                で表示されます。
              </li>

            </ul>
          </div>



          <div>
            <h2 className="font-bold text-pink-800 mb-1">
              色の見方
            </h2>

            <ul className="list-disc list-inside space-y-1.5 text-slate-800">

              <li>
                <span className="font-semibold text-green-600">
                  🟩 緑
                </span>
                ：完全一致
              </li>

              <li>
                <span className="font-semibold text-yellow-600">
                  🟨 黄
                </span>
                ：部分一致
              </li>

              <li>
                <span className="font-semibold text-blue-600">
                  🔵 青
                </span>
                ：正解より数字が大きい
              </li>

              <li>
                <span className="font-semibold text-red-600">
                  🔴 赤
                </span>
                ：正解より数字が小さい
              </li>

              <li>
                <span className="font-semibold text-gray-500">
                  ⬜ グレー
                </span>
                ：不一致
              </li>

            </ul>
          </div>


        </section>



        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">

          <Link
            href="/solo/vivre-search"
            className="
              px-4
              py-2
              rounded-full
              bg-pink-500
              text-white
              font-bold
              hover:bg-pink-400
            "
          >
            ビブルサーチに戻る
          </Link>


          <Link
            href="/solo"
            className="
              px-4
              py-2
              rounded-full
              border
              border-pink-400
              bg-white
              text-pink-700
              font-bold
              hover:bg-pink-50
            "
          >
            ソロメニューへ
          </Link>


          <Link
            href="/"
            className="
              px-4
              py-2
              rounded-full
              border
              border-slate-400
              bg-white
              text-slate-700
              font-bold
              hover:bg-slate-50
            "
          >
            ホームへ
          </Link>

        </div>


      </div>
    </main>
  );
}