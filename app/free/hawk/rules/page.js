// file: app/rules/hawk/rule/page.js

'use client';

import Link from 'next/link';

export default function HawkRulePage() {
  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <Link href="/rate-match" style={styles.backLink}>
          ← レートマッチへ戻る
        </Link>

        <section style={styles.hero}>
          <div style={styles.badge}>FREE MATCH GAME</div>
          <h1 style={styles.title}>ミス・フライデーのえじき</h1>
          <p style={styles.subtitle}>
            ONE PIECEキャラクターの人気順位を利用した、
            バッティング型の心理戦カードゲーム。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲーム概要</h2>

          <p style={styles.text}>
            「ミス・フライデーのえじき」は、人気順位をもとにした
            キャラクターカードを使って得点カードを奪い合うゲームです。
          </p>

          <p style={styles.text}>
            基本的なゲームシステムは「ハゲタカのえじき」をベースにしています。
            ただし、ナレバトでは通常の数字カードではなく、
            ONE PIECEキャラクターの人気順位をカードの強さとして使用します。
          </p>

          <div style={styles.infoGrid}>
            <Info title="プレイ人数" value="2～4人" />
            <Info title="ラウンド数" value="15ラウンド" />
            <Info title="勝利条件" value="最終得点が最も高いプレイヤー" />
            <Info title="ゲームの特徴" value="読み合い・バッティング" />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲーム開始前の設定</h2>

          <h3 style={styles.subheading}>人気順位の間隔</h3>

          <p style={styles.text}>
            ゲーム開始時に「人気順位の間隔」を設定します。
          </p>

          <p style={styles.text}>
            例えば間隔を「10」にした場合、
          </p>

          <div style={styles.exampleBox}>
            101 → 111 → 121 → 131 → … → 241
          </div>

          <p style={styles.text}>
            のように、一定の間隔で15枚のキャラクターカードが選ばれます。
          </p>

          <p style={styles.note}>
            ※実際に使用されるキャラクターと順位はゲーム開始時に決定されます。
          </p>

          <p style={styles.note}>
            ※ゲーム中は、キャラクターカードの人気順位そのものは公開されません。
            そのため、キャラクター名だけを見て相手との読み合いを行います。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲームで使うカード</h2>

          <h3 style={styles.subheading}>① キャラクターカード</h3>

          <p style={styles.text}>
            各プレイヤーは、ゲームで選ばれたキャラクターカードを
            同じ内容で使用します。
          </p>

          <p style={styles.text}>
            キャラクターカードには、それぞれ人気順位が設定されています。
            この順位が、ゲーム中におけるカードの「強さ」になります。
          </p>

          <div style={styles.highlightBox}>
            <strong>重要</strong>
            <br />
            ゲーム中はキャラクターの人気順位は公開されません。
            「このキャラクターは人気が高そう」
            「このキャラクターなら他の人も選びそう」
            といった予想が重要になります。
          </div>

          <h3 style={styles.subheading}>② 得点カード</h3>

          <p style={styles.text}>
            各ラウンドでは、得点カードが1枚公開されます。
          </p>

          <p style={styles.text}>
            得点カードにはプラスの得点とマイナスの得点があります。
          </p>

          <ul style={styles.list}>
            <li>プラスの得点 → 獲得したいカード</li>
            <li>マイナスの得点 → できるだけ避けたいカード</li>
          </ul>

          <p style={styles.text}>
            その得点カードを誰が獲得するかを、
            全員が同時にキャラクターカードを出して決定します。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>基本的なゲームの流れ</h2>

          <div style={styles.step}>
            <div style={styles.stepNumber}>1</div>
            <div>
              <h3 style={styles.stepTitle}>得点カードが公開される</h3>
              <p style={styles.stepText}>
                そのラウンドで獲得を狙う得点カードが公開されます。
                プラスなのかマイナスなのかを確認します。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>2</div>
            <div>
              <h3 style={styles.stepTitle}>キャラクターを1枚選ぶ</h3>
              <p style={styles.stepText}>
                自分の手札に残っているキャラクターから、
                今回の勝負に使う1枚を選びます。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>3</div>
            <div>
              <h3 style={styles.stepTitle}>全員が同時に公開</h3>
              <p style={styles.stepText}>
                全員のカードがそろったら、一斉に公開されます。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>4</div>
            <div>
              <h3 style={styles.stepTitle}>獲得者を決定</h3>
              <p style={styles.stepText}>
                得点カードがプラスかマイナスかによって、
                最も有利なキャラクターカードを出したプレイヤーが決まります。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>5</div>
            <div>
              <h3 style={styles.stepTitle}>使用したカードを消費</h3>
              <p style={styles.stepText}>
                一度使ったキャラクターカードは、
                そのゲーム中にもう一度使用することはできません。
              </p>
            </div>
          </div>

          <div style={styles.step}>
            <div style={styles.stepNumber}>6</div>
            <div>
              <h3 style={styles.stepTitle}>次のラウンドへ</h3>
              <p style={styles.stepText}>
                これを15ラウンド繰り返します。
              </p>
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>プラスの得点カード</h2>

          <p style={styles.text}>
            プラスの得点カードが公開された場合、
            人気順位が最も高い、つまりゲーム上で最も強いキャラクターカードを
            単独で出したプレイヤーが得点カードを獲得します。
          </p>

          <div style={styles.ruleBox}>
            <div style={styles.ruleTitle}>プラスの場合</div>
            <div style={styles.ruleMain}>強いカードを出す</div>
            <div style={styles.ruleSub}>
              → ただし、他のプレイヤーと同じカードなら無効
            </div>
          </div>

          <h3 style={styles.subheading}>例</h3>

          <div style={styles.exampleBox}>
            プレイヤーA：人気順位の強さ 1位相当
            <br />
            プレイヤーB：人気順位の強さ 2位相当
            <br />
            プレイヤーC：人気順位の強さ 3位相当
            <br />
            <br />
            → Aが単独で最も強いカードならAが獲得
          </div>

          <p style={styles.text}>
            ただし、最も強いカードを複数人が出していた場合、
            そのカードを出したプレイヤーは全員無効になります。
          </p>

          <p style={styles.text}>
            その次に強いカードを出しているプレイヤーが単独なら、
            そのプレイヤーが得点カードを獲得します。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>マイナスの得点カード</h2>

          <p style={styles.text}>
            マイナスの得点カードが公開された場合は、
            プラスの場合とは逆になります。
          </p>

          <p style={styles.text}>
            人気順位が最も低い、つまりゲーム上で最も弱いカードを
            単独で出したプレイヤーが、そのマイナス得点を受け取ります。
          </p>

          <div style={styles.ruleBox}>
            <div style={styles.ruleTitle}>マイナスの場合</div>
            <div style={styles.ruleMain}>弱いカードを出した人が引き取る</div>
            <div style={styles.ruleSub}>
              → ただし、他のプレイヤーと同じカードなら無効
            </div>
          </div>

          <p style={styles.text}>
            例えば、最も弱いカードを2人が同時に出していた場合、
            その2人は無効になります。
          </p>

          <p style={styles.text}>
            その次に弱いカードを出しているプレイヤーが単独なら、
            そのプレイヤーがマイナス得点カードを引き取ります。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>同じカードを出した場合</h2>

          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>バッティング</div>
            <p style={styles.text}>
              同じカードを複数人が出した場合、
              そのカードを出したプレイヤーは全員、獲得候補から外れます。
            </p>
          </div>

          <p style={styles.text}>
            例えばプラス得点で、
          </p>

          <div style={styles.exampleBox}>
            A：最も強いカード
            <br />
            B：最も強いカード
            <br />
            C：次に強いカード
          </div>

          <p style={styles.text}>
            となった場合、最も強いカードを出したAとBは無効。
            Cが単独で残っていれば、Cが得点カードを獲得します。
          </p>

          <p style={styles.text}>
            このため、
            「一番強いカードを出せば勝てる」
            とは限りません。
          </p>

          <p style={styles.text}>
            相手も同じカードを出してくるかどうかを予想することが、
            このゲーム最大のポイントです。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>全員のカードが無効になった場合</h2>

          <p style={styles.text}>
            同じカードのバッティングによって、
            全員のカードが無効になってしまうことがあります。
          </p>

          <p style={styles.text}>
            この場合、そのラウンドの得点カードは誰も獲得しません。
          </p>

          <div style={styles.highlightBox}>
            <strong>得点カードは持ち越し</strong>
            <br />
            場に残った得点カードは、次のラウンドの得点カードと合わせて、
            次の勝負でまとめて争われます。
          </div>

          <p style={styles.text}>
            つまり、1枚の得点カードだけでなく、
            複数の得点カードをまとめて獲得できるチャンスが発生します。
          </p>

          <p style={styles.text}>
            持ち越された得点カードの合計がプラスなら、
            プラスの場合と同じように強いカードを出したプレイヤーが狙います。
          </p>

          <p style={styles.text}>
            合計がマイナスなら、
            マイナスの場合と同じように弱いカードを出したプレイヤーが
            その得点を引き取ります。
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>使用したカードについて</h2>

          <p style={styles.text}>
            一度勝負に使用したキャラクターカードは、
            そのゲーム中は再び使用できません。
          </p>

          <p style={styles.text}>
            そのため、序盤から強いカードを使い切ってしまうと、
            後半に大きな得点カードが出たときに困る可能性があります。
          </p>

          <div style={styles.tipGrid}>
            <Tip
              title="強いカード"
              text="高得点を取りたいときに重要。ただしバッティングに注意。"
            />
            <Tip
              title="弱いカード"
              text="取る必要のないと判断したカードの捨て札などに活用。"
            />
            <Tip
              title="中間のカード"
              text="相手が強いカードを使うと予想される場面で活躍する。"
            />
            <Tip
              title="残りカード"
              text="終盤に何が残っているかを把握することも重要。"
            />
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.heading}>ゲーム終了</h2>

          <p style={styles.text}>
            15ラウンドが終了するとゲーム終了です。
          </p>

          <p style={styles.text}>
            それまでに獲得した得点カードの点数をすべて合計します。
          </p>

          <div style={styles.finalBox}>
            <div style={styles.finalLabel}>WINNER</div>
            <div style={styles.finalText}>
              最終得点が最も高いプレイヤーの勝利
            </div>
          </div>

          <p style={styles.text}>
            プラス得点は加点され、
            マイナス得点は減点されます。
          </p>
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

function Tip({ title, text }) {
  return (
    <div style={styles.tipCard}>
      <div style={styles.tipTitle}>{title}</div>
      <div style={styles.tipText}>{text}</div>
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
    background: '#f59e0b',
    color: '#111827',
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
    borderLeft: '5px solid #f59e0b',
    paddingLeft: '12px',
  },

  subheading: {
    margin: '26px 0 10px',
    fontSize: '18px',
    fontWeight: 800,
    color: '#fbbf24',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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

  exampleBox: {
    background: '#07111f',
    border: '1px solid rgba(245,158,11,.3)',
    borderRadius: '12px',
    padding: '16px',
    margin: '14px 0',
    color: '#fbbf24',
    lineHeight: 1.8,
    fontWeight: 700,
  },

  highlightBox: {
    background: 'rgba(245,158,11,.08)',
    border: '1px solid rgba(245,158,11,.35)',
    borderRadius: '14px',
    padding: '18px',
    margin: '18px 0',
    lineHeight: 1.8,
    color: '#fef3c7',
  },

  warningBox: {
    background: 'rgba(239,68,68,.08)',
    border: '1px solid rgba(239,68,68,.3)',
    borderRadius: '14px',
    padding: '18px',
    marginBottom: '18px',
  },

  warningTitle: {
    fontWeight: 900,
    color: '#fca5a5',
    fontSize: '18px',
    marginBottom: '8px',
  },

  ruleBox: {
    background: '#111c2e',
    border: '1px solid rgba(148,163,184,.2)',
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
    color: '#fbbf24',
  },

  ruleSub: {
    marginTop: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
  },

  list: {
    lineHeight: 2,
    color: '#dbe4f0',
    paddingLeft: '24px',
  },

  bigList: {
    lineHeight: 2.2,
    color: '#dbe4f0',
    paddingLeft: '24px',
    margin: 0,
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
    background: '#f59e0b',
    color: '#111827',
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
    color: '#fbbf24',
    marginBottom: '7px',
  },

  tipText: {
    color: '#cbd5e1',
    lineHeight: 1.7,
    fontSize: '13px',
  },

  finalBox: {
    textAlign: 'center',
    padding: '28px 16px',
    margin: '22px 0',
    borderRadius: '18px',
    background:
      'linear-gradient(135deg, rgba(245,158,11,.18), rgba(245,158,11,.04))',
    border: '1px solid rgba(245,158,11,.4)',
  },

  finalLabel: {
    fontSize: '12px',
    letterSpacing: '3px',
    color: '#fbbf24',
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
    background: '#f59e0b',
    color: '#111827',
    textDecoration: 'none',
    fontWeight: 900,
  },
};