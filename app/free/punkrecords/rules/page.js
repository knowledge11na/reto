import Link from 'next/link';

export default function Rules() {
  return <main className="mx-auto max-w-3xl space-y-4 p-6 text-slate-900">
    <h1 className="text-2xl font-bold">パンクレコーズ：フリーマッチのルール</h1>
    <ul className="list-inside list-disc space-y-2">
      <li>4人で遊びます。部屋主が回答者、入力時間、ヨークの特殊入力回数、議論時間、記号の表示を設定します。</li>
      <li>回答者以外の3人は同時に説明文を入力します。全文を書けますが、完成文に採用されるのは黄色の担当マスだけです。</li>
      <li>ヨークは1人です。担当外の文字を変えるか、公開された記号を1回につき3個まで隠せます。</li>
      <li>入力時間が終了すると完成文が回答者に送られます。入力されなかった担当マスは「？」になります。</li>
      <li>キャラクターを当てればベガパンク側の勝ち。不正解の場合は議論の後に回答者がヨークを選び、見抜けばベガパンク側、外せばヨーク側の勝ちです。</li>
    </ul>
    <Link href="/rate-match" className="text-blue-700 underline">フリーマッチに戻る</Link>
  </main>;
}
