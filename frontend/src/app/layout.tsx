import "./globals.css";
import { Karla, Marcellus } from "next/font/google";
import Providers from "./providers";

const karla = Karla({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const marcellus = Marcellus({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: "400",
});

export const metadata = {
  title: "Goldviewfx Intelligence",
  description: "Trading ideas, signals, and gold futures execution in one view.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${karla.variable} ${marcellus.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
