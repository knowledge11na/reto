// file: app/study/vivrecard/all/page.js

"use client";

import { Suspense } from "react";
import AllPage from "./AllPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8">読み込み中...</div>}>
      <AllPage />
    </Suspense>
  );
}