import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-brand-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-brand-mono" });

export const metadata: Metadata = {
  title: {
    default: "ArcSet — programmable money strategies",
    template: "%s — ArcSet",
  },
  description: "Transparent, user-controlled baskets built for Arc Testnet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
