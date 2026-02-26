import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jordanne Dyck | AI Innovation & Digital Transformation Leader',
  description: 'Jordanne Dyck is a digital transformation and AI strategy leader with 15+ years of experience in product management, AI innovation, and building high-performing teams. Expert in LLMs, RAG systems, and agentic AI.',
  keywords: [
    'Jordanne Dyck',
    'AI Innovation',
    'Digital Transformation',
    'Product Strategy',
    'AI Strategy',
    'Machine Learning',
    'Product Management',
    'LLM Development',
    'Agentic AI',
    'Digital Product Management'
  ],
  authors: [{ name: 'Jordanne Dyck' }],
  creator: 'Jordanne Dyck',
  publisher: 'Jordanne Dyck',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://yourdomain.com',
    title: 'Jordanne Dyck | AI Innovation & Digital Transformation Leader',
    description: 'Digital transformation and AI strategy leader specializing in product management, AI innovation, and building scalable AI solutions.',
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
    title: 'Jordanne Dyck | AI Innovation & Digital Transformation Leader',
    description: 'Digital transformation and AI strategy leader specializing in product management and AI innovation.',
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
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
      },
    ],
  },
  manifest: '/site.webmanifest',
  alternates: {
    canonical: 'https://yourdomain.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Person',
              name: 'Jordanne Dyck',
              jobTitle: 'AI Innovation & Digital Transformation Leader',
              description: 'Digital transformation and AI strategy leader with 15+ years of experience in product management, AI innovation, and building high-performing teams.',
              url: 'https://yourdomain.com',
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
              ],
              alumniOf: {
                '@type': 'Organization',
                name: 'Various Technology Companies',
              },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}