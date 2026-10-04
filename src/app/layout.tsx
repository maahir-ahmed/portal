import type { Metadata } from "next";
import { getBrand } from "@/lib/branding";
import { Outfit, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "@/components/shared/SessionProvider";
import "./globals.css";

// Outfit is the society brand typeface.
const outfit = Outfit({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The society's own name, so each stack's tab reads as its society (see lib/branding).
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getBrand();
  return { title: name, description: `${name} portal` };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
