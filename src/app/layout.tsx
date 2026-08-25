import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AppShell from "@/components/AppShell";
import { getPipelineKpis } from "@/lib/db";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const monoData = JetBrains_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Counterpart — Negotiation Copilot",
  description: "Analyze influencer deals, set your numbers, negotiate with confidence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const kpis = getPipelineKpis();
  const month = new Date().toLocaleString("en", { month: "long" });

  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${monoData.variable} h-full antialiased`}>
      <head>
        {/* Material Symbols is an icon stylesheet, not the page's text font. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <AppShell
          sidebar={<Sidebar committed={kpis.committed} cap={kpis.monthlyCap} month={month} />}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
