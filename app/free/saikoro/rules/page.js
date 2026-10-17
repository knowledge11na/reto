
'use client';

import { useRouter } from 'next/navigation';

const sections = [
  {
    title: '1. ゲームの目的',
    content: [
      'エクストラキャラクターと1枚ビブカの2つのカテゴリで、それぞれ獲得することを目指します。',
      '必要な情報を集め、ダイスやカードを強化しながら、ONE PIECEの知識で勝利を目指しましょう。',
    ],
  },
  {
    title: '2. ゲーム開始',
    content: [
      '4人専用のゲームです。',
      'ゲーム開始時のベリーは、プレイヤー1が3、プレイヤー2が2、プレイヤー3が1、プレイヤー4が0です。',
      '各プレイヤーはダイスAとダイスBを持ってスタートします。',
    ],
  },
  {
    title: '3. ターンの流れ',
    content: [
      '① ダイスA・Bを振る',
      '② 2つの出目の効果を処理する',
      '③ ダイス面強化やカード購入を行う',
      '④ カードの効果を使用する',
      '⑤ キャラクターの情報を購入する',
      '⑥ エクストラキャラクターまたは1枚ビブカに回答する',
      '各フェーズで表示される案内に従って進めます。',
    ],
  },
  {
    title: '4. 資源について',
    content: [
      'ベリー：ダイスの強化や情報購入などに使います。所持上限は12です。',
      'ヴァース：カードや情報購入などに使います。所持上限は6です。',
      '永久指針：カードや情報購入などに使います。所持上限は6です。',
      '資源が上限に達している場合、上限を超えて所持することはできません。',
    ],
  },
  {
    title: '5. ダイスと強化',
    content: [
      'ダイスAはベリーの面が5面、ヴァースの面が1面です。',
      'ダイスBはベリーの面が5面、永久指針の面が1面です。',
      '出目に応じて資源を獲得します。',
      'アクションでは、資源を使ってダイスの面を購入・強化できます。強化後の出目は、今後の資源獲得や戦略に影響します。',
    ],
  },
  {
    title: '6. アクションとカード',
    content: [
      '通常のアクションでは、ダイスの面の購入やカードの購入を行います。',
      'ダイスの鍛造、カードの購入は1ターンに1回です。',
      'カードにはそれぞれ固有の効果があります。購入前にゲーム内のカード説明を確認してください。',
      'カードの選択や位置指定などが表示された場合は、画面の指示に従って選択します。',
    ],
  },
  {
    title: '7. キャラクター情報の購入',
    content: [
      '情報を購入すると、キャラクターを特定するための手掛かりを得られます。',
      '名前：ベリー6',
      '好物：ヴァース2',
      '身長：永久指針2',
      '年齢：永久指針2',
      '血液型：永久指針1',
      '出身：ヴァース1＋永久指針1',
      '性別：ヴァース1',
      '家族：記録指針1',
      '購入した情報を手掛かりに、対象キャラクターを推理しましょう。',
    ],
  },
  {
    title: '8. 回答と勝利',
    content: [
      '自分のターンに、エクストラキャラクターまたは1枚ビブカへの回答に挑戦します。',
      '回答できるのは、各ターンにつきどちらか1回です。',
      '正解を重ね、両方のカテゴリで目標数達成する事を目指します。',
      'それぞれ最低1枚獲得する必要があります。',
    ],
  },
];

export default function SaikoroRulesPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-amber-50 px-4 py-6 text-slate-800">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-3xl bg-amber-400 p-6 text-center shadow">
          <p className="text-sm font-bold tracking-widest text-amber-950">
            ONE PIECE KNOWLEDGE GAME
          </p>
          <h1 className="mt-2 text-3xl font-black text-amber-950">
            看板たぬき
          </h1>
          <p className="mt-3 text-sm font-bold text-amber-950">
            ダイスを強化し、情報を集め、知識で勝利をつかめ！
          </p>
        </header>

        <section className="rounded-2xl border-2 border-amber-200 bg-white p-4">
          <h2 className="text-lg font-black text-amber-800">
            基本ルール
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-7">
            <li>・ダイスを振って資源を集める</li>
            <li>・ダイスやカードを強化する</li>
            <li>・資源を使ってキャラクター情報を買う</li>
            <li>・情報をもとに正解を重ねる</li>
            <li>・勝利数分カードを集める</li>
          </ul>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-black text-amber-800">
              {section.title}
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-7">
              {section.content.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black">プレイ中の注意</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            資源の消費量、カードの効果、選択できるアクションは、ゲーム画面に表示される内容を優先してください。
            このページは基本ルールの案内です。
          </p>
        </section>

        <button
          type="button"
          onClick={() => router.back()}
          className="w-full rounded-full bg-amber-500 px-5 py-3 font-bold text-white hover:bg-amber-600"
        >
          前の画面に戻る
        </button>
      </div>
    </main>
  );
}
