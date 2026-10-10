import type { Metadata } from "next";
import { Figtree, Overpass_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Variabl brand type: Figtree for text, Overpass Mono for figures (same as the Variabl platform).
const geistSans = Figtree({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const display = Figtree({ variable: "--display-family", subsets: ["latin"], weight: ["600", "700"] });
const geistMono = Overpass_Mono({ variable: "--font-geist-mono", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "Agent CFO",
  description: "AI finance team with runtime access control",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
