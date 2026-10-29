import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "through — Past the login. Back to work.",
  description: "Your agent signs in with your connected accounts, then gets back to work in the same browser. Explore the through interactive demo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: `(function(){var theme;try{theme=localStorage.getItem('through.theme')}catch(e){}if(theme!=='light'&&theme!=='dark'){theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=theme})()` }} /></head>
    <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
  </html>;
}
