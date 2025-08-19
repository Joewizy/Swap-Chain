// app/layout.tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Nav from "../components/Navigation";

const geistSans = Geist({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My App",
  description: "Next.js app with Geist font and nav",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.className} bg-[#fafafa] flex`}>
        <Nav />
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
