import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Inter, Inter_Tight, Playfair_Display } from "next/font/google";
import { isDemoMode } from "@/lib/env";
import "./globals.css";

// Inter / Inter Tight stand in for the reference's Neue Haas Grotesk Text / Display.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500"],
});
// Display faces used only by generated placeholder flyers (real events upload artwork).
const anton = Anton({
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
  weight: "400",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  style: ["italic"],
  weight: ["600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Project23 — Discover events in Osun and across Nigeria",
    template: "%s · Project23",
  },
  description:
    "Find concerts, nightlife, comedy, campus events, workshops and conferences in Osogbo, Ile-Ife, Ilesa, Ede and beyond. Buy tickets securely in naira.",
  applicationName: "Project23",
  openGraph: { type: "website", siteName: "Project23", locale: "en_NG" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  return (
    <html
      lang="en-NG"
      className={`${inter.variable} ${interTight.variable} ${plexMono.variable} ${anton.variable} ${playfair.variable}`}
    >
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {demo && (
          <div
            role="note"
            className="no-print border-b border-white/[0.06] bg-[#111113] px-4 py-1.5 text-center text-[11px] text-fg-muted"
          >
            <span
              className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
              aria-hidden
            />
            Demo mode · test payments and captured emails — no real money moves
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
