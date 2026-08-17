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
        {/* アニメーション設定（標準/最小/OFF）を初期描画前に反映する */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem('ac_motion');if(m==='off'||m==='minimal'){document.documentElement.dataset.motion=m}}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
