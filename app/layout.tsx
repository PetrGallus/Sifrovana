import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Šifrovaná — Město je šifra",
    description: "Mobilní městská hra, která spojuje chůzi, šifry a příběhy českých měst.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Šifrovaná — Město je šifra",
      description: "Vyraz pěšky, rozlušti příběhy ukryté v ulicích a objev Brno jinak.",
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Šifrovaná — městská hra v Brně" }],
    },
    twitter: { card: "summary_large_image", title: "Šifrovaná — Město je šifra", description: "Městská expedice plná šifer a příběhů.", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
