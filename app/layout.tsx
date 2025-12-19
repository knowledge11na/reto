// file: app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import RouteRipple from "@/components/RouteRipple";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ナレバト",
  description: "ナレバト（PWA）",

  applicationName: "ナレバト",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ナレバト",
  },

  formatDetection: {
    telephone: false,
  },
};

// ✅ Next.js 16 推奨：themeColor は viewport に移す
export const viewport: Viewport = {
  themeColor: "#3BA9FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
