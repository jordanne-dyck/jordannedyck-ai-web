import type { Metadata } from 'next';

// Monitoring pages are public but not content. Keep them out of search
// results, and drop the homepage canonical inherited from the root layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
