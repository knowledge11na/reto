
"use client";

import { useEffect, useState } from "react";

export default function VivreSearch() {

    const [profiles, setProfiles] = useState([]);
    const [answer, setAnswer] = useState(null);

    const [started, setStarted] = useState(false);
    const [finished, setFinished] = useState(false);

const [turns, setTurns] = useState(0);
    const [guess, setGuess] = useState("");
    const [history, setHistory] = useState([]);
const [gameHistory, setGameHistory] = useState([]);
const [selectedGame, setSelectedGame] = useState(null);
const [showHistory, setShowHistory] = useState(false);
const [mounted, setMounted] = useState(false);

    const [suggestions, setSuggestions] = useState([]);

    const [loading, setLoading] = useState(true);

useEffect(() => {

    setMounted(true);

    loadProfiles();

    const saved =
        localStorage.getItem("vivreHistory");

    if(saved){

        setGameHistory(
            JSON.parse(saved)
        );

    }

}, []);

    async function loadProfiles(){

        setLoading(true);

        const res = await fetch("/api/profile");
        const json = await res.json();

        if(json.ok){

            setProfiles(json.items);

        }

        setLoading(false);

    }

    function startGame(){

        if(profiles.length===0) return;

setTurns(0);

        const target =
            profiles[Math.floor(Math.random()*profiles.length)];

        setAnswer(target);

        setStarted(true);

        setFinished(false);

        setGuess("");

        setSuggestions([]);

        const firstList =
            profiles.filter(p=>p.name!==target.name);

        const first =
            firstList[Math.floor(Math.random()*firstList.length)];

        setHistory([
            createResult(first,target)
        ]);

    }

function saveHistory(finalHistory){

    const newData = [

        {
            id: Date.now(),

            answer: answer.name,

            turns: finalHistory.length - 1,

            date: new Date().toLocaleString(),

            history:[...finalHistory]

        },

        ...gameHistory

    ];


    setGameHistory(newData);



    localStorage.setItem(
        "vivreHistory",
        JSON.stringify(newData)
    );

}

    function resetGame(){

        setStarted(false);

        setFinished(false);

        setAnswer(null);

        setGuess("");

        setHistory([]);

        setSuggestions([]);

    }

function giveUp(){

    saveHistory(history);

    alert("答えは\n\n"+answer.name);

    resetGame();

}

function hiraToKata(str){

    return str.replace(
        /[\u3041-\u3096]/g,
        s=>String.fromCharCode(s.charCodeAt(0)+0x60)
    );

}
function onChange(e){

    const value = e.target.value;

    setGuess(value);

    if(value===""){

        setSuggestions([]);

        return;

    }

    const keyword = hiraToKata(value);

    const list = profiles
        .filter(x =>
            x.name.includes(value) ||
            x.name.includes(keyword)
        )
        .filter(x =>
            !history.some(h => h.profile.name === x.name)
        )
        .slice(0,10);

    setSuggestions(list);

}


    function choose(name){

        setGuess(name);

        setSuggestions([]);

    }

    function submit(){

        if(!started) return;

        const profile=
            profiles.find(x=>x.name===guess);

        if(!profile) return;

        if(history.some(x=>x.profile.name===profile.name))
            return;

        const result=
            createResult(profile,answer);

setTurns(prev => prev + 1);

        const newHistory=[
            ...history,
            result
        ];

        setHistory(newHistory);

        setGuess("");

        setSuggestions([]);

if(result.correct){

    saveHistory(newHistory);

    setFinished(true);

}

    }

    function judgeText(guess,answer){

        if(answer==="不明"){

            if(guess==="不明")
                return "green";

            return "gray";

        }

        if(guess==="不明")
            return "gray";

return guess===answer
    ? "green"
    : "gray";

    }

    function judgeNumber(guess,answer){

        if(answer==="不明"){

            if(guess==="不明")
                return "green";

            return "gray";

        }

        if(guess==="不明")
            return "gray";

        const g=Number(guess);

        const a=Number(answer);

        if(g===a)
            return "green";

        if(g<a)
            return "up";

        return "down";

    }

function judgeFamily(guess, answer){

    if(!answer || answer.length===0){

        if(!guess || guess.length===0)
            return "green";

        return "gray";
    }

    if(!guess || guess.length===0)
        return "gray";


    const common = guess.filter(x =>
        answer.includes(x)
    );


    // 全員一致
    if(
        common.length === answer.length &&
        common.length === guess.length
    ){
        return "green";
    }


    // 一人でも共通していれば黄色
    if(common.length > 0){
        return "yellow";
    }


    return "gray";
}

function judgeBorn(guessSea, guessPlace, answerSea, answerPlace){

    const guess = [];
    const answer = [];

    if(guessSea && guessSea !== "不明") guess.push(guessSea);
    if(guessPlace && guessPlace !== "不明") guess.push(guessPlace);

    if(answerSea && answerSea !== "不明") answer.push(answerSea);
    if(answerPlace && answerPlace !== "不明") answer.push(answerPlace);

    if(answer.length===0){

        if(guess.length===0) return "green";

        return "gray";

    }

    if(guess.length===0)
        return "gray";

    const common = guess.filter(x=>answer.includes(x));

    if(common.length===0)
        return "gray";

    if(common.length===answer.length &&
       common.length===guess.length)
        return "green";

    return "yellow";

}

    function createResult(profile,target){

        return{

            profile,

            result:{
number: judgeNumber(
    profile.number,
    target.number
),

                chapter:judgeNumber(
                    profile.chapter,
                    target.chapter
                ),

                age:judgeNumber(
                    profile.age,
                    target.age
                ),

                height:judgeNumber(
                    profile.height,
                    target.height
                ),

                blood:judgeText(
                    profile.blood,
                    target.blood
                ),

                born: judgeBorn(
    profile.bornSea,
    profile.bornPlace,
    target.bornSea,
    target.bornPlace
),

                gender:judgeText(
                    profile.gender,
                    target.gender
                ),

                family:judgeFamily(
                    profile.family,
                    target.family
                )

            },

            correct:
                profile.name===target.name

        };

    }

    function cellClass(type){

        switch(type){

            case "green":
                return "bg-green-500 text-white font-bold";

            case "yellow":
                return "bg-yellow-300 text-black font-bold";

case "white":
    return "bg-white text-black";


            case "gray":
                return "bg-gray-300 text-black";

            case "up":
                return "bg-blue-500 text-white font-bold";

            case "down":
                return "bg-red-500 text-white font-bold";

            default:
                return "bg-white";

        }

    }

    function bornText(profile){

        if(
            !profile.bornPlace ||
            profile.bornPlace==="不明"
        ){

            return profile.bornSea;

        }

        return (
            profile.bornSea+
            " / "+
            profile.bornPlace
        );

    }

function numberText(value, result) {

    const text = value === "" || value == null ? "不明" : String(value);

    if (result === "up") {
        return `${text} ↑`;
    }

    if (result === "down") {
        return `${text} ↓`;
    }

    return text;
}



    return(
        <div className="max-w-6xl mx-auto p-6">

<div className="relative mb-8">

    <h1 className="
        text-3xl
        sm:text-4xl
        font-bold
        text-center
    ">
        ビブルサーチ
    </h1>


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

</div>

            {!started ? (

                <div className="text-center mt-20">

                    <button
                        onClick={startGame}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-700 text-white text-lg px-8 py-3 rounded-xl"
                    >
                        {loading ? "読み込み中..." : "START"}
                    </button>

{mounted && (
<a
    href="/solo/vivre-history"
    className="
    mt-4
    inline-block
    bg-gray-700
    text-white
    px-8
    py-3
    rounded-xl
    "
>

    履歴を見る
</a>
)}
                </div>

            ) : (

                <>

                   <div className="
flex
gap-2
mb-4
">

<input
    value={guess}
    onChange={onChange}
    onKeyDown={(e)=>{
        if(e.key==="Enter"){
            submit();
        }
    }}
    placeholder="キャラ名を入力"
    className="
    flex-1
    border
    rounded-lg
    px-3
    py-2
    text-sm
    "
/>


<button
    onClick={submit}
    className="
    bg-blue-600
    hover:bg-blue-700
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

                    {suggestions.length>0 &&(

                        <div className="border rounded-lg shadow mb-4 bg-white">

                            {suggestions.map(s=>(

<div
    key={s.name}
    onClick={()=>choose(s.name)}
    className="
        px-4
        py-2
        cursor-pointer
        hover:bg-gray-100
        text-black
        font-medium
    "
>
                                    {s.name}
                                </div>

                            ))}

                        </div>

                    )}

                    <div className="overflow-x-auto">

{finished && (

<div
className="
mt-6
text-center
text-3xl
font-bold
text-green-600
"
>

🎉 正解！

<br/>

{history.length - 1}回で正解！

</div>

)}

                        <table className="w-full border-collapse text-center text-xs sm:text-sm">

                            <thead>

                                <tr className="bg-gray-200">

                                   <th className="border p-2 text-black font-bold">
    ナンバー
</th>

<th className="border p-2 text-black font-bold">
    名前
</th>

                                    <th className="border p-2 text-black font-bold">
                                        初登場話
                                    </th>

                                   <th className="border p-2 text-black font-bold">
                                        年齢
                                    </th>

                                    <th className="border p-2 text-black font-bold">
                                        身長
                                    </th>

                                    <th className="border p-2 text-black font-bold">
                                        血液型
                                    </th>

                                    <th className="border p-2 text-black font-bold">
                                        出身
                                    </th>

                                    <th className="border p-2 text-black font-bold">
                                        性別
                                    </th>

                                    <th className="border p-2 text-black font-bold">
                                        家族
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                {history.map((row,index)=>(
                                    <tr key={index}>

                                    <td className={`border p-1 sm:p-2 ${cellClass(row.result.number)}`}>
    {numberText(
        row.profile.number,
        row.result.number
    )}
</td>

<td
    className={`border p-2 font-semibold ${
        row.profile.name === answer.name
            ? "bg-green-500 text-white"
            : "bg-gray-200 text-black"
    }`}
>
    {row.profile.name}
</td>

                                        <td className={`border p-2 ${cellClass(row.result.chapter)}`}>
                                            {numberText(
                                                row.profile.chapter,
                                                row.result.chapter
                                            )}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.age)}`}>
                                            {numberText(
                                                row.profile.age,
                                                row.result.age
                                            )}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.height)}`}>
                                            {numberText(
                                                row.profile.height,
                                                row.result.height
                                            )}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.blood)}`}>
                                            {row.profile.blood}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.born)}`}>
                                            {bornText(row.profile)}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.gender)}`}>
                                            {row.profile.gender}
                                        </td>

                                        <td className={`border p-2 ${cellClass(row.result.family)}`}>
                                            <div className="flex flex-col leading-5">
                                                {row.profile.family.length===0
                                                    ? "なし"
                                                    : row.profile.family.map((f,i)=>(
                                                        <span key={i}>{f}</span>
                                                    ))
                                                }
                                            </div>
                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                </>

            )}


{selectedGame && (

<div className="mt-10">

<h2 className="text-3xl font-bold">

プレイ結果

</h2>


<div className="mt-4">

答え：
<b>
{selectedGame.answer}
</b>

<br/>

{selectedGame.date}

<br/>

{selectedGame.turns}回

</div>


<table className="w-full mt-6 border">

<tbody>

{selectedGame.history.map((row,i)=>(

<tr key={i}>

<td className="border p-2">

{row.profile.name}

</td>


<td className={`border p-1 sm:p-2 ${cellClass(row.result.number)}`}>

{numberText(
row.profile.number,
row.result.number
)}

</td>


<td className={`border p-2 ${cellClass(row.result.chapter)}`}>

{numberText(
row.profile.chapter,
row.result.chapter
)}

</td>


<td className={`border p-2 ${cellClass(row.result.age)}`}>

{numberText(
row.profile.age,
row.result.age
)}

</td>


</tr>

))}

</tbody>

</table>


<button
onClick={()=>setSelectedGame(null)}
className="
mt-5
bg-gray-600
text-white
px-6
py-2
rounded
"
>

戻る

</button>


</div>

)}

        </div>

    );

}


