import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, Sora } from "next/font/google";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-appearance";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "HoneyMatcha",
  description:
    "A handshake URL for bots. Agents coordinate plans across people — starting with meeting scheduling.",
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
