import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

// Server-rendered on purpose: this is the page search engines and AI answer
// engines read, since the chat on the homepage is invisible to crawlers.
// Keep it high level; the detail lives in the chatbot.

const title = 'About Jordanne Dyck | AI Builder, Product & Digital Leader';
const description =
  'Jordanne Dyck is an AI builder and product and digital leader in Toronto. Six years at DECIEM (The Ordinary), most recently Director, Digital Product Management.';

export const metadata: Metadata = {
  title,
  description,
  // The root layout's canonical points at the homepage; without this the
  // page would tell Google it is a duplicate of /.
  alternates: { canonical: 'https://jordannedyck.com/about' },
  openGraph: { title, description, url: 'https://jordannedyck.com/about' },
  twitter: { title, description },
};

const EXPERTISE = [
  {
    name: 'Systems thinking',
    text: "I think in systems at every scale: technology, business models, industries and culture. It's why I ran DECIEM's Black Friday shutdown, a protest against hyperconsumerism, as a commercial play, and why I advised against a points program that didn't fit how its community worked.",
  },
  {
    name: 'Challenger',
    text: 'I build what should exist, not what the systems, teams or business model happen to allow.',
  },
  {
    name: 'Influence without authority',
    text: 'I held one roadmap across marketing, commercial, data, service, retail and legal teams by making every trade-off visible.',
  },
  {
    name: '0 → 1',
    text: "I built DECIEM's digital function from near zero and took TikTok Shop from zero to $30M.",
  },
  {
    name: 'AI fluency',
    text: "I build AI myself, end to end: agentic AI in production at DECIEM, and this site's RAG pipeline, MCP server and evaluation harness.",
  },
];

const linkClass =
  'text-[#666666] hover:text-[#0055D4] transition-colors underline decoration-[#CCCCCC] hover:decoration-[#0055D4]';

export default function AboutPage() {
  return (
    <div className="min-h-[100dvh] bg-[#F5F5F0] text-[#1A1A1A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            url: 'https://jordannedyck.com/about',
            mainEntity: { '@id': 'https://jordannedyck.com/#person' },
          }),
        }}
      />

      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-[#E0E0DB]">
        <Link href="/" className="text-sm sm:text-[15px] font-bold tracking-tight">
          Jordanne Dyck
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-semibold text-[#0055D4] bg-[#E0EBFF] px-3.5 py-2 rounded-full hover:bg-[#cfe0ff] transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Ask my AI
        </Link>
      </header>

      <main className="max-w-[640px] mx-auto px-5 sm:px-8 pt-9 sm:pt-16 pb-12 sm:pb-16">
        <h1 className="text-[34px] sm:text-5xl font-bold tracking-tight">Jordanne Dyck</h1>
        <p className="mt-1.5 text-sm sm:text-base text-[#666666] font-medium">
          AI builder &middot; Product &amp; digital leader &middot; Toronto
        </p>

        <p className="mt-5 sm:mt-7 text-base sm:text-lg leading-relaxed">
          I build AI products and lead digital product teams. I spent six years at DECIEM, the
          company behind The Ordinary, most recently as Director, Digital Product Management.
          Before that I was at Loblaw Digital and Shoppers Drug Mart.
        </p>

        <section aria-labelledby="expertise" className="mt-10 sm:mt-12">
          <h2
            id="expertise"
            className="mb-3.5 text-xs font-semibold tracking-[0.08em] uppercase text-[#999999]"
          >
            How I work
          </h2>
          <dl className="border-b border-[#E0E0DB]">
            {EXPERTISE.map((e, i) => (
              <div
                key={e.name}
                className="grid sm:grid-cols-[200px_1fr] gap-1.5 sm:gap-5 py-5 border-t border-[#E0E0DB]"
              >
                <dt className="text-xl sm:text-[22px] font-bold tracking-tight leading-tight">
                  <span aria-hidden="true" className="block mb-1 text-xs font-semibold tracking-[0.06em] text-[#0055D4]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {e.name}
                </dt>
                <dd className="text-[15px] text-[#333333] leading-relaxed">{e.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-6 text-sm leading-relaxed text-[#666666]">
          <strong className="text-[#1A1A1A] font-semibold">Open to:</strong> AI product leadership,
          Director or Head of Product, Group or Staff Product Manager, digital transformation, and
          digital, brand and marketing consulting.
        </p>

        <div className="mt-10 p-5 sm:p-6 rounded-3xl bg-white border border-[#E0E0DB] shadow-[0_20px_50px_rgba(0,0,0,0.08)] flex flex-col sm:flex-row items-center gap-4 sm:gap-5 text-center sm:text-left">
          <Image
            src="/cat-drawn-transparent-real-coloured.png"
            alt=""
            width={80}
            height={80}
            className="w-20 h-20 object-contain flex-shrink-0"
          />
          <div>
            <h2 className="text-lg font-bold">Want the detail? Ask my AI.</h2>
            <p className="mt-1 mb-3 text-sm text-[#666666]">
              It can walk you through any role, project or result.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#0055D4] px-[18px] py-2.5 rounded-full hover:bg-[#0047b3] transition-colors"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Start a conversation
            </Link>
          </div>
        </div>

        <nav className="mt-6 flex justify-center gap-4 text-sm" aria-label="Contact links">
          <a href="mailto:jordanne.dyck@gmail.com" className={linkClass}>
            Email
          </a>
          <a
            href="https://www.linkedin.com/in/jordannedyck/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/jordanne-dyck"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            GitHub
          </a>
        </nav>
      </main>
    </div>
  );
}
