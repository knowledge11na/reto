// file: app/info/posting/page.js
'use client';

import Link from 'next/link';

export default function PostingInfoPage() {
  return (
    <div className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      {/* ヘッダー */}
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">問題投稿について</h1>
        <Link
          href="/"
          className="px-3 py-1 rounded-full text-sm font-bold border border-sky-500 bg-white text-sky-700 shadow-sm"
        >
          ホームへ戻る
        </Link>
      </header>

      {/* 本文 */}
      <main className="w-full max-w-md px-4 pb-10 mt-4 space-y-6">
        {/* 問題形式 */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">問題形式</h2>
          <div className="text-sm leading-relaxed space-y-2">
            <p>単一選択：複数の選択肢から答えを1つ選ぶ形式</p>
            <p>複数選択：複数の選択肢から答えを複数選ぶ形式（答えが全てであったり、答えが1つのものも作成可能）</p>
            <p>並び替え：複数の選択肢を正しい順に並び替える形式</p>
            <p>記述：空欄に文字を入力して答える形式</p>
          </div>
        </section>

        {/* 類似問題について */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">類似問題の投稿について</h2>
          <div className="text-sm leading-relaxed space-y-2">
            <p>
              問題を投稿する際には、承認待ち または 承認済みの中に類似した問題があった場合、
              <span className="font-semibold">AI による類似問題判別</span>を使い、
              類似問題の一覧を投稿者へ提示します。
            </p>
            <p>
              そのうえで「本当に投稿するか？」を確認するため、
              <span className="font-semibold">被りなどは意識せずどんどん投稿してください！</span>
            </p>
            <p>
              ただし、<span className="font-semibold">全く同じ問題がすでにある場合</span>は管理が大変なので、
              <span className="font-bold">投稿を取り下げてください。</span>
            </p>
          </div>
        </section>

        {/* 記述問題について */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">記述問題について</h2>

          <div className="text-sm leading-relaxed space-y-3">
            <p className="font-semibold">● 別解（複数正解）の設定を忘れずに！</p>
            <div className="bg-sky-50 border border-sky-100 p-2 rounded text-sm">
              <p>例. イゾウの弟の名前は？　解：菊之丞　別解：菊、お菊</p>
              <p>例. ルフィの祖父の名前は？　解：モンキー・D・ガープ　別解：ガープ</p>
            </div>

            <p className="font-semibold">● セリフ問題の注意</p>
            <ul className="list-disc list-inside space-y-1">
              <li>「！！！」などの記号は、問題文に明記しない限り問わないこと</li>
              <li>記号も答えさせたい場合は、問題文に必ず書く</li>
            </ul>

            <div className="bg-sky-50 border border-sky-100 p-2 rounded text-sm">
              <p>
                例. ココヤシ村でナミに麦わら帽子を被せた後にルフィが言ったセリフは？
                （!などの記号も答える）
              </p>
              <p>解：当たり前だ！！！！！　別解：当たり前だ!!!!!</p>
            </div>

            <p className="font-semibold">● 数字が関わる問題の処理</p>
            <p>次のいずれかを必ず行ってください。</p>

            <ul className="list-decimal list-inside space-y-1">
              <li>
                問題文に「（数字のみで回答）」「（単位をつけて回答）」など明記する
                <div className="bg-sky-50 border border-sky-100 p-2 rounded text-xs mt-1">
                  例. ルフィは現在何歳？（数字のみで回答）
                </div>
              </li>
              <li>
                別解を用意して、数字・単位の両方を許容する
                <div className="bg-sky-50 border border-sky-100 p-2 rounded text-xs mt-1">
                  例. ルフィは現在何歳？　解：19歳　別解：19
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* その他注意 */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">その他</h2>
          <div className="text-sm leading-relaxed space-y-2">
            <p>
              投稿する範囲は公式の
              <span className="font-semibold">単行本・ビブルカードのみ</span>です。
              <span className="font-bold">本誌の内容は投稿不可</span>です。
            </p>
            <p>
              問題には、<span className="font-bold">可能な限り詳細なタグ</span>を付けてください。
            </p>
          </div>
        </section>

        {/* 問題読み込みについて */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">問題読み込みについて</h2>
          <div className="text-sm leading-relaxed space-y-2">
            <p className="font-semibold">● 暗記メーカーから読み込む場合</p>
            <p>
              暗記メーカー内の問題集の
              <span className="font-semibold">「エクスポート」ボタンからコピー</span>
              を押します。
            </p>
            <p>
              その後、このサイトの
              <span className="font-semibold">問題投稿ページの「問題読み込み」ボタン</span>
              を押し、コピーしたデータをそのまま貼り付けてください。
            </p>
            <p>
              「ストックに追加」を押し、そのあと
              <span className="font-semibold">「次の問題をフォームにセット」</span>
              を押すと、1問ずつ編集して投稿できます。
            </p>
            <p>
              なお、<span className="font-semibold">画像は無視して読み込みます。</span>
              画像問題が含まれている場合は、その問題の投稿を飛ばして
              <span className="font-semibold">「次の問題をセット」</span>
              を押すことで、その問題は投稿せずに次の問題の編集に進めます。
            </p>
          </div>
        </section>

        {/* 前の条件を引き継ぐについて */}
        <section className="bg-white border border-sky-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-2">前の条件を引き継ぐについて</h2>
          <div className="text-sm leading-relaxed space-y-2">
            <p>
              問題投稿をする時に、画面上部の
              <span className="font-semibold">「前の条件を引き継ぐ」ボタン</span>
              を押すと、
            </p>
            <p>
              その問題を投稿したあと、
              <span className="font-semibold">
                次の問題を作成する際にも前の問題の条件（解答欄の数・タグ・問題文など）
              </span>
              をそのまま引き継いで作成できます。
            </p>
            <p>
              同じシリーズや同じ範囲の問題を連続して作りたいときに、とても便利な機能です。
            </p>
          </div>
        </section>

        {/* ショートカット */}
        <section className="bg-sky-100 border border-sky-300 rounded-2xl p-4 shadow-sm text-center">
          <p className="text-sm mb-3">問題を投稿してみたい方はこちら。</p>
          <Link
            href="/submit"
            className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-sky-500 text-white active:bg-sky-600 shadow"
          >
            問題投稿ページへ
          </Link>
        </section>
      </main>
    </div>
  );
}
