import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { isDemoMode } from "@/lib/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Project23 — Discover events in Osun and across Nigeria", template: "%s · Project23" },
  description: "Find concerts, nightlife, comedy, campus events, workshops and conferences in Osogbo, Ile-Ife, Ilesa, Ede and beyond. Buy tickets securely in naira.",
  applicationName: "Project23",
  openGraph: { type: "website", siteName: "Project23", locale: "en_NG" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#0b0b0d", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  return (
    <html lang="en-NG" className={`${inter.variable} ${bricolage.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">Skip to content</a>
        {demo && (
          <div role="note" className="no-print bg-warning px-4 py-1.5 text-center text-xs font-semibold text-black">
            Demo mode — test payments and captured emails. No real money moves and no real emails are sent.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
