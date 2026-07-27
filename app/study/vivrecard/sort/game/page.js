// file:  app/study/vivrecard/sort/game/page.js

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";

export default function SortGamePage() {

  const [profiles,setProfiles]=useState([]);
  const [loading,setLoading]=useState(true);

  const [type,setType]=useState("height");
  const [start,setStart]=useState(1);
  const [end,setEnd]=useState(999999);
const [minValue,setMinValue]=useState(0);
const [maxValue,setMaxValue]=useState(999999);
const [showAnswer,setShowAnswer]=useState(null);


  const [question,setQuestion]=useState(null);

  const [cards,setCards]=useState([]);

  const [slots,setSlots]=useState({});
const [result,setResult]=useState(null);

  const sensors=useSensors(

    useSensor(PointerSensor,{

      activationConstraint:{
        distance:5,
      },

    })

  );

  useEffect(()=>{

    const setting=JSON.parse(

      localStorage.getItem(

        "vivreSortSetting"

      )

    );

    if(!setting){

      setLoading(false);

      return;

    }

    setType(setting.type);

    setStart(setting.start);

    setEnd(setting.end);

setMinValue(setting.minValue);
setMaxValue(setting.maxValue);

    async function load(){

      const res=

        await fetch("/api/profile");

      const data=

        await res.json();

      if(data.ok){

const list = data.items.filter(profile=>{


  // ビブルカード番号範囲
  if(
    profile.number < setting.start ||
    profile.number > setting.end
  ){
    return false;
  }


  // 身長範囲
  if(setting.type==="height"){

    return (
      Number(profile.height)>=setting.minValue &&
      Number(profile.height)<=setting.maxValue
    );

  }


  // 年齢範囲
  if(setting.type==="age"){

    return (
      Number(profile.age)>=setting.minValue &&
      Number(profile.age)<=setting.maxValue
    );

  }


  // 血液型
  return true;


});

        createQuestion(

          list,

          setting.type

        );

      }

      setLoading(false);

    }

    load();

  },[]);

function DragCard({card}){

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id:`card-${card.number}`,
  });


  const style={
    transform:transform
      ?`translate3d(${transform.x}px,${transform.y}px,0)`
      :undefined
  };


const correct =
result?.answer?.[card.number];


return(
<div
ref={setNodeRef}
style={style}
{...listeners}
{...attributes}

onClick={()=>{

if(correct===false){

setShowAnswer(card.number);

}

}}

className={`

text-white
rounded-lg
px-3
py-2
font-bold
whitespace-nowrap
cursor-pointer

${
correct===true
?
"bg-blue-500"
:
correct===false
?
"bg-red-500"
:
"bg-sky-500"
}

`}
>
      {card.name}

{
showAnswer===card.number && (

<div
className="
text-xs
bg-white
text-black
mt-2
rounded
px-2
py-1
"
>

正解：

{
type==="height" &&
`${card.height}cm`
}

{
type==="age" &&
`${card.age}`
}

{
type==="blood" &&
`${card.blood}型`
}

</div>

)
}
    </div>
  );

}

function DropSlot({value,children}){

  const {
    setNodeRef
  } = useDroppable({
    id:value,
  });


  return(
    <div
      ref={setNodeRef}
      className="
        flex-1
        min-h-[90px]
        border-2
        border-dashed
        border-gray-300
        rounded-xl
        bg-gray-50
        p-3
        flex
        gap-2
        flex-wrap
      "
    >
      {children}
    </div>
  );

}

function handleDragEnd(event){

const {
 active,
 over
}=event;


if(!over)return;


const id=
String(active.id)
.replace("card-","");


const card=
cards.find(
c=>String(c.number)===id
);


if(!card)return;


setSlots(prev=>{

const newSlots={};


// 全部の箱から削除
Object.keys(prev).forEach(key=>{

newSlots[key]=
prev[key].filter(
c=>c.number!==card.number
);

});


// 新しい箱へ追加
newSlots[over.id]=[
...newSlots[over.id],
card
];


return newSlots;

});


}
function checkAnswer(){

  let correct = 0;
  let total = 0;

  const allMode =
    question.title==="全部";


  Object.keys(slots).forEach(slot=>{

    slots[slot].forEach(card=>{

      total++;


      let value;


      if(type==="height")
        value=Number(card.height);

      if(type==="age")
        value=Number(card.age);

      if(type==="blood")
        value=card.blood;


if(String(value)===String(slot)){
  correct++;
}

    });

  });

setResult({
  correct,
  total
});

}

function checkAnswer(){

  let correct = 0;
  let total = 0;

  const answer={};


  Object.keys(slots).forEach(slot=>{

    slots[slot].forEach(card=>{

      total++;


      let value;


      if(type==="height")
        value=Number(card.height);

      if(type==="age")
        value=Number(card.age);

      if(type==="blood")
        value=card.blood;


      const isCorrect =
        String(value)===String(slot);


      if(isCorrect){
        correct++;
      }


      answer[card.number]=isCorrect;


    });

  });


  setResult({
    correct,
    total,
    answer
  });

}

function createQuestion(list,type){

  let values=[];

  if(type==="height"){

    values=[

      ...new Set(

        list

          .map(p=>Number(p.height))

          .filter(v=>!isNaN(v))

      )

    ].sort((a,b)=>a-b);

  }

  if(type==="age"){

    values=[

      ...new Set(

        list

          .map(p=>Number(p.age))

          .filter(v=>!isNaN(v))

      )

    ].sort((a,b)=>a-b);

  }

  if(type==="blood"){

    values=[

      ...new Set(

        list

          .map(p=>p.blood)

          .filter(Boolean)

      )

    ];

  }

  if(values.length===0){

    return;

  }

  let selected=[];

  let title="";

 
if(type==="height"){

  selected = values;


  if(
    values.length === 
    list.map(p=>Number(p.height))
      .filter(v=>!isNaN(v)).length
  ){

    title="全部";

  }else{

title="身長";

  }

}

if(type==="height"){

  selected = values;


  if(
    values.length === 
    list.map(p=>Number(p.height))
      .filter(v=>!isNaN(v)).length
  ){

    title="全部";

  }else{

    title=
    `${Math.min(...values)}cm〜${Math.max(...values)}cm`;

  }

}

if(type==="age"){

  selected = values;


  if(
    values.length === 
    list.map(p=>Number(p.age))
      .filter(v=>!isNaN(v)).length
  ){

    title="全部";

  }else{

    title=
    `${Math.min(...values)}〜${Math.max(...values)}`;

  }

}


  if(type==="blood"){

    selected=values;

    title="血液型";

  }

  const cardList=[];

  const slotData={};

  selected.forEach(value=>{

    slotData[value]=[];

    list.forEach(profile=>{

      let v="";

      if(type==="height")

        v=Number(profile.height);

      if(type==="age")

        v=Number(profile.age);

      if(type==="blood")

        v=profile.blood;

      if(v===value){

        cardList.push({

          ...profile,

          placed:false,

        });

      }

    });

  });

  cardList.sort(

    ()=>Math.random()-0.5

  );

  setCards(cardList);

  setSlots(slotData);

  setQuestion({

    title,

    values:selected,

  });

}

if(loading){

  return(

    <main className="min-h-screen flex items-center justify-center">

      読み込み中...

    </main>

  );

}

if(!question){

  return(

    <main className="min-h-screen flex items-center justify-center">

      データがありません

    </main>

  );

}



return(

<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
>

<main className="min-h-screen bg-rose-50 text-gray-900">

    <div className="max-w-7xl mx-auto p-6">

      <header className="flex justify-between items-center mb-8">

        <h1 className="text-3xl font-extrabold">
          📦 仕分けゲーム
        </h1>

        <Link
          href="/study/vivrecard/sort"
          className="underline"
        >
          戻る
        </Link>

      </header>

<div className="bg-white text-gray-900 rounded-3xl shadow-lg p-6">

  <div className="text-center mb-8">

    <p className="text-gray-500">
      カードを正しい場所へドラッグしてください
    </p>

    <h2 className="text-4xl font-extrabold mt-3">
      {question.title}
    </h2>

  </div>


  <div className="space-y-3">

    {question.values.map(value=>(

      <div
        key={value}
        className="flex gap-3"
      >

<div
className="
w-32
bg-rose-500
text-white
rounded-xl
flex
items-center
justify-center
font-bold
text-center
"
>

{
type==="height" &&
`${value}cm`
}

{
type==="age" &&
`${value}`
}

{
type==="blood" &&
`${value}型`
}

</div>

<DropSlot value={value}>

{
slots[value]?.map(card=>(

<DragCard
  key={card.number}
  card={card}
/>

))
}

</DropSlot>

      </div>

    ))}

  </div>

</div>

<div className="mt-8 bg-white text-gray-900 rounded-3xl shadow-lg p-6">

<h2 className="font-bold text-xl mb-4">
カード一覧
</h2>

<button
onClick={checkAnswer}
className="
mt-8
w-full
bg-green-500
text-white
py-4
rounded-2xl
text-xl
font-bold
"
>
採点する
</button>

{
result && (

<div className="
mt-4
text-center
text-xl
font-bold
">

結果：
{result.correct} / {result.total}

</div>

)
}

<div className="
flex
gap-3
overflow-x-auto
w-full
pb-3
pt-2
whitespace-nowrap
">

{
cards
.filter(card=>{

  return !Object.values(slots)
    .flat()
    .some(
      c=>c.number===card.number
    );

})
.map(card=>(
<DragCard
key={`${card.number}-${card.name}`}
card={card}
/>

))
}

</div>

</div>


    </div>

  </main>

</DndContext>

);

}
