import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RescueEd Alert",
  description: "Einchecken. Einteilen. Alarmieren. Schlanke Alarmierung für Sanitätsdienste.",
  icons: {
    icon: "/rescueed-alert-logo.png",
    shortcut: "/rescueed-alert-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
