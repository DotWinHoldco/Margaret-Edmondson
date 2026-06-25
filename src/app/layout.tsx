import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3, Caveat, Playfair_Display, Nunito, DM_Serif_Display, Lora, Dancing_Script } from "next/font/google";
import { getSiteSettings } from "@/lib/settings/accessor";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-source-sans",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-playfair",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-nunito",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-serif",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

const dancingScript = Dancing_Script({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dancing-script",
  display: "swap",
});

const FALLBACK_TITLE = "ArtByMe — Mixed Media & Fine Art by Margaret Edmondson";
const FALLBACK_DESCRIPTION =
  "Original mixed-media collage art, oil paintings, fine art prints, and art classes by Margaret Edmondson. Commission custom artwork or shop the gallery.";
const FALLBACK_OG_IMAGE = "/ME-Share-Image.jpg";

export async function generateMetadata(): Promise<Metadata> {
  // SEO defaults come from site settings; any failure falls back to the
  // previous hardcoded values.
  let seoTitle: string | null = null;
  let seoDescription: string | null = null;
  let ogImageUrl: string | null = null;
  try {
    const settings = await getSiteSettings();
    seoTitle = settings.seo_title;
    seoDescription = settings.seo_description;
    ogImageUrl = settings.og_image_url;
  } catch {
    // settings unavailable — use the hardcoded fallbacks
  }

  const title = seoTitle || FALLBACK_TITLE;
  const description = seoDescription || FALLBACK_DESCRIPTION;
  const ogImage = ogImageUrl || FALLBACK_OG_IMAGE;

  return {
    title: {
      default: title,
      template: "%s | ArtByMe",
    },
    description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://artbyme.studio"),
    icons: {
      icon: "/favicon.png",
      apple: "/favicon.png",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "ArtByME",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${sourceSans.variable} ${caveat.variable} ${playfair.variable} ${nunito.variable} ${dmSerif.variable} ${lora.variable} ${dancingScript.variable}`}
    >
      <body className="min-h-screen bg-cream text-charcoal antialiased">
        {children}
      </body>
    </html>
  );
}
