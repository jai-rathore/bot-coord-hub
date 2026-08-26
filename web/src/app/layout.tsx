import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, Sora } from "next/font/google";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-appearance";
import "./globals.css";

/*
 * Explicit weights, and measured rather than assumed. Dropping them to use the
 * variable files looks like the obvious win, but next/font preloads three files
 * either way and the variable versions carry the whole weight axis: 116KB
 * preloaded against 107KB for the static instances. `display` is pinned to the
 * current default so a future change to it cannot regress this silently.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const siteUrl = "https://honeymatcha.io";
const siteTitle = "HoneyMatcha";
const siteDescription =
  "Let candidate and recruiter agents align on the company, role, compensation, equity, and work expectations before asking either person for a call.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: {
    types: {
      "application/json": "/.well-known/honeymatcha.json",
      "text/plain": "/llms.txt",
    },
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: siteTitle,
    type: "website",
    images: [
      {
        url: "/og-agent-choice-v2.png",
        width: 1200,
        height: 630,
        alt: "HoneyMatcha. Use Sage or bring your own agent to coordinate with other people's agents.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-agent-choice-v2.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/logo-mark.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/**
 * Mobile is the primary surface, so the viewport is pinned rather than left to
 * the browser. `minimumScale: 1` is the important one: without it Safari lets a
 * pinch settle below 100% and every later navigation keeps that scale, which is
 * why switching tabs could land you on a shrunken page with no easy way back.
 * Zooming *in* stays available (up to 5x). Only zooming out past the device
 * width is refused, so the page always snaps back to its natural size.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#f7f9f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ClerkProvider
          appearance={clerkAppearance}
          localization={clerkLocalization}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
