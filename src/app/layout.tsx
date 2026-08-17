import type { Metadata, Viewport } from "next";
import { appConfig } from "@/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.name,
  description: appConfig.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={appConfig.defaultLocale} suppressHydrationWarning>
      <head>
        {/* 設定で動きを無効化した場合のみ、初期描画前に反映する */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('ac_motion')==='off'){document.documentElement.dataset.motion='off'}}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
