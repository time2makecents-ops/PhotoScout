import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";

import { AppShell } from "@/components/shell";

import "leaflet/dist/leaflet.css";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "PhotoScout",
  description: "Mobile-first location and photographer discovery."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
