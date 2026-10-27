import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import type { CSSProperties } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import "./globals.css";

// Display font: the wordmark, headings, prices and order numbers.
// Big Shoulders is a tall, condensed face in the spirit of team jerseys and
// scoreboards — it suits a store named after the school mascot.
const display = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  // Next can't auto-size a fallback for this font, so name close matches.
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

// Body font: everything else. Archivo is a sturdy, very readable sans.
const body = Archivo({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  themeColor: brand.colors.ink,
};

// Store colors from src/config/brand.ts, turned into CSS variables that
// globals.css uses for buttons, stickers, focus rings, etc.
const brandColors = {
  "--brand": brand.colors.primary,
  "--brand-foreground": brand.colors.primaryText,
  "--brand-accent": brand.colors.accent,
  "--brand-accent-foreground": brand.colors.accentText,
  "--brand-accent-deep": brand.colors.accentDeep,
} as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes adds the "dark" class before React loads.
    <html
      lang="en"
      style={brandColors}
      className={`${display.variable} ${body.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
