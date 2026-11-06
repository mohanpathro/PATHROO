import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Characterful display face for headings — real type contrast against Geist body.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const notoDeva = Noto_Sans_Devanagari({
  variable: "--font-noto",
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PATHROO — Find Your Path. Unlock Your Future.",
    template: "%s · PATHROO",
  },
  description:
    "PATHROO helps you discover opportunities, qualify your matches, prepare your applications, and achieve your goals.",
  applicationName: "PATHROO",
  icons: {
    icon: "/pathroo-favicon.svg",
    apple: "/pathroo-app-icon.svg",
  },
  keywords: ["internships", "scholarships", "hackathons", "competitions", "students", "India", "deadline reminders"],
};

export const viewport: Viewport = {
  themeColor: "#f7f5ff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${bricolage.variable} ${notoDeva.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-base text-ink font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
