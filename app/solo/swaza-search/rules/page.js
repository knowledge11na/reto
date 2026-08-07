// file: app/solo/swaza-search/rules/page.js
'use client';

import Link from 'next/link';

export default function SoloSwazaRulesPage() {
  return (
    <main className="min-h-screen bg-blue-50 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6">

        <header className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-extrabold">
            📖 技サーチ ルール
          </h1>

          <Link
            href="/solo/swaza-search"
            className="text-xs font-bold text-blue-700 underline hover:text-blue-500"
          >
            技サーチに戻る
          </Link>
        </header>


        <section className="
          bg-white
          border
          border-blue-100
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
            <h2 className="font-bold text-blue-800 mb-1">
              基本ルール
            </h2>

            <ul className="list-disc list-inside space-y-1.5 text-slate-800">

              <li>
                ランダムで1つの技が出題されます。
              </li>

              <li>
                回答した技の情報をヒントに、正解の技を推測してください。
              </li>

              <li>
                誰が・誰に・話数・技名・使った場所の情報を比較して判定されます。
              </li>

              <li>
                全ての項目が
                <span className="font-semibold">
                  緑色
                </span>
                になると正解です。
              </li>

            </ul>
          </div>



          <div>
            <h2 className="font-bold text-blue-800 mb-1">
              各項目の判定
            </h2>

            <ul className="list-disc list-inside space-y-1.5 text-slate-800">

              <li>
                誰が・誰には、
                <span className="font-semibold">
                  完全一致は緑色、部分一致は黄色
                </span>
                で表示されます。
              </li>

              <li>
                話数は、
                <span className="font-semibold">
                  完全一致は緑色
                </span>
                になります。
                青色は正解より大きい、赤色は正解より小さいことを表します。
              </li>

              <li>
                技名は、
                <span className="font-semibold">
                  完全一致は緑色
                </span>
                になります。
              </li>

              <li>
                技名に漢字が1文字でも一致している場合は、
                <span className="font-semibold">
                  黄緑色
                </span>
                になります。
              </li>

              <li>
                技名で漢字以外の文字が1文字でも一致している場合は、
                <span className="font-semibold">
                  黄色
                </span>
                になります。
              </li>

              <li>
                使った場所は、
                <span className="font-semibold">
                  3文字以上の連続一致、または数字一致で黄色
                </span>
                になります。
              </li>

              <li>
                条件に一致しない場合はグレーで表示されます。
              </li>

            </ul>
          </div>



          <div>
            <h2 className="font-bold text-blue-800 mb-1">
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
                <span className="font-semibold text-lime-600">
                  🟢 黄緑
                </span>
                ：技名の漢字が一致
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
                ：正解より話数が大きい
              </li>

              <li>
                <span className="font-semibold text-red-600">
                  🔴 赤
                </span>
                ：正解より話数が小さい
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
            href="/solo/swaza-search"
            className="
              px-4
              py-2
              rounded-full
              bg-blue-500
              text-white
              font-bold
              hover:bg-blue-400
            "
          >
            技サーチに戻る
          </Link>


          <Link
            href="/solo"
            className="
              px-4
              py-2
              rounded-full
              border
              border-blue-400
              bg-white
              text-blue-700
              font-bold
              hover:bg-blue-50
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