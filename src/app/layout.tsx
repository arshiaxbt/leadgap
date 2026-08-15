import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { APP_LOGO, APP_NAME, APP_ORIGIN, APP_TAGLINE } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
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
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="flex h-full min-h-full flex-col font-sans text-[var(--foreground)] antialiased">
        <Providers>
          <Header />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
