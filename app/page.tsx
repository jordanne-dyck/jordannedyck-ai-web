'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Github, Linkedin } from 'lucide-react';
import { SUGGESTED_QUESTIONS } from '@/lib/suggested-questions';
import { CATS } from '@/lib/cats';
import { initAnalytics, track, clientId } from '@/lib/analytics';
import { Feedback } from '@/app/components/Feedback';
import { FilmEffects } from '@/app/components/FilmEffects';
import { ProjectCard, ProjectPanel } from '@/app/components/ProjectCard';
import { projectBySlug, type Project } from '@/lib/projects';
import { Timeline } from '@/app/components/Timeline';
import './home.css';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

// Read only from event handlers; outside the component so the React
// compiler's purity rule does not mistake a click handler for render code.
const now = () => Date.now();
const randomCat = () => CATS[Math.floor(Math.random() * CATS.length)];

// The logged row id, from the `event` annotation the chat route sends once
// the answer is stored. Absent for answers that were not logged.
function rowIdOf(annotations: unknown[] | undefined): string | null {
  for (const a of annotations ?? []) {
    const ev = a as { type?: unknown; id?: unknown } | null;
    if (ev?.type === 'event' && typeof ev.id === 'string') return ev.id;
  }
  return null;
}

// The project to show under an answer, from the `project` annotation the chat
// route sends when the answer cites one of her project files.
function projectOf(annotations: unknown[] | undefined): Project | null {
  for (const a of annotations ?? []) {
    const p = a as { type?: unknown; slug?: unknown } | null;
    if (p?.type === 'project' && typeof p.slug === 'string') return projectBySlug(p.slug);
  }
  return null;
}

// The `timeline` annotation: null when the answer has none, otherwise whether
// the question asked for it.
function timelineOf(annotations: unknown[] | undefined): { explicit: boolean } | null {
  for (const a of annotations ?? []) {
    const t = a as { type?: unknown; explicit?: unknown } | null;
    if (t?.type === 'timeline') return { explicit: t.explicit === true };
  }
  return null;
}

// The answer that showed the timeline this visit, kept for the tab's life so a
// reload doesn't show it again.
const TIMELINE_KEY = 'jb_timeline_shown';

const EMAIL = 'jordanne.dyck@gmail.com';
const LINKEDIN = 'https://www.linkedin.com/in/jordannedyck/';
const GITHUB = 'https://github.com/jordanne-dyck';

// LinkedIn and GitHub as icons. The aria-label is the link's name for screen readers.
function Socials({ onClick }: { onClick: (channel: 'linkedin' | 'github') => void }) {
  return (
    <>
      <a className="icon" href={LINKEDIN} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" onClick={() => onClick('linkedin')}>
        <Linkedin aria-hidden="true" />
      </a>
      <a className="icon" href={GITHUB} target="_blank" rel="noopener noreferrer" aria-label="GitHub" onClick={() => onClick('github')}>
        <Github aria-hidden="true" />
      </a>
    </>
  );
}
const NAME_LINES = ['Jordanne Dyck'];
const HIGHLIGHTS = ['Sr. Product Manager', 'Human + digital at scale', 'DECIEM', 'Loblaw Digital'];

// Sizes the name so its widest line fills the block. Measured on a still copy,
// because the letters are mid-animation when this runs.
function fitName(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:100px;letter-spacing:-0.035em';
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontVariationSettings = cs.fontVariationSettings;
  document.body.append(probe);
  const w = Math.max(...NAME_LINES.map(t => { probe.textContent = t; return probe.scrollWidth; }));
  probe.remove();
  const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  el.style.fontSize = `${(100 * (inner - 4)) / w}px`;
}

// A pile of cat photos that grows while jordbot thinks.
type Cat = { src: string; r: string; x: string; y: string; key: number };
let catKey = 0;
const newCat = (): Cat => {
  const rand = (a: number, b: number) => (Math.random() * (b - a) + a).toFixed(1);
  return { src: randomCat(), r: `${rand(-12, 12)}deg`, x: `${rand(-14, 14)}px`, y: `${rand(-10, 10)}px`, key: catKey++ };
};

function CatLoader() {
  const [cats, setCats] = useState<Cat[]>(() => [newCat()]);
  useEffect(() => {
    const t = setInterval(() => setCats(prev => [...prev, newCat()].slice(-8)), 380);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="cat-stack" role="status" aria-label="Loading response">
      {cats.map(c => (
        // eslint-disable-next-line @next/next/no-img-element -- already-small webp, stacked and rotated
        <img key={c.key} src={c.src} alt="" style={{ '--r': c.r, '--x': c.x, '--y': c.y } as CSSProperties} />
      ))}
    </div>
  );
}

// Standard chat scrolling: a new question moves to the top of the screen and
// the answer fills the space under it. The spacer at the end of the log holds
// that space open, so nothing shifts as the cats give way to the answer.
// Returns where the newest question sits when pinned, or null before the first.
function fitSpacer(log: HTMLElement, spacer: HTMLElement, composer: HTMLElement, bar: HTMLElement) {
  const users = log.querySelectorAll<HTMLElement>('.msg.user');
  const last = users[users.length - 1];
  if (!last) {
    spacer.style.height = '0px';
    return null;
  }
  // Just under the sticky name bar.
  const target = last.getBoundingClientRect().top + scrollY - bar.offsetHeight - 16;
  const spacerTop = spacer.getBoundingClientRect().top + scrollY;
  const padBottom = parseFloat(getComputedStyle(log).paddingBottom);
  // Tall enough that the composer stays at the bottom of the screen, not
  // halfway up it with the footer showing below.
  const h = Math.max(0, target + innerHeight - composer.offsetHeight - padBottom - spacerTop);
  spacer.style.height = `${h}px`;
  return target;
}

export default function Home() {
  // When the current answer was requested, for stream_completed/abandoned timing.
  const sentAt = useRef<number | null>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, append, error, reload } = useChat({
    api: '/api/chat',
    onFinish: () => {
      if (sentAt.current !== null) {
        track({ name: 'stream_completed', props: { ms_elapsed: now() - sentAt.current } });
        sentAt.current = null;
      }
    },
    // A failed answer is logged server-side; it is not an abandon.
    onError: () => {
      sentAt.current = null;
    },
  });

  useEffect(() => {
    initAnalytics();
    // Closing or leaving the tab mid-answer. sendBeacon survives the unload.
    const onPageHide = () => {
      if (sentAt.current !== null) {
        track(
          { name: 'stream_abandoned', props: { ms_elapsed: now() - sentAt.current } },
          { beacon: true },
        );
        sentAt.current = null;
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const questionsSeen = useRef(0);
  const [usedPrompts, setUsedPrompts] = useState<Set<number>>(new Set());
  // One switch stops all motion: the band, grain, dust (WCAG 2.2.2).
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  // The card that opened the panel, kept after closing so focus can go back to it.
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  // The answer that showed the timeline earlier in this tab, before a reload.
  // Read once; only answers render the timeline, so the server's null is safe.
  const [shownBefore] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return sessionStorage.getItem(TIMELINE_KEY); } catch { return null; }
  });

  // The first-screen button: take the visitor to the chat, cursor in the box.
  const askJordbot = () => {
    track({ name: 'hero_ask_clicked', props: {} });
    chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inputRef.current?.focus({ preventScroll: true });
  };
  const contact = (where: 'hero' | 'after_answer' | 'footer', channel: 'email' | 'linkedin' | 'github' | 'phone') =>
    track({ name: 'contact_clicked', props: { where, channel } });
  // The mailto still opens; the copy covers visitors with no mail app set up.
  const emailAndCopy = () => {
    contact('footer', 'email');
    navigator.clipboard?.writeText(EMAIL).then(() => setCopied(true), () => {});
  };
  const retry = () => {
    track({ name: 'answer_retried', props: {} });
    sentAt.current = now();
    reload({ body: { clientId: clientId() } });
  };

  // Name block: a different cat on every visit, the name fitted to the width,
  // the photo drifting up on scroll, and the sticky name bar once it is gone.
  useEffect(() => {
    const block = blockRef.current, name = nameRef.current, photo = photoRef.current, root = rootRef.current;
    if (!block || !name || !photo || !root) return;
    photo.src = randomCat();
    const fit = () => fitName(name);
    document.fonts.ready.then(fit);
    addEventListener('resize', fit);

    const onScroll = () => {
      photo.style.transform = `translateY(${Math.min(scrollY, block.offsetHeight) * -0.12}px)`;
    };
    addEventListener('scroll', onScroll, { passive: true });

    const io = new IntersectionObserver(([e]) => root.classList.toggle('scrolled', !e.isIntersecting), { threshold: 0.05 });
    io.observe(block);
    return () => { removeEventListener('resize', fit); removeEventListener('scroll', onScroll); io.disconnect(); };
  }, []);

  // Refit the spacer on every change to the log, before paint. A new question
  // scrolls to the top once; the answer then streams in below it without the
  // page following it, so the reader isn't dragged along mid-sentence.
  useLayoutEffect(() => {
    const log = logRef.current, spacer = spacerRef.current, composer = composerRef.current, bar = barRef.current;
    if (!log || !spacer || !composer || !bar) return;
    const target = fitSpacer(log, spacer, composer, bar);
    const questions = messages.filter(m => m.role === 'user').length;
    // Instant, before paint. A smooth scroll is cancelled while the cats load
    // (seen in Chromium), and the intro vanishing on the first question is a
    // jump anyway.
    if (questions > questionsSeen.current && target !== null) scrollTo({ top: target, behavior: 'instant' });
    questionsSeen.current = questions;
  }, [messages, isLoading, error]);

  // The screen height and the composer height change without the log changing.
  useEffect(() => {
    const log = logRef.current, spacer = spacerRef.current, composer = composerRef.current, bar = barRef.current;
    if (!log || !spacer || !composer || !bar) return;
    const fit = () => fitSpacer(log, spacer, composer, bar);
    const ro = new ResizeObserver(fit);
    ro.observe(composer);
    addEventListener('resize', fit);
    return () => { ro.disconnect(); removeEventListener('resize', fit); };
  }, []);

  const allPrompts = SUGGESTED_QUESTIONS;

  const visiblePrompts = allPrompts.filter((_, index) => !usedPrompts.has(index));

  const handlePromptClick = (prompt: string, index: number) => {
    setUsedPrompts(prev => new Set([...prev, index]));
    track({ name: 'chip_clicked', props: { index, text: prompt } });
    track({ name: 'message_sent', props: { source: 'chip' } });
    sentAt.current = now();
    // `source` lets the dashboard count button questions (site-monitoring plan, 2026-10-14).
    // `clientId` joins the row to its PostHog session (Phase 2).
    append({ role: 'user', content: prompt }, { body: { source: 'button', clientId: clientId() } });
  };

  // The timeline shows under the first answer that carries it, once per visit.
  // Later answers show it only when the question asked for it.
  const timelineMsg =
    shownBefore ?? messages.find(m => m.role === 'assistant' && timelineOf(m.annotations))?.id ?? null;
  useEffect(() => {
    if (!timelineMsg || shownBefore) return;
    try { sessionStorage.setItem(TIMELINE_KEY, timelineMsg); } catch {}
  }, [timelineMsg, shownBefore]);

  const showProject = (project: Project, el: HTMLElement, from: 'card' | 'timeline' = 'card') => {
    track({ name: 'project_opened', props: { slug: project.slug, from } });
    setOpener(el);
    setOpenProject(project);
  };
  // A question from the panel is a button question, like a suggested one.
  const askAboutProject = (question: string, index: number) => {
    const project = openProject;
    setOpenProject(null);
    if (!project || isLoading) return;
    track({ name: 'project_question_clicked', props: { slug: project.slug, index } });
    track({ name: 'message_sent', props: { source: 'project' } });
    sentAt.current = now();
    append({ role: 'user', content: question }, { body: { source: 'button', clientId: clientId() } });
  };

  // The cats stand in until the first words of the answer arrive.
  const waiting = isLoading && messages[messages.length - 1]?.role === 'user';
  const answered = !isLoading && !error && messages.some(m => m.role === 'assistant');
  return (
    <div className="home" ref={rootRef} data-chatting={messages.length > 0 || undefined} data-paused={paused || undefined}>
      <div className="bar" ref={barRef}>
        <span className="who" aria-hidden="true">Jordanne Dyck</span>
        <a href="#contact" className="label">Contact</a>
      </div>

      <header className="name-block" ref={blockRef}>
        <div className="hero-top">
          <p>Sr. Product Manager. I build DTC products that bridge human and digital moments at scale. Ask my AI anything about my work.</p>
          <button type="button" className="ask" onClick={askJordbot}>Ask jordbot <span aria-hidden="true">↓</span></button>
        </div>
        <div className="name-photo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- picked at random after load, so it can't be server-rendered */}
          <img ref={photoRef} alt="" className="absolute inset-0 w-full h-full" />
        </div>
        <h1 className="name" ref={nameRef} aria-label="Jordanne Dyck">
          {NAME_LINES.map((line, li) => (
            <span className="line" key={line} aria-hidden="true">
              {line.split('').map((c, ci) => (
                <span className="ch" key={ci} style={{ '--i': NAME_LINES.slice(0, li).join('').length + ci } as CSSProperties}>{c === ' ' ? ' ' : c}</span>
              ))}
            </span>
          ))}
        </h1>
      </header>

      <section className="highlights" aria-label="Highlights">
        <div className="row" aria-hidden="true">
          {[0, 1].flatMap(copy => HIGHLIGHTS.map(t => (
            <span key={`${copy}-${t}`} className="contents"><span className="t">{t}</span><i className="sep" /></span>
          )))}
        </div>
        <p className="sr-only">Sr. Product Manager. Human and digital at scale. DECIEM, Loblaw Digital.</p>
        <nav className="name-links" aria-label="Site">
          <Link href="/about">About</Link>
          <a href={`mailto:${EMAIL}`} onClick={() => contact('hero', 'email')}>Email</a>
          <Socials onClick={ch => contact('hero', ch)} />
          <span className="label">Sr. Product Manager</span>
          <button type="button" className="label pause" aria-pressed={paused} onClick={() => setPaused(p => !p)}>
            {paused ? 'Play motion' : 'Pause motion'}
          </button>
        </nav>
      </section>

      <main className="chat" ref={chatRef}>
        {messages.length === 0 && (
          <div className="intro">
            <h2>Ask me anything<br />about Jordanne&apos;s work.</h2>
            <p>
              I answer from her resume and project notes. Try the digital ecosystem she owned at DECIEM, the production AI she
              shipped, or why she builds for companies pushing what&apos;s possible.
            </p>
          </div>
        )}

        {/* ph-mask: session replay records this area's layout, not its words. */}
        <div className="log ph-mask" ref={logRef} role="log" aria-live="polite" aria-atomic="false">
          {messages.map((message, index) => (
            <div key={index} className={`msg ${message.role === 'user' ? 'user' : 'ai'}`}>
              <span className="label">{message.role === 'user' ? 'You' : 'jordbot'}</span>
              {message.role === 'user' ? (
                message.content
              ) : (
                <div
                  className="ai-message"
                  onCopy={() => track({ name: 'answer_copied', props: {} })}
                >
                  <ReactMarkdown
                    // Model output never loads images: an image URL is
                    // the markdown exfiltration path.
                    disallowedElements={['img']}
                    components={{
                      a: ({ node: _node, ...props }) => (
                        <a className="underline" {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                      p:({ node: _node, ...props }) => (
                        <p className="my-3 first:mt-0 last:mb-0" {...props} />
                      ),
                      ul: ({ node: _node, ...props }) => (
                        <ul className="my-3 ml-6 list-disc space-y-2 first:mt-0 last:mb-0" {...props} />
                      ),
                      li: ({ node: _node, ...props }) => <li {...props} />,
                      h2: ({ node: _node, ...props }) => (
                        <h2 className="text-lg mt-4 mb-2 first:mt-0" {...props} />
                      ),
                      h3: ({ node: _node, ...props }) => (
                        <h3 className="text-base mt-3 mb-1.5 first:mt-0" {...props} />
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {(() => {
                    const rowId = rowIdOf(message.annotations);
                    return rowId ? <Feedback rowId={rowId} /> : null;
                  })()}
                  {(() => {
                    // The timeline takes the project card's place (decided 2026-11-04).
                    const timeline = timelineOf(message.annotations);
                    if (timeline && (timeline.explicit || timelineMsg === message.id)) {
                      return <Timeline explicit={timeline.explicit} paused={paused} onOpenProject={(p, el) => showProject(p, el, 'timeline')} />;
                    }
                    const project = projectOf(message.annotations);
                    return project ? <ProjectCard project={project} onOpen={el => showProject(project, el)} /> : null;
                  })()}
                </div>
              )}
            </div>
          ))}
          {waiting && <CatLoader />}
          {error && !isLoading && (
            <div className="msg ai failed" role="alert">
              <span className="label">jordbot</span>
              That answer didn&apos;t come through. <button type="button" onClick={retry}>Try again</button>, or{' '}
              <a href={`mailto:${EMAIL}`} onClick={() => contact('after_answer', 'email')}>email Jordanne</a>.
            </div>
          )}
          {answered && (
            <p className="after-answer">
              Want to talk to Jordanne?{' '}
              <a href={`mailto:${EMAIL}`} onClick={() => contact('after_answer', 'email')}>Email</a>
              <Socials onClick={ch => contact('after_answer', ch)} />
            </p>
          )}
          <div ref={spacerRef} aria-hidden="true" />
        </div>

        <div className="composer" ref={composerRef}>
          {visiblePrompts.length > 0 && (
            <div className="chips" role="group" aria-label="Suggested questions">
              <span className="label chips-label">Try asking</span>
              {visiblePrompts.slice(0, 3).map(prompt => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => handlePromptClick(prompt, allPrompts.indexOf(prompt))}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              // The box stays usable while an answer streams, so focus and the
              // phone keyboard aren't lost; sending waits for the answer.
              if (isLoading) {
                e.preventDefault();
                return;
              }
              if (input.trim()) {
                track({ name: 'message_sent', props: { source: 'typed' } });
                sentAt.current = now();
              }
              handleSubmit(e, { body: { source: 'typed', clientId: clientId() } });
            }}
            aria-label="Chat with AI assistant"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about experience, projects, skills..."
              maxLength={2000}
              autoComplete="off"
              aria-label="Your question"
            />
            <button type="submit" disabled={isLoading || !input.trim()}>Send</button>
          </form>
          {/* Retention matches k8s/postgres/retention-cronjob.yaml (180 days) and
              backup-cronjob.yaml (14 nightly dumps). Change them together. */}
          <p className="fine label">
            It can get things wrong. Check anything important with Jordanne.
            {messages.length === 0 && <> Chats are kept 180 days to improve answers. Backups, up to 14 days more.</>}
          </p>
        </div>
      </main>

      <footer id="contact">
        <div className="big"><a href={`mailto:${EMAIL}`} onClick={emailAndCopy}>Talk to the human →</a></div>
        <p className="copied label" aria-live="polite">{copied ? `Address copied: ${EMAIL}` : ''}</p>
        <div className="rule" />
        <nav className="frow" aria-label="Contact links">
          <a href={`mailto:${EMAIL}`} onClick={() => contact('footer', 'email')}>{EMAIL}</a>
          <a href="tel:6474542244" onClick={() => contact('footer', 'phone')}>647-454-2244</a>
          <Socials onClick={ch => contact('footer', ch)} />
          <Link href="/about">About</Link>
        </nav>
        <div className="frow small label">
          <span>© 2026 Jordanne Dyck</span>
        </div>
      </footer>

      <ProjectPanel project={openProject} opener={opener} onClose={() => setOpenProject(null)} onAsk={askAboutProject} onOpenProject={setOpenProject} />
      <FilmEffects paused={paused} />
    </div>
  );
}
