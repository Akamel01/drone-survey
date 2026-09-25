import type { Metadata } from "next";
import { Manrope } from 'next/font/google';
import "./globals.css";

// M3: Self-host Manrope fonts via next/font/google
// We pin weights 500 and 700 as required; 400/600 arrivals are reserved for future tickets.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '700'],
  // Expose a CSS variable for potential future styling usage
  variable: '--display',
});

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Drone survey mission planner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
