import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jargonaut — Understand what you're signing",
  description:
    "Paste a lease, eviction notice, parking ticket, or any legal document and get a plain-English breakdown: summary, key terms, deadlines, red flags, and next steps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased min-h-screen flex flex-col text-slate-800">
        {children}
      </body>
    </html>
  );
}
