import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

// Home page: Fraunces for the name and big type, Neue Regrade for reading text.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-fraunces',
});

const regrade = localFont({
  src: './fonts/NeueRegrade-Variable.ttf',
  weight: '300 800',
  display: 'swap',
  variable: '--font-regrade',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://jordannedyck.com'),
  title: 'Jordanne Dyck | Product & AI Builder',
  description: 'Product & AI Builder with 15+ years shipping at scale. From growth marketing to production AI — bridging technical product development with business strategy and customer experience.',
  keywords: [
    'Jordanne Dyck',
    'AI Builder',
    'Product Strategy',
    'Agentic AI',
    'Digital Transformation',
    'Production AI',
    'E-Commerce',
    'RAG',
    'Knowledge Architecture',
    'Customer Experience',
    'LLM Development',
    'Digital Product Management'
  ],
  authors: [{ name: 'Jordanne Dyck' }],
  creator: 'Jordanne Dyck',
  publisher: 'Jordanne Dyck',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://jordannedyck.com',
    title: 'Jordanne Dyck | Product & AI Builder',
    description: 'Product & AI Builder — 15+ years shipping at scale. From growth marketing to production AI.',
    siteName: 'Jordanne Dyck Portfolio',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Jordanne Dyck holding her cat, next to her name and title',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jordanne Dyck | Product & AI Builder',
    description: 'Product & AI Builder — 15+ years shipping at scale. From growth marketing to production AI.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: 'https://jordannedyck.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${regrade.variable}`}>
      <head>
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Person',
              '@id': 'https://jordannedyck.com/#person',
              name: 'Jordanne Dyck',
              jobTitle: 'Product & AI Builder',
              description: 'Product & AI Builder with 15+ years shipping at scale. Bridges technical product development with business strategy and customer experience.',
              url: 'https://jordannedyck.com',
              email: 'jordanne.dyck@gmail.com',
              sameAs: [
                'https://www.linkedin.com/in/jordannedyck/',
                'https://github.com/jordanne-dyck',
              ],
              knowsAbout: [
                'Artificial Intelligence',
                'Machine Learning',
                'Product Management',
                'Digital Transformation',
                'AI Strategy',
                'LLM Development',
                'Agentic AI',
                'RAG & Knowledge Architecture',
                'E-Commerce',
              ],
              alumniOf: [
                { '@type': 'Organization', name: 'DECIEM' },
                { '@type': 'Organization', name: 'Loblaw Digital' },
                { '@type': 'CollegeOrUniversity', name: 'University of Toronto' },
                { '@type': 'CollegeOrUniversity', name: 'University of Guelph' },
                { '@type': 'Organization', name: 'Maven' },
              ],
            }),
          }}
        />
      </head>
      <body className="font-[family-name:var(--font-inter)]">{children}</body>
    </html>
  );
}
