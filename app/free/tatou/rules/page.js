
'use client';

import { useRouter } from 'next/navigation';

const sections = [
  {
    title: '1. ゲームの目的',
    content: [
      'お題に対して、条件に合う答えをできるだけ多く出し、得点を獲得するゲームです。',
      'ゲーム開始時に設定する目標得点への到達を目指しましょう。',
    ],
  },
  {
    title: '2. ゲーム開始時の設定',
    content: [
      'ゲーム開始時に、目標得点と制限時間を設定します。',
      '出題されるお題やハンディキャップカードに注目し、どのように答えるかを考えましょう。',
      '実際の設定値はゲーム画面に表示される内容を確認してください。',
    ],
  },
  {
    title: '3. お題に回答する',
    content: [
      '出題されたお題に対し、条件に合うONE PIECEのキャラクター・技・用語などを答えます。',
      'お題によって回答できる内容や条件が異なります。お題の文章をよく確認しましょう。',
      '回答数を宣言する場面では、実際に答えられる数を考えて宣言することが重要です。',
    ],
  },
  {
    title: '4. 宣言数と得点',
    content: [
      '宣言した数と実際に認められた回答数によって、得点が決まります。',
      '宣言した数より回答が少なかった場合：得点は0点です。',,
      '宣言した数と同じ数の回答ができた場合：宣言した数が得点になります。',
      'たくさん宣言するだけでは得点になりません。確実に答えられる数を見極めましょう。',
    ],
  },
  {
    title: '5. 回答の判定・投票',
    content: [
      '回答者以外のプレイヤーが、回答内容を判定するために投票します。',
      '投票者の過半数がOKと判定した回答は、認められます。',
      '回答者本人は、自分の回答についての投票には参加しません。',
      '回答が条件に合っているかどうかを、お題のルールに照らして判断しましょう。',
    ],
  },
  {
    title: '6. 宣言数が同じ場合',
    content: [
      '同じ宣言数になったプレイヤー同士の勝敗を決める場合は、手番プレイヤーから時計回りの順番で判定します。',
      '順番が重要になる場面では、現在の手番と各プレイヤーの位置を確認しましょう。',
    ],
  },
  {
    title: '7. ハンディキャップカード',
    content: [
      'ゲームではハンディキャップカードが使用される場合があります。',
      'カードによって回答条件やプレイへの制約などが変化します。',
      'カードを受け取ったら、その効果と適用されるタイミングを確認してください。',
      'カードごとの具体的な効果は、ゲーム内に表示される説明を優先します。',
    ],
  },
  {
    title: '8. 回答が被った場合',
    content: [
      '先に回答されたものが自分の回答の中にあった場合、その回答は削除します。',
      '回答数が足りなければ0点になるため、無理な宣言には注意が必要です。',
      '他のプレイヤーが答えた内容も、お題の条件に合っているか確認しましょう。',
      '制限時間がある場合は、正確さと回答速度のバランスも大切です。',
    ],
  },
];

export default function HasteVouteRulesPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-indigo-50 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-3xl bg-indigo-600 p-6 text-center text-white shadow">
          <p className="text-sm font-bold tracking-widest text-indigo-200">
            ONE PIECE KNOWLEDGE BATTLE
          </p>
          <h1 className="mt-2 text-3xl font-black">
            ハステ・ヴォルテ
          </h1>
          <p className="mt-3 text-sm font-bold">
            知識を絞り出せ！ 宣言数と回答力で勝負！
          </p>
        </header>

        <section className="rounded-2xl border-2 border-indigo-200 bg-white p-4">
          <h2 className="text-lg font-black text-indigo-800">
            基本ルール
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-7">
            <li>・お題に合う答えを考える</li>
            <li>・答えられる数を宣言する</li>
            <li>・宣言数を達成できなければ0点</li>
            <li>・回答者以外の投票で回答を判定する</li>
            <li>・目標得点への到達を目指す</li>
          </ul>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-black text-indigo-800">
              {section.title}
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-7">
              {section.content.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </section>
        ))}


        <button
          type="button"
          onClick={() => router.back()}
          className="w-full rounded-full bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700"
        >
          前の画面に戻る
        </button>
      </div>
    </main>
  );
}
