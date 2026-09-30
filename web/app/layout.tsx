import type { Metadata, Viewport } from "next";
import { Manrope } from 'next/font/google';
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '700'],
  // Expose a CSS variable for potential future styling usage
  variable: '--display',
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Drone survey mission planner",
  // Installable app (PWA-1, #313): the manifest is app/manifest.ts; these are
  // what Safari's Add to Home Screen reads instead.
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Mission Control", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0A0E0F" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
