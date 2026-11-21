import type { Metadata } from "next";
import "./tokens.css";
import "./v3.css";

export const metadata: Metadata = { title: "MERA 직원", description: "MERA 직원앱" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
