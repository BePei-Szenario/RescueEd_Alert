import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://alert-rescueed.de"),
  applicationName: "RescueEd Alert",
  title: {
    default: "RescueEd Alert – Helfer koordinieren und alarmieren",
    template: "%s | RescueEd Alert",
  },
  description:
    "RescueEd Alert unterstützt Sanitätsdienste und Feuerwehren beim Einchecken, Einteilen und Alarmieren ihrer Helfer.",
  keywords: [
    "Sanitätsdienst",
    "Helfer alarmieren",
    "Einsatzplanung",
    "Feuerwehr",
    "Helferverwaltung",
    "RescueEd Alert",
  ],
  authors: [{name: "RescueEd"}],
  creator: "RescueEd",
  publisher: "RescueEd",
  category: "Einsatzorganisation",
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "/",
    siteName: "RescueEd Alert",
    title: "RescueEd Alert – Helfer koordinieren und alarmieren",
    description:
      "Einchecken, einteilen und alarmieren: digitale Einsatzorganisation für Sanitätsdienste und Feuerwehren.",
    images: [{url: "/rescueed-alert-logo.png", alt: "RescueEd Alert Logo"}],
  },
  twitter: {
    card: "summary",
    title: "RescueEd Alert – Helfer koordinieren und alarmieren",
    description:
      "Digitale Einsatzorganisation für Sanitätsdienste und Feuerwehren.",
    images: ["/rescueed-alert-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
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
