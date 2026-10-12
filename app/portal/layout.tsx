import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Portal do Colaborador",
  manifest: "/portal-manifest.json",
  icons: { icon: "/portal-icon.svg", apple: "/portal-icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Portal" },
};

export const viewport: Viewport = {
  themeColor: "#11182b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
