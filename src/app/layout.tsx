import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { PortfolioStrip } from "@/components/PortfolioStrip";
import { Providers } from "@/components/Providers";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-[#0b0d10] font-sans text-zinc-200 antialiased">
        <Providers>
          <Header />
          <PortfolioStrip />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
