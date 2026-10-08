import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PQTABS — An agent can spend. It cannot reach your treasury.",
  description:
    "PQTABS lets an agent spend real USDC without giving that agent control of the treasury. A post-quantum root opens a small capability. That capability is the only balance the agent can reach. If a paid request fits, the agent pays. If it does not, nothing is signed and nothing is sent.",
  keywords: [
    "PQTABS",
    "post-quantum",
    "agent payments",
    "spending policy",
    "Arc",
    "Barkeep",
    "USDC",
    "SLH-DSA",
  ],
  authors: [{ name: "PQTABS" }],
  openGraph: {
    title: "PQTABS — Give agents spending power. Never your treasury.",
    description:
      "Post-quantum secured spending boundaries for autonomous agents. Every capability constrained by programmable policy.",
    siteName: "PQTABS",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "font-sans" }} />
      </body>
    </html>
  );
}
