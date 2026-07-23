// file: app/api/profile/route.js

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "profile.xlsx");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          ok: false,
          error: "profile.xlsx が見つかりません",
        },
        { status: 404 }
      );
    }

    console.log("Path:", filePath);
console.log("Exists:", fs.existsSync(filePath));

const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 1行目をヘッダーとして取得
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    const items = [];

    // 2行目以降
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];

      if (!r[1]) continue;

      items.push({
        number: Number(r[0]),
        name: String(r[1]).trim(),

        chapter:
          r[2] === "" ? "不明" : String(r[2]).trim(),

        age:
          r[3] === "" ? "不明" : String(r[3]).trim(),

        height:
          r[4] === "" ? "不明" : String(r[4]).trim(),

        blood:
          r[5] === "" ? "不明" : String(r[5]).trim(),

        bornSea:
          r[6] === "" ? "不明" : String(r[6]).trim(),

        bornPlace:
          r[7] === "" ? "不明" : String(r[7]).trim(),

        gender:
          r[8] === "" ? "不明" : String(r[8]).trim(),

        family: [
          r[9],
          r[10],
          r[11],
          r[12],
          r[13],
          r[14],
          r[15],
          r[16],
        ]
          .map((v) => String(v).trim())
          .filter((v) => v && v !== "不明"),
      });
    }

    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
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