// file: app/study/vivrecard/all/page.js

"use client";

import { Suspense } from "react";
import AllPage from "./Allpage";

export default function Page() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <AllPage />
    </Suspense>
  );
}