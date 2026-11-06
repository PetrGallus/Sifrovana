import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const fallbackSiteUrl = "https://sifrovana-mestska-hra.galluspeginpetr.chatgpt.site";

function resolveSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) return new URL(fallbackSiteUrl);

  try {
    const siteUrl = new URL(configuredUrl);
    if (siteUrl.protocol === "https:" || siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1") {
      return siteUrl;
    }
  } catch {
    // A malformed build-time value must not make metadata generation fail.
  }

  return new URL(fallbackSiteUrl);
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#073f3a",
};

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: "Šifrovaná — Město je šifra",
  description: "Mobilní městská hra, která spojuje chůzi, šifry a příběhy českých měst.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Šifrovaná — Město je šifra",
    description: "Vyraz pěšky, rozlušti příběhy ukryté v ulicích a objev Brno jinak.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Šifrovaná — městská hra v Brně" }],
  },
  twitter: { card: "summary_large_image", title: "Šifrovaná — Město je šifra", description: "Městská expedice plná šifer a příběhů.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
