import type { Metadata } from "next";
import SWRProvider from "@/components/SWRProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VCreators Dashboard",
  description: "Dashboard vận hành & tối ưu campaign CPS/CPV cho VCreators Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
