// file: app/solo/swaza-search/page.js

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SwazaSearchPage() {
  const [moves, setMoves] = useState([]);
  const [techniques, setTechniques] = useState([]);

  const [answer, setAnswer] = useState(null);

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const [guess, setGuess] = useState("");
  const [suggestions, setSuggestions] = useState([]);
const [selectedMove, setSelectedMove] = useState(null);

  const [history, setHistory] = useState([]);
const [gameId,setGameId] = useState(null);

  const [loading, setLoading] = useState(true);

  // =========================================================
  // データ読み込み
  // =========================================================

  useEffect(() => {
    loadMoves();
  }, []);

  async function loadMoves() {
    try {
      setLoading(true);

      const res = await fetch(
        "/api/swaza",
        {
          cache: "no-store",
        }
      );

      const json = await res.json();

      if (!json.ok) {
        console.error(json.error);
        return;
      }

      setMoves(json.items);
      setTechniques(json.techniques);

    } catch (err) {
      console.error(err);

    } finally {
      setLoading(false);
    }
  }

  // =========================================================
  // ゲーム開始
  // =========================================================

  function startGame() {
    if (moves.length === 0) return;

    /*
     * Excelの「1行」を問題として選ぶ
     *
     * 正解はこの行のE列「技名」
     */
    const target =
      moves[
        Math.floor(
          Math.random() * moves.length
        )
      ];

    setAnswer(target);

    setStarted(true);
    setFinished(false);

setGuess("");
setSuggestions([]);

const firstList =
  moves.filter(
    m => m.technique !== target.technique
  );

const first =
  firstList[
    Math.floor(
      Math.random()*firstList.length
    )
  ];

const firstResult =
  createResult(
    first,
    target
  );

const id = Date.now();

setGameId(id);

setHistory([
  firstResult
]);
  }

  // =========================================================
  // リセット
  // =========================================================

  function resetGame() {
    setStarted(false);
    setFinished(false);

    setAnswer(null);

 setGuess("");
setSuggestions([]);
setSelectedMove(null);

    setHistory([]);
  }

  // =========================================================
  // ギブアップ
  // =========================================================

  function giveUp() {
    if (!answer) return;

    alert(
      "答えは\n\n" +
      answer.technique
    );

    resetGame();
  }

  // =========================================================
  // ひらがな → カタカナ
  // =========================================================

  function hiraToKata(str) {
    return str.replace(
      /[\u3041-\u3096]/g,
      (s) =>
        String.fromCharCode(
          s.charCodeAt(0) + 0x60
        )
    );
  }

function normalizeText(str){

  if(!str) return "";

  return hiraToKata(
    String(str)
      .replace(
        /[\s　「」『』（）()【】［］\[\]・,，、。！？!?.：:;；"'’”\-ー〜～]/g,
        ""
      )
  );

}

function normalizeJudgeText(str){

  if(!str) return "";

  return String(str)
    .replace(
      /[\s　「」『』（）()【】［］\[\]・,，、。！？!?.：:;；"'’”\-ー〜～]/g,
      ""
    );

}

  // =========================================================
  // 技名入力
  // =========================================================

  function onChange(e) {
    const value = e.target.value;

    setGuess(value);

    if (value === "") {
      setSuggestions([]);
      return;
    }

const keyword =
  normalizeText(value);

/*
 * 記号・スペース無視検索
 */
const list = moves
  .filter((move)=>{

    const target =
      normalizeText(move.displayName);

    return target.includes(keyword);

  })
  .filter((move)=>
    !history.some(
      (h)=>
        h.move?.id === move.id
    )
  )
  .slice(0,1000);

setSuggestions(list);
  }

  // =========================================================
  // 候補選択
  // =========================================================

function choose(move){

  setSelectedMove(move);

  setGuess(move.displayName);

  setSuggestions([]);

}

  // =========================================================
  // 複数人を分解
  // =========================================================

  function splitPeople(value) {
    if (
      !value ||
      value === "不明"
    ) {
      return [];
    }

    return value
      .split(
        /[、,，\/＆&・]/
      )
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // =========================================================
  // 誰が / 誰に 判定
  //
  // 全員一致 → 緑
  // 一部一致 → 黄
  // 一致なし → 黒
  // =========================================================

  function judgePeople(
    guess,
    answer
  ) {
    const g =
      splitPeople(guess);

    const a =
      splitPeople(answer);

    if (
      g.length === 0 &&
      a.length === 0
    ) {
      return "green";
    }

    if (
      g.length === 0 ||
      a.length === 0
    ) {
      return "gray";
    }

    const common =
      g.filter((x) =>
        a.includes(x)
      );

    // 全員一致
    if (
      common.length === a.length &&
      common.length === g.length
    ) {
      return "green";
    }

    // 1人でも一致
    if (common.length > 0) {
      return "yellow";
    }

    return "gray";
  }

  // =========================================================
  // 話数判定
  // =========================================================

  function judgeChapter(
    guess,
    answer
  ) {
    if (
      guess === "不明" ||
      answer === "不明"
    ) {
      return guess === answer
        ? "green"
        : "gray";
    }

    const g = Number(guess);
    const a = Number(answer);

    if (
      Number.isNaN(g) ||
      Number.isNaN(a)
    ) {
      return guess === answer
        ? "green"
        : "gray";
    }

    if (g === a) {
      return "green";
    }

    if (g < a) {
      return "up";
    }

    return "down";
  }

  // =========================================================
  // 技名
  // =========================================================

function judgeTechnique(
  guess,
  answer
){

  const g =
    normalizeJudgeText(guess);

  const a =
    normalizeJudgeText(answer);


if(
  normalizeText(g) ===
  normalizeText(a)
){
  return "green";
}


  const gKanji =
    g.match(/[\u4e00-\u9faf]/g) || [];

  const aKanji =
    a.match(/[\u4e00-\u9faf]/g) || [];


  // 漢字1文字一致
  if(
    gKanji.some(
      c => aKanji.includes(c)
    )
  ){
    return "lime";
  }


  // 記号除去後の文字一致
  if(
    [...g].some(
      c => a.includes(c)
    )
  ){
    return "yellow";
  }


  return "gray";

}
  // =========================================================
  // 使った場所
  //
  // 黄色はなし
  //
  // 完全一致 → 緑
  // それ以外 → 黒
  // =========================================================

function judgeLocation(
  guess,
  answer
){

  const g =
    normalizeJudgeText(guess);

  const a =
    normalizeJudgeText(answer);


  if(g === a){
    return "green";
  }


  if(!g || !a){
    return "gray";
  }


  // 数字一致
  const gNum =
    g.match(/\d+/g) || [];

  const aNum =
    a.match(/\d+/g) || [];


  if(
    gNum.some(
      n => aNum.includes(n)
    )
  ){
    return "yellow";
  }


  // 3文字以上連続一致
  for(
    let i=0;
    i<=g.length-3;
    i++
  ){

    const part =
      g.substring(i,i+3);

    if(
      a.includes(part)
    ){
      return "yellow";
    }

  }


  return "gray";

}
  // =========================================================
  // 技名に対応するExcel行を取得
  //
  // 同じ技名が複数行ある場合にも対応
  // =========================================================

  function getRowsByTechnique(
    technique
  ) {
    return moves.filter(
      (move) =>
        move.technique ===
        technique
    );
  }

  // =========================================================
  // 複数候補がある場合の判定
  //
  // 同じ技名がExcelに複数行ある場合、
  // その技の中に一致するものがあれば
  // それを採用する。
  // =========================================================

  function judgeBest(
    rows,
    callback,
    answerValue
  ) {
    if (rows.length === 0) {
      return "gray";
    }

    const results = rows.map(
      (row) =>
        callback(
          row,
          answerValue
        )
    );

    // 緑があれば緑
    if (
      results.includes("green")
    ) {
      return "green";
    }

    // 黄色があれば黄色
    if (
      results.includes("yellow")
    ) {
      return "yellow";
    }

    // ↑↓についてはここでは使わない
    if (
      results.includes("up")
    ) {
      return "up";
    }

    if (
      results.includes("down")
    ) {
      return "down";
    }

    return "gray";
  }

  // =========================================================
  // 結果作成
  // =========================================================

function createResult(
    guessedMove,
    target
  ) {
const guessedRows = [
  guessedMove
];

const result = {
  user: judgeBest(
    guessedRows,
    (row, targetValue) =>
      judgePeople(
        row.user,
        targetValue
      ),
    target.user
  ),

  target: judgeBest(
    guessedRows,
    (row, targetValue) =>
      judgePeople(
        row.target,
        targetValue
      ),
    target.target
  ),

  chapter: judgeBest(
    guessedRows,
    (row, targetValue) =>
      judgeChapter(
        row.chapter,
        targetValue
      ),
    target.chapter
  ),

  technique: judgeTechnique(
    guessedMove.technique,
    target.technique
  ),

  location: judgeBest(
    guessedRows,
    (row, targetValue) =>
      judgeLocation(
        row.location,
        targetValue
      ),
    target.location
  ),
};

return {
  guess: guessedMove.technique,
  move: guessedMove,
  result,

  correct:
    result.user === "green" &&
    result.target === "green" &&
    result.chapter === "green" &&
    result.technique === "green" &&
    result.location === "green",
};
  }
  // =========================================================
  // 回答
  // =========================================================
  function submit() {
    if (!started || finished) {
      return;
    }

const guessedMove =
  selectedMove ||
  moves.find(
    (move) =>
      move.displayName === guess
  );

    if (!guessedMove) {
      return;
    }

    // 同じ技を再回答しない
if (
  history.some(
    (h) =>
      h.move?.id === guessedMove.id
  )
) {
  return;
}
const result =
  createResult(
    guessedMove,
    answer
  );

    const newHistory = [
      ...history,
      result,
    ];

    setHistory(newHistory);

 setGuess("");
setSuggestions([]);
setSelectedMove(null);

if (result.correct) {

  setFinished(true);


const save = {
  id: gameId,
  answer: answer.technique,
  turns: history.length + 1,
  date: new Date().toLocaleString(),

  history:[
    ...history,
    result
  ],

  route:[
    ...history,
    result
  ].map(row => row.move.technique)
};

  const old =
    JSON.parse(
      localStorage.getItem(
        "swazaHistory"
      ) || "[]"
    );


  localStorage.setItem(
    "swazaHistory",
    JSON.stringify([
      save,
      ...old
    ])
  );

}
  }

  // =========================================================
  // セル色
  // =========================================================

  function cellClass(type) {
    switch (type) {
      case "green":
        return `
          bg-green-500
          text-white
          font-bold
        `;

      case "yellow":
        return `
          bg-yellow-300
          text-black
          font-bold
        `;

      case "up":
        return `
          bg-blue-500
          text-white
          font-bold
        `;

      case "down":
        return `
          bg-red-500
          text-white
          font-bold
        `;

      case "lime":
  return `
    bg-lime-400
    text-black
    font-bold
  `;

case "gray":
  return `
    bg-gray-300
    text-black
  `;

default:
  return `
    bg-gray-300
    text-black
  `;
    }
  }

  // =========================================================
  // 話数表示
  // =========================================================

  function chapterText(
    value,
    result
  ) {
    if (
      result === "up"
    ) {
      return `${value} ↑`;
    }

    if (
      result === "down"
    ) {
      return `${value} ↓`;
    }

    return value;
  }

  // =========================================================
  // Loading
  // =========================================================

  if (loading) {
    return (
      <div className="
        min-h-screen
        flex
        items-center
        justify-center
      ">
        読み込み中...
      </div>
    );
  }

  // =========================================================
  // 画面
  // =========================================================

  return (
    <div
      className="
        min-h-screen
        bg-cover
        bg-center
        bg-fixed
      "
      style={{
        backgroundImage:
          "url('/map-bg.jpg')",
      }}
    >

      <div className="
        max-w-6xl
        mx-auto
        p-6
      ">

        {/* ===================== */}
        {/* タイトル */}
        {/* ===================== */}

        <div className="
          relative
          mb-8
        ">

<div className="relative">

<h1 className="
  text-3xl
  sm:text-4xl
  font-bold
  text-center
">
  技サーチ
</h1>


<Link
  href="/solo/swaza-history"
  className="
    absolute
    right-0
    top-1/2
    -translate-y-1/2
    bg-blue-600
    text-white
    px-3
    py-1.5
    rounded-lg
    text-xs
    font-bold
  "
>
  履歴
</Link>

</div>

          {started && (
            <>
              <button
                onClick={giveUp}
                className="
                  absolute
                  left-0
                  top-1/2
                  -translate-y-1/2
                  bg-red-700
                  text-white
                  px-3
                  py-1.5
                  rounded-lg
                  text-xs
                  font-bold
                "
              >
                ギブアップ
              </button>

              <button
                onClick={resetGame}
                className="
                  absolute
                  right-0
                  top-1/2
                  -translate-y-1/2
                  bg-gray-500
                  text-white
                  px-3
                  py-1.5
                  rounded-lg
                  text-xs
                  font-bold
                "
              >
                リセット
              </button>
            </>
          )}

        </div>

        {/* ===================== */}
        {/* スタート */}
        {/* ===================== */}

        {!started ? (

          <div className="
            text-center
            mt-20
          ">

            <button
              onClick={startGame}
              className="
                w-64
                bg-red-600
                hover:bg-red-700
                text-white
                text-xl
                font-bold
                py-4
                rounded-xl
              "
            >
              ゲームスタート
            </button>

          </div>

        ) : (

          <>

            {/* ===================== */}
            {/* 正解 */}
            {/* ===================== */}

            {finished && (
              <div className="
                mt-6
                mb-6
                text-center
                text-3xl
                font-bold
                text-green-600
              ">

                🎉 正解！

                <div className="
                  text-xl
                  mt-2
                ">
                  「{answer.technique}」
                </div>

              </div>
            )}

            {/* ===================== */}
            {/* 入力 */}
            {/* ===================== */}

            <div className="
              flex
              gap-2
              mb-4
            ">

              <input
                value={guess}
                onChange={onChange}
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    "Enter"
                  ) {
                    submit();
                  }
                }}
                disabled={finished}
                placeholder="技名を入力"
                className="
                  flex-1
                  border
                  rounded-lg
                  px-3
                  py-2
                  text-sm
                  text-black
                  bg-white
                "
              />

              <button
                onClick={submit}
                disabled={finished}
                className="
                  bg-blue-600
                  hover:bg-blue-700
                  disabled:bg-gray-400
                  text-white
                  px-4
                  py-2
                  rounded-lg
                  text-sm
                  font-bold
                  whitespace-nowrap
                "
              >
                回答
              </button>

            </div>

            {/* ===================== */}
            {/* プルダウン */}
            {/* ===================== */}

            {suggestions.length > 0 && (

              <div className="
  border
  rounded-lg
  shadow
  mb-4
  bg-white
  text-black
  max-h-80
  overflow-y-auto
">

                {suggestions.map(
  (move) => (

                    <div
                      key={move.id}
                      onClick={() =>
  choose(move)
}
                      className="
                        px-4
                        py-2
                        cursor-pointer
                        hover:bg-gray-100
                        font-medium
                      "
                    >
                      {move.displayName}
                    </div>

                  )
                )}

              </div>

            )}

            {/* ===================== */}
            {/* 結果表 */}
            {/* ===================== */}

            <div className="
              overflow-x-auto
            ">

              <table className="
                w-full
                border-collapse
                text-center
                text-xs
                sm:text-sm
              ">

                <thead>

                  <tr className="
                    bg-gray-200
                    text-black
                  ">

                    <th className="
                      border
                      p-2
                    ">
                      誰が
                    </th>

                    <th className="
                      border
                      p-2
                    ">
                      誰に
                    </th>

                    <th className="
                      border
                      p-2
                    ">
                      話数
                    </th>

                    <th className="
                      border
                      p-2
                    ">
                      技名
                    </th>

                    <th className="
                      border
                      p-2
                    ">
                      使った場所
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {history.map(
                    (row, index) => (

                     <tr key={index}>

  {/* 誰が */}
  <td className={`
    border
    p-2
    ${cellClass(
      row.result.user
    )}
  `}>
    {
      row.move?.user
    }
  </td>


  {/* 誰に */}
  <td className={`
    border
    p-2
    ${cellClass(
      row.result.target
    )}
  `}>
    {
      row.move?.target
    }
  </td>


  {/* 話数 */}
  <td className={`
    border
    p-2
    ${cellClass(
      row.result.chapter
    )}
  `}>
    {chapterText(
      row.move?.chapter ?? "不明",
      row.result.chapter
    )}
  </td>


  {/* 技名 */}
  <td className={`
    border
    p-2
    ${cellClass(
      row.result.technique
    )}
  `}>
    {
      row.guess
    }
  </td>


  {/* 使った場所 */}
  <td className={`
    border
    p-2
    ${cellClass(
      row.result.location
    )}
  `}>
    {
      row.move?.location
    }
  </td>

</tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          </>

        )}

      </div>

    </div>
  );
}