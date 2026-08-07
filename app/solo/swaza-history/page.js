"use client";

import { useEffect, useState } from "react";

export default function SwazaHistory(){

const [history,setHistory]=useState([]);
const [mounted,setMounted] = useState(false);

const [selectedGame,setSelectedGame] = useState(null);


useEffect(()=>{

    setMounted(true);

const saved =
 localStorage.getItem("swazaHistory");

    if(saved){
        setHistory(JSON.parse(saved));
    }

},[]);

function cellClass(type){

    switch(type){

        case "green":
            return "bg-green-500 text-white font-bold";

        case "yellow":
            return "bg-yellow-300 text-black font-bold";

        case "gray":
            return "bg-gray-300 text-black";

        case "up":
            return "bg-blue-500 text-white font-bold";

        case "down":
            return "bg-red-500 text-white font-bold";

       default:
    return "bg-white text-black";

    }

}

function formatTime(sec){
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${String(s).padStart(2,"0")}秒`;
}

function numberText(value,result){

    const text =
        value === "" || value == null
        ? "不明"
        : String(value);


    if(result==="up"){
        return `${text} ↑`;
    }

    if(result==="down"){
        return `${text} ↓`;
    }

    return text;

}



    return(

<div className="max-w-4xl mx-auto p-6">

<h1 className="text-4xl font-bold mb-8">
技サーチ 履歴
</h1>


{!mounted ? (

<p>
読み込み中...
</p>

) : history.length===0 ? (

<p>
まだ履歴がありません
</p>

):(


history.map((game,index)=>(

<div key={index}>


<div
onClick={()=>setSelectedGame(
    selectedGame === game
    ? null
    : game
)}
className="
border
rounded-xl
p-5
mb-4
cursor-pointer
hover:bg-gray-100
"
>


<h2 className="text-xl font-bold">
答え：
{game.answer}
</h2>


<p>
{game.turns}回で正解
　⏱ {formatTime(game.time)}

</p>


<p className="text-gray-500">
{game.date}
</p>


</div>



{
selectedGame === game && (

<div className="
border
rounded-xl
p-5
mb-4
bg-gray-50
text-black
">
{selectedGame && (

<div className="mt-10">

<h2 className="text-2xl sm:text-3xl font-bold mb-4">
🎉 プレイ結果
</h2>

<p className="text-lg sm:text-2xl font-bold text-green-600">
答え：{selectedGame.answer}
</p>


<p>
{game.turns}回で正解
　⏱ {formatTime(game.time)}
</p>


<p className="text-gray-500">
{selectedGame.date}
</p>



<table
className="
w-full
border-collapse
text-center
text-xs sm:text-sm
mt-6
">


<thead>

<tr className="bg-gray-200">

<th className="border p-1 sm:p-2 text-black font-bold">
誰が
</th>

<th className="border p-1 sm:p-2 text-black font-bold">
誰に
</th>

<th className="border p-1 sm:p-2 text-black font-bold">
話数
</th>

<th className="border p-1 sm:p-2 text-black font-bold">
技名
</th>

<th className="border p-1 sm:p-2 text-black font-bold">
使った場所
</th>

</tr>

</thead>
<tbody>

{selectedGame.history.map((row,i)=>(

<tr key={i}>

<td className={`border p-1 sm:p-2 ${cellClass(row.result.user)}`}>
{row.move.user}
</td>


<td className={`border p-1 sm:p-2 ${cellClass(row.result.target)}`}>
{row.move.target}
</td>


<td className={`border p-1 sm:p-2 ${cellClass(row.result.chapter)}`}>
{numberText(row.move.chapter,row.result.chapter)}
</td>


<td className={`border p-1 sm:p-2 font-bold ${cellClass(row.result.technique)}`}>
{row.move.technique}
</td>


<td className={`border p-1 sm:p-2 ${cellClass(row.result.location)}`}>
{row.move.location}
</td>

</tr>

))}

</tbody>

</table>


<button
onClick={()=>setSelectedGame(null)}
className="
mt-6
bg-gray-600
text-white
px-6
py-3
rounded
"
>

一覧へ戻る

</button>


</div>

)}


</div>

)

}


</div>

))

)}

</div>

);

}

