"use client";

import { useEffect, useState } from "react";

export default function VivreHistory(){

const [history,setHistory]=useState([]);
const [mounted,setMounted] = useState(false);

const [selectedGame,setSelectedGame] = useState(null);


useEffect(()=>{

    setMounted(true);

    const saved =
        localStorage.getItem("vivreHistory");

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
ビブルサーチ 履歴
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
    selectedGame?.id === game.id
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
</p>


<p className="text-gray-500">
{game.date}
</p>


</div>



{
selectedGame?.id === game.id && (

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

<h2 className="text-3xl font-bold mb-4">
🎉 プレイ結果
</h2>


<p className="text-2xl font-bold text-green-600">
答え：{selectedGame.answer}
</p>


<p>
{selectedGame.turns}回で正解
</p>


<p className="text-gray-500">
{selectedGame.date}
</p>



<table className="
w-full
border-collapse
text-center
mt-6
">


<thead>

<tr className="bg-gray-200">

<th className="border p-2">ナンバー</th>
<th className="border p-2">名前</th>
<th className="border p-2">初登場話</th>
<th className="border p-2">年齢</th>
<th className="border p-2">身長</th>
<th className="border p-2">血液型</th>
<th className="border p-2">出身</th>
<th className="border p-2">性別</th>
<th className="border p-2">家族</th>

</tr>

</thead>


<tbody>


{selectedGame.history.map((row,i)=>(


<tr key={i}>


<td className={`border p-2 ${cellClass(row.result.number)}`}>

{numberText(
row.profile.number,
row.result.number
)}

</td>



<td
className={`
border
p-2
font-bold
${
row.profile.name===selectedGame.answer
?
"bg-green-500 text-white"
:
"bg-gray-200 text-black"
}
`}
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

{row.profile.bornSea}

{row.profile.bornPlace &&
` / ${row.profile.bornPlace}`}

</td>



<td className={`border p-2 ${cellClass(row.result.gender)}`}>

{row.profile.gender}

</td>



<td className={`border p-2 ${cellClass(row.result.family)}`}>

{
row.profile.family.length===0
?
"なし"
:
row.profile.family.map((f,j)=>(

<div key={j}>
{f}
</div>

))
}

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

