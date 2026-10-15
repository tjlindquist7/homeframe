import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "HomeFrame — Home & Commute Dashboard",
  description: "A glanceable transit, traffic, weather, and family events dashboard for a Raspberry Pi display.",
  openGraph: {
    title: "HomeFrame",
    description: "Transit, traffic, weather & what's next",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "HomeFrame dashboard preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HomeFrame",
    description: "Transit, traffic, weather & what's next",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geist.variable}>{children}</body></html>;
}
