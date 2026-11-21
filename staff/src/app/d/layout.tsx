import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MERA 기록",
  description: "식단 · 걸음 · 수면 기록",
  appleWebApp: { capable: true, title: "MERA 기록", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

export default function CareLayout({ children }: { children: React.ReactNode }) { return children; }
