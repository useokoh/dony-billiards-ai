import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Splash from "@/components/splash/Splash";
import { SPLASH_GUARD_SCRIPT } from "@/components/splash/guard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "당구 AI 경기 분석",
  description: "당구 경기 영상 분석 시제품",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: 아래 스크립트가 html에 data-splash를 붙이기 때문
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* 스플래시를 이번 창에서 이미 봤으면 첫 화면이 그려지기 전에 숨긴다 */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GUARD_SCRIPT }} />
      </head>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
