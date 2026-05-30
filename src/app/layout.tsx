import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "react-hot-toast";
import { StarknetProvider } from "./components/starknet-provider";

export const metadata: Metadata = {
  title: "Swap Chain — Send money anywhere, in plain English",
  description:
    "Tell Swap Chain what you want. Stablecoins from any chain can land in a local bank, mobile money account, another wallet, or another chain.",
  icons: {
    icon: "/logo edit.png",
    shortcut: "/logo edit.png",
    apple: "/logo edit.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="icon" href="/logo edit.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Script
          src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js"
          strategy="afterInteractive"
        />
        <Providers>
          <StarknetProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: "#14120E",
                  color: "#F8F6F1",
                  border: "1px solid rgba(248,246,241,0.14)",
                  fontFamily: "Geist Mono, monospace",
                  fontSize: "12px",
                  letterSpacing: "0.04em",
                },
                success: {
                  duration: 3000,
                  iconTheme: { primary: "#79B98A", secondary: "#14120E" },
                },
                error: {
                  duration: 4000,
                  iconTheme: { primary: "#E07A6A", secondary: "#14120E" },
                },
              }}
            />
          </StarknetProvider>
        </Providers>
      </body>
    </html>
  );
}
