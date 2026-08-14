import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PortfolioStrip } from "@/components/PortfolioStrip";
import { Providers } from "@/components/Providers";
import { APP_LOGO, APP_NAME, APP_ORIGIN, APP_TAGLINE } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  icons: { icon: APP_LOGO, apple: APP_LOGO },
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    url: APP_ORIGIN,
    siteName: APP_NAME,
    images: [{ url: APP_LOGO, width: 512, height: 512, alt: APP_NAME }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: APP_NAME,
    description: APP_TAGLINE,
    images: [APP_LOGO],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans text-[var(--foreground)] antialiased">
        <Providers>
          <Header />
          <PortfolioStrip />
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
