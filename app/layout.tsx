import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./ui-typography.css";
import "./enterprise-layout.css";
import "./visual-refresh.css";

export const metadata: Metadata = {
  title: "Enterprise Performance Platform",
  description: "Governed financial and workforce performance management.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
