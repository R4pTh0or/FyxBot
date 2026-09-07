import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import releaseManifest from "./release-manifest.json";

const siteUrl = "https://fyxbot-panel-production.up.railway.app";
const siteTitle = "FyxBot — Bot Discord de modération, tickets et sécurité";
const siteDescription = "FyxBot est un bot Discord français pour modérer votre communauté, gérer les tickets, renforcer la sécurité et automatiser l’accueil et les rôles.";

export const revalidate = 30;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: "FyxBot",
  creator: "Équipe FyxBot",
  publisher: "FyxBot",
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "SMVQ3RZstwtvF5jz6W2Cj8wj0y4Ak3a6pp7SaITRF1U",
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
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "/",
    siteName: "FyxBot",
    title: siteTitle,
    description: siteDescription,
    images: [{
      url: "/brand/fyxbot-banner-discord.webp",
      alt: "FyxBot, bot Discord de modération et de gestion de communauté",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/brand/fyxbot-banner-discord.webp"],
  },
  icons: {
    icon: "/brand/fyxbot-logo-symbol.svg",
    shortcut: "/brand/fyxbot-logo-symbol.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: "FyxBot",
        alternateName: "FyxBot Discord Bot",
        description: siteDescription,
        inLanguage: "fr-FR",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#application`,
        name: "FyxBot",
        url: `${siteUrl}/`,
        image: `${siteUrl}/brand/fyxbot-logo-symbol-512.webp`,
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Discord",
        description: siteDescription,
        inLanguage: "fr-FR",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
        },
        featureList: [
          "Modération Discord",
          "Gestion de tickets",
          "Protection et sécurité",
          "Rôles interactifs",
          "Messages d’accueil",
          "Suggestions et journaux",
          "Règlements interactifs",
          "Anniversaires communautaires",
          "Notifications de lives et vidéos",
          "Salons vocaux temporaires",
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "fyxbotassistance@outlook.fr",
          availableLanguage: "French",
          url: `${siteUrl}/support`,
        },
      },
    ],
  };

  return (
    <html lang="fr">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="legal-footer"><span>© 2026 FyxBot</span><a href="/release.json">Version {releaseManifest.currentVersion} · {releaseManifest.statusLabel}</a><a href="/changelog">Changelog</a><a href="/support">Support et signalement</a><a href="/conditions-utilisation">Conditions d’utilisation</a><a href="/politique-confidentialite">Politique de confidentialité</a></footer>
      </body>
    </html>
  );
}
