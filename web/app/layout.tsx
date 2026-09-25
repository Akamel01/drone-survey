import type { Metadata } from "next";
import { Manrope } from 'next/font/google';
import "./globals.css";

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
