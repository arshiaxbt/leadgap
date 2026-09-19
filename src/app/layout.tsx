import { ReferralAnalytics } from "@/components/ReferralAnalytics";

import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AlertWatcher } from "@/components/AlertWatcher";
import { Header } from "@/components/Header";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Providers } from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";
import {
  APP_LOGO,
  APP_LOGO_RASTER,
  APP_NAME,
  APP_ORIGIN,
  APP_TAGLINE,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  icons: {
    icon: [
      { url: APP_LOGO, type: "image/svg+xml" },
      { url: APP_LOGO_RASTER, type: "image/png" },
    ],
    apple: APP_LOGO_RASTER,
  },
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

export const viewport: Viewport = {
  themeColor: "#0e0e0c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("dark h-full", sans.variable, serif.variable, mono.variable)}
    >
      <body className="flex h-full min-h-full flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
        <Providers>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <Header />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
          >
            {children}
          </main>
          <MobileTabBar />
          <AlertWatcher />
          <Toaster />
        </Providers>
        <ReferralAnalytics />
      </body>
    </html>
  );
}
