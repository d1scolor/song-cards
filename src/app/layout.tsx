import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Song Cards",
    template: "%s · Song Cards"
  },
  description: "Pick a card, scan its marker, and play a favourite song.",
  applicationName: "Song Cards",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Song Cards"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5a623"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
