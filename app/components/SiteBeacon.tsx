'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { flushView, startView, visibilityChanged } from '@/lib/site-beacon';

// Mounted once in app/layout.tsx: one page view per route, visible time on leave.
export function SiteBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    startView(pathname || '/');
  }, [pathname]);

  useEffect(() => {
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', flushView);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', flushView);
    };
  }, []);

  return null;
}
