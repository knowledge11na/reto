// file: app/titles/owned/page.js
'use client';

import Link from 'next/link';

export default function TitlesOwnedPage() {
  // このページは直接使わないダミーページ
  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center text-sky-900">
      <h1 className="text-xl font-bold mb-4">このページは利用されていません</h1>
      <p className="mb-6 text-sm">
        エンブレムの一覧は
        <span className="font-bold">「称号・エンブレム一覧」</span>
        ページから確認してください。
      </p>
      <Link href="/titles" className="text-sky-700 underline text-sm">
        称号・エンブレム一覧へ戻る
      </Link>
    </div>
  );
}
