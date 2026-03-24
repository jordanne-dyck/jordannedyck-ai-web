import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export const metadata: Metadata = {
  title: 'Jordanne Dyck | AI Builder & Product Strategy Leader',
  description: 'AI Builder, product & strategy leader with 15+ years shipping at scale. From growth marketing to production AI — bridging technical product development with business strategy and customer experience.',
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
    title: 'Jordanne Dyck | AI Builder & Product Strategy Leader',
    description: 'AI Builder, product & strategy leader — 15+ years shipping at scale. From growth marketing to production AI.',
    siteName: 'Jordanne Dyck Portfolio',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Jordanne Dyck - AI Innovation & Digital Transformation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jordanne Dyck | AI Builder & Product Strategy Leader',
    description: 'AI Builder, product & strategy leader — 15+ years shipping at scale. From growth marketing to production AI.',
    images: ['/og-image.png'],
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
    <html lang="en" className={inter.variable}>
      <head>
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: 'Jordanne Dyck',
              jobTitle: 'AI Builder & Product Strategy Leader',
              description: 'AI Builder, product & strategy leader with 15+ years shipping at scale. Bridges technical product development with business strategy and customer experience.',
              url: 'https://jordannedyck.com',
              email: 'jordanne.dyck@gmail.com',
              telephone: '+1-647-454-2244',
              sameAs: [
                'https://www.linkedin.com/in/jordannedyck/',
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
