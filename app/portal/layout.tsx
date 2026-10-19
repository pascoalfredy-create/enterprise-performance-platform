import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Portal do Colaborador",
  manifest: "/portal-manifest.json",
  icons: { icon: "/brand-icon-192.png", apple: "/brand-icon-180.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Portal" },
};

export const viewport: Viewport = {
  themeColor: "#084c43",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
