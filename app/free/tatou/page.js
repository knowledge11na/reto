
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "");

const styles = {
  page: {
    minHeight: "100vh",
    background: "#10151d",
    color: "#f5f7fa",
    padding: "16px",
    boxSizing: "border-box",
    fontFamily: "sans-serif",
  },
  panel: {
    maxWidth: "1000px",
    margin: "0 auto 16px",
    padding: "16px",
    background: "#202a37",
    border: "1px solid #3b4858",
    borderRadius: "14px",
  },
  title: {
    textAlign: "center",
    margin: "0 0 16px",
    fontSize: "26px",
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
  },
  button: {
    padding: "10px 15px",
    border: "0",
    borderRadius: "8px",
    background: "#e8b84a",
    color: "#151515",
    fontWeight: "bold",
    cursor: "pointer",
  },
  input: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #68788a",
    background: "#111923",
    color: "#fff",
    fontSize: "16px",
  },
  card: {
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #526175",
    background: "#18212c",
  },
};

function HasteVouteContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") || "";
  const socketRef = useRef(null);
  const lastRoundRef = useRef(null);
  const [me, setMe] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [targetScore, setTargetScore] = useState("40");
  const [answerSeconds, setAnswerSeconds] = useState("120");
  const [declareNumber, setDeclareNumber] = useState("1");
  const [now, setNow] = useState(0);

  const emit = useCallback((event, payload = {}) => {
    socketRef.current?.emit(event, {
      roomId,
      ...payload,
    });
  }, [roomId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const response = await fetch("/api/me");
        const data = await response.json();

        if (cancelled) return;

        const user = data?.user ?? data?.me ?? data;

        const userId =
          user?.id ??
          user?.userId ??
          user?.user_id;

        if (!userId) {
          setError("ログイン情報を取得できません。ログイン後に入り直してください。");
          return;
        }

        const name =
          user?.name ??
          user?.display_name ??
          user?.username ??
          user?.email ??
          "プレイヤー";

        setMe({
          userId: String(userId),
          name: String(name),
        });
      } catch {
        setError("ユーザー情報の取得に失敗しました。");
      }
    }

    loadMe();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me || !roomId) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketRef.current = socket;

    const onConnect = () => {
      socket.emit("haste-voute:join", {
        roomId,
        userId: me.userId,
        name: me.name,
      });
    };

    const onState = (nextState) => {
      if (nextState?.round !== lastRoundRef.current) {
        lastRoundRef.current = nextState?.round ?? null;
        setAnswerText("");
      }

      setState(nextState);

      if (nextState?.deadline) {
        setNow(Date.now());
      }

      if (nextState?.targetScore != null) {
        setTargetScore(String(nextState.targetScore));
      }

      if (nextState?.answerSeconds != null) {
        setAnswerSeconds(String(nextState.answerSeconds));
      }
    };

    const onError = (message) => {
      setError(String(message || "ゲームでエラーが発生しました。"));
    };

    socket.on("connect", onConnect);
    socket.on("haste-voute:state", onState);
    socket.on("haste-voute:error", onError);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("haste-voute:state", onState);
      socket.off("haste-voute:error", onError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [me, roomId]);

  const myPlayer = state?.players?.find(
    (player) => player.userId === me?.userId
  );

  const isHost = state?.hostUserId === me?.userId;
  const isMyTurn = state?.turnUserId === me?.userId;
  const isAnswerer = state?.answererUserId === me?.userId;

  const remainingSeconds = state?.deadline
    ? Math.max(
        0,
        Math.ceil(
          (state.deadline -
            (now || state.deadline - Number(state.answerSeconds || 0) * 1000)) /
            1000
        )
      )
    : 0;

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  };

  const submitDeclaration = () => {
    emit("haste-voute:declare", {
      number: Number(declareNumber),
    });
  };

  if (!roomId) {
    return (
      <main style={styles.page}>
        <section style={styles.panel}>
          部屋番号がありません。フリールームから入り直してください。
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <h1 style={styles.title}>ハステ・ヴォルテ</h1>

        <div style={styles.row}>
          <span>部屋：{roomId}</span>
          <span>ラウンド：{state?.round ?? 0}</span>
          <span>
            状態：{
              ({
                setup: "開始設定",
                answer: "回答中",
                declare: "数字の宣言",
                reveal: "回答公開",

                vote: "OK／NG投票",
                "round-end": "ラウンド終了・次のお題待ち",
                finished: "ゲーム終了",

              })[state?.phase] || "接続中"
            }
          </span>
        </div>

        {state?.players?.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "8px",
              marginTop: "14px",
            }}
          >
            {state.players.map((player) => (
              <div
                key={player.userId}
                style={{
                  ...styles.card,
                  borderColor:
                    player.userId === state.turnUserId
                      ? "#e8b84a"
                      : "#526175",
                }}
              >
                <strong>
                  {player.userId === state.turnUserId ? "▶ " : ""}
                  {player.name}
                </strong>
                <div style={{ fontSize: "22px", marginTop: "5px" }}>
                  {player.score} 点
                </div>
                <small>
                  {player.isConnected ? "オンライン" : "切断中"}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <section
          style={{
            ...styles.panel,
            borderColor: "#e35d6a",
            color: "#ffb6bd",
          }}
        >
          {error}
          <button
            type="button"
            style={{ ...styles.button, marginLeft: "12px" }}
            onClick={() => setError("")}
          >
            閉じる
          </button>
        </section>
      )}

      {state?.phase === "setup" && (
        <section style={styles.panel}>
          <h2>ゲーム開始設定</h2>

          {isHost ? (
            <>
              <div style={{ ...styles.row, marginBottom: "14px" }}>
                <label>
                  勝利点　
                  <input
                    style={{ ...styles.input, width: "90px" }}
                    type="number"
                    min="5"
                    max="500"
                    value={targetScore}
                    onChange={(event) => setTargetScore(event.target.value)}
                  />
                </label>

                <label>
                  回答時間　
                  <select
                    style={styles.input}
                    value={answerSeconds}
                    onChange={(event) => setAnswerSeconds(event.target.value)}
                  >
                    <option value="60">1分</option>
                    <option value="90">1分30秒</option>
                    <option value="120">2分</option>
                    <option value="180">3分</option>
                    <option value="240">4分</option>
                    <option value="300">5分</option>
                  </select>
                </label>

                <button
                  type="button"
                  style={styles.button}
                  onClick={() =>
                    emit("haste-voute:setup", {
                      targetScore: Number(targetScore),
                      answerSeconds: Number(answerSeconds),
                    })
                  }
                >
                  設定を反映
                </button>
              </div>

              <button
                type="button"
                style={styles.button}
                disabled={(state.players?.length ?? 0) < 2}
                onClick={() => emit("haste-voute:start")}
              >
                ゲーム開始
              </button>
              {(state.players?.length ?? 0) < 2 && (
                <p>2人以上がゲーム画面に入ると開始できます。</p>
              )}
            </>
          ) : (
            <p>ホストが設定し、ゲームを開始するまで待ってね。</p>
          )}

          <p>勝利点：{state.targetScore} 点</p>
          <p>回答時間：{formatTime(state.answerSeconds)}</p>
        </section>
      )}

      {state?.phase === "answer" && (
        <section style={styles.panel}>
          <div
            style={{
              textAlign: "center",
              fontSize: "32px",
              fontWeight: "bold",
              color: remainingSeconds <= 15 ? "#ff7272" : "#e8b84a",
            }}
          >
            {formatTime(remainingSeconds)}
          </div>

          <div
            style={{
              margin: "20px 0",
              padding: "24px 12px",
              background: "#f5f0df",
              color: "#17202b",
              borderRadius: "12px",
              textAlign: "center",
            }}
          >
            <small>今回のお題</small>
            <h2 style={{ fontSize: "25px", margin: "10px 0" }}>
              {state.topic}
            </h2>
          </div>


          {state.handicapCards?.length > 0 && (
            <div style={{ ...styles.card, marginBottom: "16px" }}>
              <h3 style={{ marginTop: 0 }}>所持中のハンデカード</h3>
              {state.handicapCards.map((item, index) => (
                <div
                  key={`${item.userId}-${index}`}
                  style={{
                    padding: "8px 0",
                    borderTop: index === 0 ? "none" : "1px solid #526175",
                  }}
                >
                  <strong>{item.name}</strong>
                  <span> の所持カード：</span>
                  <strong>{item.card}</strong>
                </div>
              ))}
            </div>
          )}


          <p>思いつく回答を1行に1つずつ入力してね。</p>

          <textarea
            style={{
              ...styles.input,
              width: "100%",
              minHeight: "180px",
              boxSizing: "border-box",
              resize: "vertical",
            }}
            value={answerText}
            onChange={(event) => {
              const answers = event.target.value;
              setAnswerText(answers);
              emit("haste-voute:save-draft", { answers });
            }}
            placeholder={"回答1\n回答2\n回答3"}
          />

          <div style={{ ...styles.row, marginTop: "12px" }}>
            <span>
              入力済み：{
                answerText.split(/\r?\n/).filter((text) => text.trim()).length
              } 件
            </span>
          </div>

          <p>
            制限時間が終了すると、送信した回答が確定して数字の宣言に移ります。
          </p>
        </section>
      )}

      {state?.phase === "declare" && (
        <section style={styles.panel}>
          <h2>数字を宣言しよう</h2>
          <p>自分が正しいと証明できる回答数を宣言してね。</p>
          <p>
            保存済み回答数：<strong>{state.ownAnswers?.length ?? 0}件</strong>
          </p>

          {myPlayer?.declaredNumber == null ? (
            <div style={styles.row}>
              <input
                style={{ ...styles.input, width: "100px" }}
                type="number"
                min="0"
                max="100"
                value={declareNumber}
                onChange={(event) => setDeclareNumber(event.target.value)}
              />
              <button
                type="button"
                style={styles.button}
                onClick={submitDeclaration}
              >
                この数字で宣言
              </button>
            </div>
          ) : (
            <p>宣言済み。ほかのプレイヤーの宣言を待っています。</p>
          )}

          <h3>宣言状況</h3>
          {state.players.map((player) => (
            <p key={player.userId}>
              {player.name}：{
                player.declaredNumber == null
                  ? "宣言待ち"
                  : "宣言済み"
              }
            </p>
          ))}
        </section>
      )}

      {(state?.phase === "reveal" || state?.phase === "vote") && (
        <section style={styles.panel}>
          <h2>回答公開フェーズ</h2>


          {state.handicapCards?.length > 0 && (
            <div style={{ ...styles.card, marginBottom: "16px" }}>
              <h3 style={{ marginTop: 0 }}>所持中のハンデカード</h3>
              {state.handicapCards.map((item, index) => (
                <div
                  key={`${item.userId}-${index}`}
                  style={{
                    padding: "8px 0",
                    borderTop: index === 0 ? "none" : "1px solid #526175",
                  }}
                >
                  <strong>{item.name}</strong>
                  <span> の所持カード：</span>
                  <strong>{item.card}</strong>
                </div>
              ))}
            </div>
          )}


          <p>
            回答者：
            <strong>{state.answererName}</strong>
          </p>

          <p>
            宣言数：{
              state.players.find(
                (player) => player.userId === state.answererUserId
              )?.declaredNumber ?? "-"
            }　
            採用数：{
              state.players.find(
                (player) => player.userId === state.answererUserId
              )?.acceptedCount ?? 0
            }
          </p>

          {state.currentReveal && (
            <div
              style={{
                ...styles.card,
                textAlign: "center",
                padding: "24px 12px",
                margin: "16px 0",
                background: "#f5f0df",
                color: "#17202b",
              }}
            >
              <small>公開された回答</small>
              <h2 style={{ fontSize: "28px" }}>
                {state.currentReveal.text}
              </h2>
            </div>
          )}

          {state.phase === "reveal" && isAnswerer && (
            <>
              <p>回答カードを1枚選んで公開してね。</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "10px",
                }}
              >
               
                {state.ownAnswers.map((answer) => (
                  <button
                    type="button"
                    key={answer.index}
                    style={{
                      ...styles.button,
                      minHeight: "64px",
                      width: "100%",
                      fontSize: "18px",
                      touchAction: "manipulation",
                      pointerEvents: "auto",
                      position: "relative",
                      zIndex: 1,
                    }}
                    onClick={() => {
                      console.log("[haste-voute] 公開カードをクリック", {
                        index: answer.index,
                        text: answer.text,
                        roomId,
                      });

                      emit("haste-voute:reveal", {
                        index: answer.index,
                      });
                    }}
                  >
                    {answer.text}
                  </button>
                ))}

              </div>
            </>
          )}

          {state.phase === "vote" && !isAnswerer && (
            <>
              <p>
                回答が重複していたら、自分の該当カードをタップして削除できます。
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "8px",
                }}
              >
                {state.ownAnswers.map((answer) => (
                  <button
                    type="button"
                    key={answer.index}
                    style={styles.button}
                    onClick={() => {
                      const normalize = (text) =>
                        String(text ?? "")
                          .normalize("NFKC")
                          .replace(/[\s　]/g, "")
                          .toLowerCase();
                      const exact =
                        normalize(answer.text) ===
                        normalize(state.currentReveal?.text);

                      if (
                        !exact &&
                        !window.confirm(
                          "完全一致ではありませんが、この回答カードを削除しますか？"
                        )
                      ) {
                        return;
                      }

                      emit("haste-voute:remove-duplicate", {
                        index: answer.index,
                        force: !exact,
                      });
                    }}
                  >
                    {answer.text}
                  </button>
                ))}
              </div>

              <h3>この回答を採用できる？</h3>
              {Object.prototype.hasOwnProperty.call(
                state.votes ?? {},
                me?.userId
              ) ? (
                <p>投票済み。他のプレイヤーの投票を待っています。</p>
              ) : (
                <div style={styles.row}>
                  <button
                    type="button"
                    style={{
                      ...styles.button,
                      background: "#59c98b",
                    }}
                    onClick={() => emit("haste-voute:vote", { vote: "OK" })}
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.button,
                      background: "#ed7777",
                    }}
                    onClick={() => emit("haste-voute:vote", { vote: "NG" })}
                  >
                    NG
                  </button>
                </div>
              )}

              <p>
                投票状況：{state.voteCount}/{state.voterCount}
              </p>
            </>
          )}

          {state.phase === "reveal" && !isAnswerer && (
            <p>回答者が次のカードを公開するのを待っています。</p>
          )}
        </section>
      )}

      {state?.lastResult && (
        <section style={styles.panel}>
          <h3>直近の結果</h3>
          <p>{state.lastResult}</p>
        </section>
      )}

     

      {state?.phase === "round-end" && (
        <section style={styles.panel}>
          <h2>このラウンドは終了！</h2>
          <p>全員の回答公開が終了しました。</p>
          <p>次のお題では、手番プレイヤーが時計回りに交代します。</p>

          <button
            type="button"
            style={styles.button}
            onClick={() => emit("haste-voute:next-topic")}
          >
            次のお題へ
          </button>
        </section>
      )}


      {state?.phase === "finished" && (
        <section style={styles.panel}>
          <h2>ゲーム終了！</h2>
          <p style={{ fontSize: "24px" }}>{state.lastResult}</p>

          <h3>最終得点</h3>
          {state.players
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((player) => (
              <p key={player.userId}>
                {player.name}：{player.score} 点
              </p>
            ))}
        </section>
      )}
    </main>
  );
}

export default function HasteVoutePage() {
  return (
    <Suspense fallback={<main style={styles.page}>読み込み中...</main>}>
      <HasteVouteContent />
    </Suspense>
  );
}
