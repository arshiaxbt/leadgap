import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Providers } from "@/components/Providers";
import { StatusStrip } from "@/components/StatusStrip";
import { Toaster } from "@/components/ui/sonner";
import { APP_LOGO_RASTER, APP_NAME, APP_ORIGIN, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  icons: { icon: [{ url: APP_LOGO_RASTER, type: "image/png" }], apple: APP_LOGO_RASTER },
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
    <html
      lang="en"
      className={cn("dark h-full", GeistSans.variable, GeistMono.variable)}
    >
      <body className="flex h-full min-h-full flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
        <Providers>
          <Header />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          <StatusStrip />
          <MobileTabBar />
          <Toaster />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
