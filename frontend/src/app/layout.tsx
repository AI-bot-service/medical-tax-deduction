import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
