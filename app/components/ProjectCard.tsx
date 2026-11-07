'use client';

import { useEffect, useRef } from 'react';
import { childProjects, type Project } from '@/lib/projects';

// A still or a muted, looping clip. Clips are short screen recordings with
// nothing to hear, so they play inline like a GIF. With reduced motion they
// stay on the first frame.
function Media({ src }: { src: string }) {
  if (src.endsWith('.mp4')) {
    return (
      <video
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        ref={(v) => {
          if (v && !matchMedia('(prefers-reduced-motion: reduce)').matches) v.play().catch(() => {});
        }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- small static images, same treatment as the cats
  return <img src={src} alt="" />;
}

// The card under an answer that draws on one of Jordanne's projects. The slug
// comes from the `project` annotation the chat route sends.
export function ProjectCard({ project, onOpen }: { project: Project; onOpen: (opener: HTMLElement) => void }) {
  const img = project.images[0];
  return (
    <button
      type="button"
      className="project-card"
      aria-haspopup="dialog"
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {img && (
        <span className="card-img">
          <Media src={img} />
        </span>
      )}
      <span className="rows label">
        <span>{project.title} <i /> {project.when}</span>
        <span>{project.org}</span>
        <span>{project.tags}</span>
      </span>
    </button>
  );
}

// The project in full. A native modal <dialog>: the browser traps focus,
// closes it on Esc and makes the page behind it inert. A click on the
// backdrop closes it too. Focus goes back to the card that opened it.
export function ProjectPanel({
  project,
  opener,
  onClose,
  onAsk,
  onOpenProject,
  onTalk,
}: {
  project: Project | null;
  opener: HTMLElement | null;
  onClose: () => void;
  onAsk: (question: string, index: number) => void;
  // Swaps the open panel to another project, for the lab's project list.
  onOpenProject: (project: Project) => void;
  // "Talk to Jordanne about this project": the concierge panel, with the project named.
  onTalk: (project: Project) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (project && !dialog.open) dialog.showModal();
    if (!project && dialog.open) {
      dialog.close();
      opener?.focus();
    }
  }, [project, opener]);

  return (
    <dialog
      ref={ref}
      className="project"
      aria-labelledby="project-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {project && (
        <div className="project-inner">
          <div className="project-top">
            <span className="label">Project</span>
            <button type="button" className="label" onClick={onClose}>Close ✕</button>
          </div>
          <div className="project-body">
            {project.images.length > 0 && (
              <div className="gallery" data-count={Math.min(project.images.length, 3)}>
                {project.images.slice(0, 3).map((src) => <Media key={src} src={src} />)}
              </div>
            )}
            <h3 id="project-title">{project.title}</h3>
            <div className="rows label">
              <div>{project.when}</div>
              <div>{project.org}</div>
              <div>{project.role}</div>
              <div>{project.tags}</div>
            </div>
            <div className="sec"><span className="label">The problem</span><p>{project.problem}</p></div>
            <div className="sec"><span className="label">What she built</span><p>{project.built}</p></div>
            <div className="sec">
              <span className="label">Result</span>
              <ul>{project.results.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            {childProjects(project.slug).length > 0 && (
              <div className="sec">
                <span className="label">Projects from the lab</span>
                <ul className="links">
                  {childProjects(project.slug).map((c) => (
                    <li key={c.slug}><button type="button" onClick={() => onOpenProject(c)}>{c.title} →</button></li>
                  ))}
                </ul>
              </div>
            )}
            {project.links && (
              <div className="sec">
                <span className="label">See it</span>
                <ul className="links">
                  {project.links.map((l) => (
                    <li key={l.href}><a href={l.href} target="_blank" rel="noopener noreferrer">{l.label} ↗</a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="project-foot">
            <span className="label">Ask about this project</span>
            <div className="chips" role="group" aria-label="Questions about this project">
              {project.questions.map((q, i) => (
                <button type="button" key={q} onClick={() => onAsk(q, i)}>{q}</button>
              ))}
            </div>
            <button type="button" className="talk" aria-haspopup="dialog" onClick={() => onTalk(project)}>
              Talk to Jordanne about this project →
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
