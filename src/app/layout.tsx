import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import { APP_LOGO, APP_LOGO_RASTER, APP_NAME, APP_ORIGIN, APP_TAGLINE } from "@/lib/brand";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  icons: { icon: [{ url: APP_LOGO, type: "image/svg+xml" }], apple: APP_LOGO_RASTER },
  openGraph: {
    title: APP_NAME,
    description: APP_TAGLINE,
    url: APP_ORIGIN,
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_TAGLINE,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable} ${newsreader.variable} h-full`}>
      <body className="flex h-full min-h-full flex-col overflow-hidden font-sans text-[var(--foreground)] antialiased">
        <Providers>
          <Header />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          <Footer />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
