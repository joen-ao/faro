import { Cal_Sans, Inter } from "next/font/google";
import { MetaPixel } from "@/components/tracking/meta-pixel";

// F51 · Mokub's type (mokub.co): Cal Sans for headings, Inter for text. Scoped to the diagnostic pages.
const calSans = Cal_Sans({ subsets: ["latin"], weight: "400", variable: "--font-calsans", display: "swap", adjustFontFallback: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function DiagnosticLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${calSans.variable} ${inter.variable}`}>
      {children}
      <MetaPixel />
    </div>
  );
}
