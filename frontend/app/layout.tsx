import type { Metadata } from "next";
import { Suspense } from "react";
import { Instrument_Serif, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Grant rounds with an open rubric. Community funds, public proposals, and funding decisions re-evaluated independently by GenLayer AI validators.",
  applicationName: APP_NAME,
  keywords: [
    "GenLayer",
    "AI governance",
    "grants",
    "public goods",
    "intelligent contract",
    "rubric",
  ],
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      "Community funds, open criteria, auditable decisions. Grant rounds with AI adjudication on GenLayer.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      "Community funds, open criteria, auditable decisions. Grant rounds with AI adjudication on GenLayer.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${instrument.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeader />
          </Suspense>
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
