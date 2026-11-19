import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RootShell } from "./components/RootShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crypto Market Monitor",
  description: "Cryptocurrency market multi-indicator monitor"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
