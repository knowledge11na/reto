// file: app/admin/layout.js
export const metadata = {
  title: 'ナレバト 管理者ページ',
};

export default async function AdminLayout({ children }) {
  // サイドバーで未対応件数を出したいので stats を取得
  // 失敗しても壊れないようにする
  let stats = null;
  try {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';

    const res = await fetch(`${base}/api/admin/users?mode=stats`, {
      cache: 'no-store',
      // 管理者セッションを渡すために cookie が必要だが、
      // layout では request headers が取れない構成もあるので「まずは表示だけ」。
      // ※もし数字が常に '--' なら、下のコメントの対応をする（後述）
    });

    if (res.ok) stats = await res.json().catch(() => null);
  } catch (e) {
    stats = null;
  }

  const openReports = stats?.openReports;
  const openSuggestions = stats?.openSuggestions;

  const Badge = ({ value }) => {
    const n = typeof value === 'number' ? value : null;
    if (!n || n <= 0) return null;
    return (
      <span className="min-w-[26px] h-[18px] px-2 rounded-full bg-rose-600 text-[11px] font-extrabold text-white flex items-center justify-center">
        {n > 99 ? '99+' : n}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row">
        {/* サイドバー */}
        <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-700 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-sky-400 rounded-full" />
            <div>
              <div className="text-lg font-bold">ナレバト</div>
              <div className="text-xs text-slate-400">管理コンソール</div>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            <a href="/admin" className="block px-3 py-2 rounded hover:bg-slate-800">
              ダッシュボード
            </a>

            <a
              href="/admin/questions"
              className="block px-3 py-2 rounded hover:bg-slate-800"
            >
              問題一覧・承認
            </a>

            <a
              href="/admin/reports"
              className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-800"
            >
              <span>不備報告</span>
              <Badge value={openReports} />
            </a>

            {/* ★ 追加：目安箱 */}
            <a
              href="/admin/suggestions"
              className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-800"
            >
              <span>目安箱</span>
              <Badge value={openSuggestions} />
            </a>

            <a href="/admin/users" className="block px-3 py-2 rounded hover:bg-slate-800">
              ユーザー＆ランキング
            </a>

<a  href="/admin/quotes"
  className="block px-3 py-2 rounded hover:bg-slate-800">

  セリフ管理
</a>


            <a href="/admin/endless" className="block px-3 py-2 rounded hover:bg-slate-800">
              エンドレスモード
            </a>
          </nav>

          <div className="text-xs text-slate-500 pt-4 border-t border-slate-800">
            <a href="/" className="underline">
              一般ユーザー画面へ戻る
            </a>
          </div>
        </aside>

        {/* メイン */}
        <main className="flex-1 bg-slate-950/60 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
