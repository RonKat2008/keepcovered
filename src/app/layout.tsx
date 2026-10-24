import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight } from "next/font/google";
import { LangSync } from "@/components/lang/LangSync";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "opsz"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KeepCovered",
  description:
    "Turn your Uber, Lyft, DoorDash and Instacart screenshots into month-by-month proof for the Medi-Cal work rule.",
};

export const viewport: Viewport = {
  themeColor: "#efeadf",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${interTight.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LangSync />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
