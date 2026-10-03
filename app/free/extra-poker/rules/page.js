// file: app/rules/extra-poker/rule/page.js

'use client';

import Link from 'next/link';

export default function ExtraPokerRulePage() {
  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <Link href="/rate-match" style={styles.backLink}>
          ← レートマッチへ戻る
        </Link>

        <section style={styles.hero}>
          <div style={styles.badge}>FREE MATCH GAME</div>
          <h1 style={styles.title}>エクストラポーカー</h1>
          <p style={styles.subtitle}>
            ONE PIECEキャラクターの説明文を使って、
            ベットと回答を組み合わせて戦う知識×ポーカーゲーム。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲーム概要</h2>

          <p style={styles.text}>
            「エクストラポーカー」は、
            ONE PIECEキャラクターの説明文から作られたカードを使い、
            チップを賭けながらキャラクター名を当てるゲームです。
          </p>

          <p style={styles.text}>
            単純なポーカーではありません。
            「この情報なら答えられる」と判断したタイミングで回答を狙う一方、
            他のプレイヤーが正解する前にどこまでベットを上げるか、
            そして答えられないと判断したときにフォールドするかを考えます。
          </p>

          <div style={styles.infoGrid}>
            <Info title="プレイ人数" value="2～4人" />
            <Info title="初期チップ" value="10,000チップ" />
            <Info title="ラウンド数" value="3ラウンド" />
            <Info title="最低ベット" value="100チップ" />
            <Info title="ベット単位" value="100チップ刻み" />
            <Info title="ベット上限" value="2,000チップ" />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲームの目的</h2>

          <p style={styles.text}>
            ゲーム開始時、全員が10,000チップを持ってスタートします。
          </p>

          <p style={styles.text}>
            ゲーム中に正解してポットを獲得し、
            最終的に最も多くのチップを持っているプレイヤーを目指します。
          </p>

          <div style={styles.finalBox}>
            <div style={styles.finalLabel}>WIN CONDITION</div>
            <div style={styles.finalText}>
              ゲーム終了時のチップが最も多いプレイヤーの勝利
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲームの準備</h2>

          <p style={styles.text}>
            プレイヤーは2～4人で参加します。
          </p>

          <p style={styles.text}>
            全員の初期チップは10,000チップです。
          </p>

          <p style={styles.text}>
            ゲームは全3ラウンドで行われます。
          </p>

          <p style={styles.text}>
            各ラウンドではスタートプレイヤーが決まり、
            時計回りにゲームを進めます。
          </p>

          <p style={styles.text}>
            ラウンドが進むごとにスタートプレイヤーが交代し、
            各プレイヤーがスタートプレイヤーを担当します。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>カードの正体</h2>

          <p style={styles.text}>
            エクストラポーカーで使用するカードは、
            ONE PIECEキャラクターの説明文をもとに作られています。
          </p>

          <p style={styles.text}>
            説明文の中に登場する文字の種類の変化を利用して、
            文章を複数のカードに分割します。
          </p>

          <p style={styles.text}>
            例.アンジョウの場合、ゴールド/ロジャー/公開処刑/見/来/海賊/マニア/腕/ドクロ/タトゥー/入/れるほどに/海賊/憧/れと/敬意/持/っている
          </p>

          <div style={styles.typeGrid}>
            <TypeCard title="漢字" text="漢字で構成された情報" />
            <TypeCard title="ひらがな" text="ひらがなで構成された情報" />
            <TypeCard title="カタカナ" text="カタカナで構成された情報" />
            <TypeCard title="数字" text="数字で構成された情報" />
          </div>

          <p style={styles.note}>
            ※記号など、カード化の対象にならない文字は除外されます。
          </p>

          <p style={styles.note}>
            ※単独のひらがなはカードとして扱われません。
          </p>

          <p style={styles.note}>
            ※「ー」は直前の文字種に続く文字として扱われます。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ラウンド開始</h2>

          <p style={styles.text}>
            ラウンドが開始すると、
            そのラウンドで使用するキャラクターの情報カードが用意されます。
          </p>

          <p style={styles.text}>
            最初に全員へカードが1枚ずつ配られます。
          </p>

          <p style={styles.text}>
            ここから、各プレイヤーは手元の情報を確認しながら、
            どこまで回答できそうかを判断していきます。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>プレイヤーの行動</h2>

          <p style={styles.text}>
            基本的な行動には、
            「回答」「レイズ」「コール」「フォールド」があります。
          </p>

          <div style={styles.actionGrid}>
            <ActionCard
              title="回答"
              text="キャラクター名を答える権利を確保し、ベットを行います。"
              accent
            />
            <ActionCard
              title="レイズ"
              text="現在のベット額より高い金額を提示します。"
            />
            <ActionCard
              title="コール"
              text="現在のベット額に合わせます。"
            />
            <ActionCard
              title="フォールド"
              text="そのラウンドの勝負から降ります。"
            />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ベットのルール</h2>

          <p style={styles.text}>
            ベットは100チップ単位で行います。
          </p>

          <p style={styles.text}>
            最低ベットは100チップです。
          </p>

          <p style={styles.text}>
            1回のベット額には2,000チップの上限があります。
          </p>

          <div style={styles.exampleBox}>
            100 → 200 → 300 → 400 → … → 2,000
          </div>

          <p style={styles.text}>
            すでに他のプレイヤーがベットしている場合、
            その金額に合わせる「コール」、
            それより高い金額を提示する「レイズ」、
            勝負を降りる「フォールド」などから判断します。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>「回答」とは</h2>

          <p style={styles.text}>
            「回答」は、単純に答えを入力するだけの行動ではありません。
          </p>

          <p style={styles.text}>
            回答を選択すると、
            回答権を確保したうえで、その時点のベットに参加します。
          </p>

          <p style={styles.text}>
            他の参加者全員がフォールドした場合、回答フェーズを行わずにチップを獲得できるため、ポーカーのようなブラフも可能です。
          </p>

          <div style={styles.highlightBox}>
            <strong>回答のポイント</strong>
            <br />
            早く回答するほど情報は少ない。
            <br />
            しかし、待っている間に他のプレイヤーが回答してしまう可能性があります。
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>回答した後の行動</h2>

          <p style={styles.text}>
            回答を選択した後は、
            通常のレイズやコールを続けるのではなく、
            次の手番では「回答」または「フォールド」の判断になります。
          </p>

          <p style={styles.text}>
            つまり、一度回答に入ったプレイヤーは、
            そのまま通常のベット合戦を続けるのではなく、
            回答するか、回答を諦めてフォールドするかを選択します。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>回答内容の公開</h2>

          <p style={styles.text}>
            他のプレイヤーがどんな回答をしているのかも確認できます。
          </p>

          <p style={styles.text}>
            ただし、複数のプレイヤーが回答した場合、
            回答内容はすべての回答が揃ってから一斉に公開されます。
          </p>

          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>重要</div>
            <p style={styles.text}>
              誰か1人が回答した時点で、
              その人の答えがすぐに正解かどうか公開されるわけではありません。
その為、他の回答者の回答を参考にできるのは、不正解だった次のターンからとなります。
            </p>
          </div>

          <p style={styles.text}>
            正解者が出るまで、
            他のプレイヤーも回答するチャンスがあります。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>正解した場合</h2>

          <p style={styles.text}>
            回答がキャラクター名として正しければ、
            そのプレイヤーがポットを獲得します。
          </p>

          <div style={styles.ruleBox}>
            <div style={styles.ruleTitle}>正解</div>
            <div style={styles.ruleMain}>ポットを獲得</div>
            <div style={styles.ruleSub}>
              複数人が正解した場合は、正解者で均等に分配
            </div>
          </div>

          <p style={styles.text}>
            同じラウンドで複数のプレイヤーが正解した場合、
            ポットは正解者の間で均等に分配されます。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>不正解の場合</h2>

          <p style={styles.text}>
            回答したキャラクター名が正解と一致しなかった場合、
            そのプレイヤーはその問題に対する回答権を失います。
          </p>

          <p style={styles.text}>
            その後、まだ回答できるプレイヤーが残っていれば、
            ゲームは続行されます。
          </p>

          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>回答権は1度のみ</div>
            <p style={styles.text}>
              早く回答することで先手を取れる一方、
              間違えると回答権を失い、正解者が出るまでそのターンはフォールド扱いとなります。
            </p>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>回答できるプレイヤーが1人だけになった場合</h2>

          <p style={styles.text}>
            他のプレイヤーがフォールドではなく不正解により、
            回答可能なプレイヤーが1人だけになる場合があります。
          </p>

          <p style={styles.text}>
            この場合、そのプレイヤーは残っている山札をすべて引き、
            その情報を確認したうえで、最後に1度だけ回答します。
          </p>

          <div style={styles.highlightBox}>
            <strong>最後の1人</strong>
            <br />
            残りの情報をすべて確認できます。
            <br />
            ただし、最後の回答チャンスは1回です。
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>山札が足りない場合</h2>

          <p style={styles.text}>
            残りの山札がプレイヤー全員に配れるほど残っていない場合は、
            配れる人数までカードを配ります。
          </p>

          <p style={styles.text}>
            それでも正解者が出なかった場合、
            その場の勝負は終了し、
            ポットはそのラウンドで獲得されません。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>時計回りの進行</h2>

          <p style={styles.text}>
            プレイヤーの行動順は時計回りで進みます。
          </p>

          <p style={styles.text}>
            スタートプレイヤーから行動し、
            その後、順番に次のプレイヤーへ移ります。
          </p>

          <p style={styles.text}>
            ラウンドごとにスタートプレイヤーが交代するため、
            特定のプレイヤーだけが毎回最初に行動することはありません。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>1ラウンドの大まかな流れ</h2>

          <div style={styles.step}>
            <div style={styles.stepNumber}>1</div>
            <div>
              <h3 style={styles.stepTitle}>カードを受け取る</h3>
              <p style={styles.stepText}>
                最初に全員へ情報カードが1枚ずつ配られます。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>2</div>
            <div>
              <h3 style={styles.stepTitle}>ベットを開始</h3>
              <p style={styles.stepText}>
                最低100チップからベットを行います。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>3</div>
            <div>
              <h3 style={styles.stepTitle}>レイズ・コール・フォールド</h3>
              <p style={styles.stepText}>
                情報量と他プレイヤーの動きを見ながら判断します。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>4</div>
            <div>
              <h3 style={styles.stepTitle}>回答</h3>
              <p style={styles.stepText}>
                キャラクター名が分かったと思ったら回答します。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>5</div>
            <div>
              <h3 style={styles.stepTitle}>正誤判定</h3>
              <p style={styles.stepText}>
                正解者がいればポットを獲得します。不正解ならそのプレイヤーの回答権がなくなります。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>6</div>
            <div>
              <h3 style={styles.stepTitle}>次の情報へ</h3>
              <p style={styles.stepText}>
                全員不正解の場合、まだ行動可能なプレイヤーへ次のカードが配られます。
              </p>
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>全員不正解になった場合</h2>

          <p style={styles.text}>
            最初に配られた情報だけでは誰もキャラクターを当てられない場合、
            次の情報カードが追加で配られます。
          </p>

          <p style={styles.text}>
            この処理は、まだ回答権を持っているプレイヤーを対象に行われます。
          </p>

          <p style={styles.text}>
            つまり、ゲームが進むほど情報量が増え、
            正解に近づいていきます。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>チップとポット</h2>

          <p style={styles.text}>
            プレイヤーがベットしたチップはポットに集められます。
          </p>

          <p style={styles.text}>
            正解者が出た場合、
            その時点でポットに入っているチップを獲得します。
          </p>

          <div style={styles.chipGrid}>
            <Chip title="初期チップ" value="10,000" />
            <Chip title="最低ベット" value="100" />
            <Chip title="ベット単位" value="100刻み" />
            <Chip title="最大ベット" value="2,000" />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>エクストラポーカーの重要な読み合い</h2>

          <div style={styles.tipGrid}>
            <Tip
              title="早く回答する"
              text="情報が少ない段階で回答権を狙う。成功すれば早い段階でポットを取れる。"
            />

            <Tip
              title="待つ"
              text="追加情報を待ってから回答する。ただし、その間に他のプレイヤーに先を越される可能性がある。"
            />

            <Tip
              title="レイズする"
              text="自分が正解できそうなら、ポットを大きくしてから回答を狙う。"
            />

            <Tip
              title="フォールドする"
              text="正解できないと判断したら無理に勝負せず、損失を抑える。"
            />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲーム終了</h2>

          <p style={styles.text}>
            全3ラウンドが終了するとゲーム終了です。
          </p>

          <p style={styles.text}>
            最後に各プレイヤーが持っているチップを比較します。
          </p>

          <div style={styles.finalBox}>
            <div style={styles.finalLabel}>WINNER</div>
            <div style={styles.finalText}>
              最も多くのチップを持っているプレイヤーが勝利
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>まとめ</h2>

          <ul style={styles.bigList}>
            <li>全員10,000チップからスタート</li>
            <li>全3ラウンド</li>
            <li>2～4人でプレイ</li>
            <li>行動順は時計回り</li>
            <li>最低ベットは100チップ</li>
            <li>ベットは100チップ刻み</li>
            <li>ベット上限は2,000チップ</li>
            <li>「回答」「レイズ」「コール」「フォールド」を使い分ける</li>
            <li>回答すると回答権を使って正解を狙う</li>
            <li>不正解になるとその問題での回答権を失う</li>
            <li>複数人が正解した場合はポットを均等分配</li>
            <li>回答可能者が1人だけになった場合は残り山札をすべて確認して1回答</li>
            <li>最後に最も多くのチップを持っている人が勝利</li>
          </ul>
        </section>

        <section style={styles.footer}>
          <Link href="/rate-match" style={styles.button}>
            フリーマッチへ戻る
          </Link>
        </section>
      </div>
    </main>
  );
}

function Info({ title, value }) {
  return (
    <div style={styles.infoCard}>
      <div style={styles.infoTitle}>{title}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

function TypeCard({ title, text }) {
  return (
    <div style={styles.typeCard}>
      <div style={styles.typeTitle}>{title}</div>
      <div style={styles.typeText}>{text}</div>
    </div>
  );
}

function ActionCard({ title, text, accent }) {
  return (
    <div
      style={{
        ...styles.actionCard,
        ...(accent ? styles.actionCardAccent : {}),
      }}
    >
      <div style={styles.actionTitle}>{title}</div>
      <div style={styles.actionText}>{text}</div>
    </div>
  );
}

function Tip({ title, text }) {
  return (
    <div style={styles.tipCard}>
      <div style={styles.tipTitle}>{title}</div>
      <div style={styles.tipText}>{text}</div>
    </div>
  );
}

function Chip({ title, value }) {
  return (
    <div style={styles.chipCard}>
      <div style={styles.chipTitle}>{title}</div>
      <div style={styles.chipValue}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background:
      'linear-gradient(180deg, #08111f 0%, #0d1728 45%, #101827 100%)',
    color: '#f8fafc',
    padding: '32px 16px 80px',
    boxSizing: 'border-box',
  },

  container: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto',
  },

  backLink: {
    display: 'inline-block',
    color: '#cbd5e1',
    textDecoration: 'none',
    fontSize: '14px',
    marginBottom: '24px',
  },

  hero: {
    padding: '32px 24px',
    borderRadius: '24px',
    background:
      'linear-gradient(135deg, rgba(30,41,59,.98), rgba(15,23,42,.98))',
    border: '1px solid rgba(148,163,184,.2)',
    boxShadow: '0 20px 60px rgba(0,0,0,.3)',
    marginBottom: '20px',
  },

  badge: {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: '999px',
    background: '#a78bfa',
    color: '#1e1b4b',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '1px',
    marginBottom: '12px',
  },

  title: {
    margin: 0,
    fontSize: 'clamp(28px, 6vw, 48px)',
    lineHeight: 1.15,
    fontWeight: 900,
  },

  subtitle: {
    margin: '16px 0 0',
    color: '#cbd5e1',
    lineHeight: 1.8,
    fontSize: '15px',
  },

  section: {
    background: 'rgba(15,23,42,.92)',
    border: '1px solid rgba(148,163,184,.16)',
    borderRadius: '20px',
    padding: '26px 22px',
    marginBottom: '16px',
  },

  heading: {
    margin: '0 0 20px',
    fontSize: '24px',
    fontWeight: 900,
    borderLeft: '5px solid #a78bfa',
    paddingLeft: '12px',
  },

  text: {
    margin: '10px 0',
    lineHeight: 1.85,
    color: '#dbe4f0',
    fontSize: '15px',
  },

  note: {
    margin: '10px 0',
    lineHeight: 1.7,
    color: '#94a3b8',
    fontSize: '13px',
  },

  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '10px',
    marginTop: '20px',
  },

  infoCard: {
    background: '#111c2e',
    border: '1px solid rgba(148,163,184,.15)',
    borderRadius: '14px',
    padding: '16px',
  },

  infoTitle: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '6px',
  },

  infoValue: {
    fontWeight: 800,
    fontSize: '15px',
  },

  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
    margin: '18px 0',
  },

  typeCard: {
    background: '#111c2e',
    border: '1px solid rgba(167,139,250,.2)',
    borderRadius: '14px',
    padding: '16px',
  },

  typeTitle: {
    fontSize: '18px',
    fontWeight: 900,
    color: '#c4b5fd',
    marginBottom: '6px',
  },

  typeText: {
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#cbd5e1',
  },

  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    marginTop: '18px',
  },

  actionCard: {
    background: '#111c2e',
    border: '1px solid rgba(148,163,184,.15)',
    borderRadius: '14px',
    padding: '18px',
  },

  actionCardAccent: {
    border: '1px solid rgba(167,139,250,.55)',
    background: 'rgba(167,139,250,.09)',
  },

  actionTitle: {
    fontSize: '18px',
    fontWeight: 900,
    color: '#c4b5fd',
    marginBottom: '8px',
  },

  actionText: {
    color: '#cbd5e1',
    lineHeight: 1.7,
    fontSize: '13px',
  },

  exampleBox: {
    background: '#07111f',
    border: '1px solid rgba(167,139,250,.3)',
    borderRadius: '12px',
    padding: '16px',
    margin: '14px 0',
    color: '#c4b5fd',
    lineHeight: 1.8,
    fontWeight: 700,
  },

  highlightBox: {
    background: 'rgba(167,139,250,.08)',
    border: '1px solid rgba(167,139,250,.35)',
    borderRadius: '14px',
    padding: '18px',
    margin: '18px 0',
    lineHeight: 1.8,
    color: '#ede9fe',
  },

  warningBox: {
    background: 'rgba(239,68,68,.08)',
    border: '1px solid rgba(239,68,68,.3)',
    borderRadius: '14px',
    padding: '18px',
    margin: '18px 0',
  },

  warningTitle: {
    fontWeight: 900,
    color: '#fca5a5',
    fontSize: '18px',
    marginBottom: '8px',
  },

  ruleBox: {
    background: '#111c2e',
    border: '1px solid rgba(167,139,250,.2)',
    borderRadius: '16px',
    padding: '20px',
    margin: '18px 0',
    textAlign: 'center',
  },

  ruleTitle: {
    color: '#94a3b8',
    fontSize: '13px',
    marginBottom: '8px',
  },

  ruleMain: {
    fontSize: '22px',
    fontWeight: 900,
    color: '#c4b5fd',
  },

  ruleSub: {
    marginTop: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
  },

  step: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    marginBottom: '16px',
    padding: '16px',
    background: '#111c2e',
    borderRadius: '14px',
    border: '1px solid rgba(148,163,184,.12)',
  },

  stepNumber: {
    flex: '0 0 34px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#a78bfa',
    color: '#1e1b4b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
  },

  stepTitle: {
    margin: '2px 0 5px',
    fontSize: '16px',
    fontWeight: 900,
  },

  stepText: {
    margin: 0,
    color: '#cbd5e1',
    lineHeight: 1.7,
    fontSize: '14px',
  },

  tipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '10px',
    marginTop: '18px',
  },

  tipCard: {
    background: '#111c2e',
    borderRadius: '14px',
    padding: '16px',
    border: '1px solid rgba(148,163,184,.12)',
  },

  tipTitle: {
    fontWeight: 900,
    color: '#c4b5fd',
    marginBottom: '7px',
  },

  tipText: {
    color: '#cbd5e1',
    lineHeight: 1.7,
    fontSize: '13px',
  },

  chipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
    marginTop: '18px',
  },

  chipCard: {
    background: '#111c2e',
    border: '1px solid rgba(167,139,250,.2)',
    borderRadius: '14px',
    padding: '16px',
    textAlign: 'center',
  },

  chipTitle: {
    color: '#94a3b8',
    fontSize: '12px',
    marginBottom: '6px',
  },

  chipValue: {
    color: '#c4b5fd',
    fontSize: '20px',
    fontWeight: 900,
  },

  bigList: {
    lineHeight: 2.2,
    color: '#dbe4f0',
    paddingLeft: '24px',
    margin: 0,
  },

  finalBox: {
    textAlign: 'center',
    padding: '28px 16px',
    margin: '22px 0',
    borderRadius: '18px',
    background:
      'linear-gradient(135deg, rgba(167,139,250,.18), rgba(167,139,250,.04))',
    border: '1px solid rgba(167,139,250,.4)',
  },

  finalLabel: {
    fontSize: '12px',
    letterSpacing: '3px',
    color: '#c4b5fd',
    fontWeight: 900,
    marginBottom: '8px',
  },

  finalText: {
    fontSize: '22px',
    fontWeight: 900,
  },

  footer: {
    textAlign: 'center',
    paddingTop: '8px',
  },

  button: {
    display: 'inline-block',
    padding: '14px 24px',
    borderRadius: '12px',
    background: '#a78bfa',
    color: '#1e1b4b',
    textDecoration: 'none',
    fontWeight: 900,
  },
};