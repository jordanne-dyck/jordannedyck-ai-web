import type { Metadata } from 'next';
import Link from 'next/link';
import { Github, Linkedin } from 'lucide-react';
import { AboutMotion } from './AboutMotion';
import { RandomCat } from './RandomCat';
import '../home.css';
import './about.css';

// Server-rendered on purpose: this is the page search engines and AI answer
// engines read, since the chat on the homepage is invisible to crawlers.
// Keep it high level; the detail lives in the chatbot.

const title = 'About Jordanne Dyck | Product and AI Builder';
const description =
  'Jordanne Dyck is a product and AI builder in Toronto. Six years at DECIEM (The Ordinary), most recently Director, Digital Product Management.';

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
    text: 'I think in systems at every scale: technology, business models, industries and culture.',
  },
  {
    name: 'Challenger',
    text: "I build what should exist, not what the systems, teams or business model happen to allow. It's why I ran DECIEM's Black Friday shutdown, a protest against hyperconsumerism, as a commercial play, and why I advised against a points program that didn't fit how its community worked.",
  },
  {
    name: '0 → 1',
    text: "I built DECIEM's digital function from near zero, grew DTC sales to $150M+ annually, and took TikTok Shop from zero to $30M.",
  },
  {
    name: 'Product growth as one system',
    text: 'I treat acquisition, personalization, retention and loyalty as one system. Acquisition quality sets the retention ceiling, and retention economics set what acquisition can afford.',
  },
  {
    name: 'AI fluency',
    text: "I build AI myself, end to end: agentic AI in production at DECIEM, and this site's RAG pipeline, MCP server and evaluation harness.",
  },
];

const EMAIL = 'jordanne.dyck@gmail.com';
const LINKEDIN = 'https://www.linkedin.com/in/jordannedyck/';
const GITHUB = 'https://github.com/jordanne-dyck';

// Styled by the home page's sheet (palette, type, film layers, footer) plus
// about.css for this page's layout.
export default function AboutPage() {
  return (
    <div className="home about">
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

      <nav className="top" aria-label="Site">
        <Link href="/" className="who">Jordanne Dyck</Link>
        <Link href="/">Ask jordbot</Link>
        <AboutMotion />
      </nav>

      <header className="hero">
        <div className="hero-inner">
          <h1>Jordanne Dyck</h1>
          <span className="label">Product and AI builder &middot; Toronto</span>
          <p className="lede">
            I build AI products and lead digital product teams. I spent six years at DECIEM, the
            company behind The Ordinary, most recently as Director, Digital Product Management.
            Before that I was at Loblaw Digital and Shoppers Drug Mart.
          </p>
        </div>
      </header>

      <main>
        <section aria-labelledby="expertise">
          <h2 id="expertise" className="label">How I work</h2>
          <dl>
            {EXPERTISE.map((e, i) => (
              <div key={e.name}>
                <dt>
                  <span aria-hidden="true" className="num">{String(i + 1).padStart(2, '0')}</span>
                  {e.name}
                </dt>
                <dd>{e.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="open-to">
          <strong>Open to:</strong> Director or Head of Product, Group or Staff Product Manager, and
          digital consulting opportunities.
        </p>

        <div className="cta">
          <RandomCat />
          <div>
            <h2>Want the detail? Ask my AI.</h2>
            <p>It can walk you through any role, project or result.</p>
            <Link href="/" className="ask">Start a conversation <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </main>

      <footer id="contact">
        <div className="big"><a href={`mailto:${EMAIL}`}>Talk to the human →</a></div>
        <div className="rule" />
        <nav className="frow" aria-label="Contact links">
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <a href="tel:6474542244">647-454-2244</a>
          <a className="icon" href={LINKEDIN} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <Linkedin aria-hidden="true" />
          </a>
          <a className="icon" href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <Github aria-hidden="true" />
          </a>
          <Link href="/">Home</Link>
        </nav>
        <div className="frow small label">
          <span>© 2026 Jordanne Dyck</span>
        </div>
      </footer>
    </div>
  );
}
