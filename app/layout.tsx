import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./ui-typography.css";
import "./enterprise-layout.css";
import "./navigation-refresh.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.yelaperformance.com"),
  title: "Enterprise Performance Platform",
  description: "Governed financial and workforce performance management.",
  icons: {
    icon: [
      { url: "/brand-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand-icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/brand-icon-192.png",
    apple: "/brand-icon-180.png",
  },
  openGraph: {
    title: "Enterprise Performance",
    description: "Governed financial and workforce performance management.",
    images: [{ url: "/brand-og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Enterprise Performance",
    description: "Governed financial and workforce performance management.",
    images: ["/brand-og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="antialiased ui-scale">{children}</body>
    </html>
  );
}
