import type { Metadata } from "next";
import { Providers } from "./providers";
import { CookieBanner } from "@/components/ui/CookieBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "МедВычет",
  description: "Автоматизация налогового вычета на лекарства",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
