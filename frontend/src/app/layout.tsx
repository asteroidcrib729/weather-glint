import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Apply the saved preference before first paint; the provider keeps it in sync afterward.
const themeBootstrap = `(()=>{let p="device";try{const r=JSON.parse(localStorage.getItem("weather-glint-theme")||"null");if(r&&(r.value==="light"||r.value==="dark")&&typeof r.savedAt==="number"&&r.savedAt<=Date.now()&&Date.now()-r.savedAt<15552000000)p=r.value}catch{}document.documentElement.dataset.theme=p==="device"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p})()`;

export const metadata: Metadata = {
  title: "Weather Glint - Weather, clearly",
  description: "A clear view of current conditions and the week ahead.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto dark:scheme-dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className="min-h-screen bg-[#f5faf9] font-[Arial,Helvetica,sans-serif] antialiased dark:bg-[#0c1720]"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
