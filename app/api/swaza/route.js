import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "data",
      "Swaza.xlsx"
    );

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Swaza.xlsx が見つかりません",
        },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(filePath);

    const workbook = XLSX.read(buffer, {
      type: "buffer",
    });

    const sheet =
      workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    // =====================================================
    // まずExcelのデータを読み込む
    // =====================================================

    const rawItems = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];

      // E列「技名」がない行は無視
      if (
        r[4] === "" ||
        r[4] == null
      ) {
        continue;
      }

      rawItems.push({
        id: i,

        // A列
        user:
          r[0] === "" || r[0] == null
            ? "不明"
            : String(r[0]).trim(),

        // B列
        target:
          r[1] === "" || r[1] == null
            ? "不明"
            : String(r[1]).trim(),

        // C列
        chapter:
          r[2] === "" || r[2] == null
            ? "不明"
            : String(r[2]).trim(),

        // E列 ← 技名
        technique:
          String(r[4]).trim(),

        // H列
        location:
          r[7] === "" || r[7] == null
            ? "不明"
            : String(r[7]).trim(),
      });
    }

    // =====================================================
    // 同じ
    // 「技名 + 誰が + 誰に + 話数」
    // は1つにまとめる
    //
    // 例：
    //
    // ルフィ / ゾロ / 100 / ゴムゴムの銃
    // ルフィ / ゾロ / 100 / ゴムゴムの銃
    //
    // ↓
    //
    // 1件
    // =====================================================

    const uniqueItems = [];
    const uniqueKeys = new Set();

    for (const item of rawItems) {
      const key = [
        item.technique,
        item.user,
        item.target,
        item.chapter,
      ].join("|||");

      if (uniqueKeys.has(key)) {
        continue;
      }

      uniqueKeys.add(key);

      uniqueItems.push({
        ...item,
      });
    }

    // =====================================================
    // 技名ごとにまとめる
    // =====================================================

    const grouped = new Map();

    for (const item of uniqueItems) {
      if (!grouped.has(item.technique)) {
        grouped.set(item.technique, []);
      }

      grouped
        .get(item.technique)
        .push(item);
    }

    // =====================================================
    // 表示用の技名を作る
    // =====================================================

    const items = [];

    for (const [technique, list] of grouped) {

      // -----------------------------------------------
      // その技がExcel上で1事例しかない
      //
      // → 「ゴムゴムの銃」
      // -----------------------------------------------

      if (list.length === 1) {
        const item = list[0];

        items.push({
          ...item,

          displayName:
            technique,

          techniqueKey:
            technique + "|||1",
        });

        continue;
      }

      // -----------------------------------------------
      // 同じ技が複数事例ある
      //
      // Excelに出てきた順番を維持
      // -----------------------------------------------

      /*
       * 同じ話数の中で何件あるかを数える
       */
      const chapterCounts = new Map();

      for (const item of list) {
        const count =
          chapterCounts.get(
            item.chapter
          ) || 0;

        chapterCounts.set(
          item.chapter,
          count + 1
        );
      }

      /*
       * 各話数で何番目か
       */
      const chapterIndexes = new Map();

      for (const item of list) {

        const count =
          chapterCounts.get(
            item.chapter
          );

        const current =
          (chapterIndexes.get(
            item.chapter
          ) || 0) + 1;

        chapterIndexes.set(
          item.chapter,
          current
        );

        let displayName;

        // ---------------------------------------------
        // 同じ技が複数あるので話数を表示
        //
        // 同じ話に複数事例がある場合だけ①②
        // ---------------------------------------------

        if (count === 1) {
          displayName =
            `${technique}（${item.chapter}話）`;
        } else {
          displayName =
            `${technique}（${item.chapter}話${toCircleNumber(current)}）`;
        }

        items.push({
          ...item,

          displayName,

          /*
           * 実際の技名とは別に、
           * この「使用事例」を識別するキー
           */
          techniqueKey:
            technique +
            "|||" +
            item.chapter +
            "|||" +
            current +
            "|||" +
            item.user +
            "|||" +
            item.target,
        });
      }
    }

    // =====================================================
    // プルダウン候補
    // =====================================================

    const techniques =
      items.map(
        (item) =>
          item.displayName
      );

    return NextResponse.json({
      ok: true,

      // Excel上の重複を除いた使用事例数
      count: items.length,

      // ゲームで使用するデータ
      items,

      // プルダウン用
      techniques,
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        ok: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}


// =======================================================
// ① → ② → ③
// =======================================================

function toCircleNumber(num) {

  const circles = [
    "",
    "①",
    "②",
    "③",
    "④",
    "⑤",
    "⑥",
    "⑦",
    "⑧",
    "⑨",
    "⑩",
    "⑪",
    "⑫",
    "⑬",
    "⑭",
    "⑮",
    "⑯",
    "⑰",
    "⑱",
    "⑲",
    "⑳",
  ];

  return (
    circles[num] ||
    `(${num})`
  );
}