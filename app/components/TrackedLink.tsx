'use client';

import type { AnchorHTMLAttributes } from 'react';
import type { AnalyticsEvent } from '@/lib/analytics';
import { siteEvent } from '@/lib/site-beacon';

type ContactProps = Extract<AnalyticsEvent, { name: 'contact_clicked' }>['props'];

// A plain link that records a contact_clicked event when it is clicked. For
// server-rendered pages (About, the public dashboard), which cannot hold a
// click handler themselves. It calls the site's own beacon directly, not
// track(): importing lib/analytics.ts would add PostHog's code to pages where
// PostHog is never started. Sent as a beacon, because a link without
// target="_blank" unloads the page and a normal request would be cancelled.
export function TrackedLink({
  where,
  channel,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & ContactProps) {
  return (
    <a {...rest} onClick={() => siteEvent('contact_clicked', { where, channel }, true)}>
      {children}
    </a>
  );
}
