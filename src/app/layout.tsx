import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { getPipelineKpis } from "@/lib/db";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
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
    <html lang="en" className={`${geist.variable} ${inter.variable} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <Sidebar committed={kpis.committed} cap={kpis.monthlyCap} month={month} />
        <div className="ml-64 flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
          {children}
        </div>
      </body>
    </html>
  );
}
