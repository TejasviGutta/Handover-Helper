import { useEffect, useRef, useState } from "react";
import "../styles/features.css";

const FEATURES = [
  { title: "Centralized Knowledge Hub", description: "Organize project documents, meeting notes, and transition information in one workspace." },
  { title: "Handover Guides", description: "Structure responsibilities, decisions, contacts, and pending work into clear guides." },
  { title: "Ask Your Project", description: "Ask questions about project knowledge and find answers in relevant documents." },
  { title: "Review & Approval", description: "Review, correct, and approve handover information before responsibilities transfer." },
  { title: "Knowledge Gap Detection", description: "Identify missing documentation, unresolved questions, and incomplete details." },
  { title: "Handover Readiness", description: "Track handover progress and identify outstanding transition tasks." },
];

const THROW_MS = 650;
const RETURN_MS = 650;

export default function Features() {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const touchStart = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event) => setReducedMotion(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let timer;
    const delay = (duration) => reducedMotion ? 0 : duration;
    if (phase === "idle" && index === FEATURES.length) {
      timer = setTimeout(() => setPhase("regroup"), delay(80));
    } else if (phase === "idle" && target > index) {
      timer = setTimeout(() => setPhase("lift"), 0);
    } else if (phase === "idle" && target < index) {
      timer = setTimeout(() => { setIndex((value) => value - 1); setPhase("return"); }, 0);
    } else if (phase === "lift") {
      timer = setTimeout(() => setPhase("throw"), delay(150));
    } else if (phase === "throw") {
      timer = setTimeout(() => { setIndex((value) => value + 1); setPhase("idle"); }, delay(THROW_MS));
    } else if (phase === "return") {
      timer = setTimeout(() => setPhase("idle"), delay(RETURN_MS));
    } else if (phase === "regroup") {
      timer = setTimeout(() => setPhase("settling"), delay(80));
    } else if (phase === "settling") {
      timer = setTimeout(() => setPhase("complete"), delay(RETURN_MS));
    }
    return () => clearTimeout(timer);
  }, [index, target, phase, reducedMotion]);

  const busy = phase !== "idle" && phase !== "complete";
  const navigate = (destination) => {
    if (busy) return;
    const next = Math.max(0, Math.min(FEATURES.length, destination));
    if (phase === "complete") {
      if (next === 0) { setIndex(0); setTarget(0); setPhase("idle"); }
      else { setIndex(FEATURES.length); setTarget(next); setPhase("idle"); }
      return;
    }
    setTarget(next);
  };

  function handleKeyDown(event) {
    if (event.key === "ArrowRight") { event.preventDefault(); navigate(index + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); navigate(index - 1); }
  }

  function handleTouchEnd(event) {
    if (touchStart.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) > 50) navigate(index + (distance < 0 ? 1 : -1));
  }

  const complete = phase === "complete" || phase === "regroup" || phase === "settling";
  const announcedIndex = Math.min(index, FEATURES.length - 1);

  return (
    <section className="features-section" id="features" aria-labelledby="features-heading" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="features-content">
        <div className="features-heading">
          <p>Explore the handover</p>
          <h2 id="features-heading">Features</h2>
        </div>
        <div className="features-deck" aria-label="Feature cards" onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={handleTouchEnd}>
          {FEATURES.map((feature, cardIndex) => {
            const thrown = cardIndex < index || (cardIndex === index && phase === "throw");
            const lifted = cardIndex === index && phase === "lift";
            const depth = Math.max(0, cardIndex - index);
            const direction = cardIndex % 2 === 0 ? -1 : 1;
            const stacked = phase === "settling" || phase === "complete";
            const offset = stacked ? cardIndex : depth;
            const transform = stacked
              ? `translate(${offset * 3}px, ${offset * -3}px) rotate(${(offset - 2.5) * 0.8}deg)`
              : thrown
                ? `translateX(calc(${direction < 0 ? "-100vw - 100%" : "100vw + 100%"})) rotate(${direction * 30}deg)`
                : lifted
                  ? `translateY(-16px) rotate(${direction * 3}deg) scale(1.025)`
                  : `translate(${depth * 5}px, ${depth * -5}px) rotate(${depth * 1.15}deg)`;
            return (
              <article key={feature.title} className={`feature-card${cardIndex === index && phase === "throw" ? " is-throwing" : ""}`} style={{ transform, zIndex: FEATURES.length - cardIndex }} aria-hidden={complete || cardIndex !== index}>
                <div className="feature-card-copy"><h3>{feature.title}</h3><p>{feature.description}</p></div>
              </article>
            );
          })}
        </div>
        <p className="features-status" aria-live="polite">{phase === "complete" ? "You’ve explored all six features." : <span className="features-visually-hidden">{FEATURES[announcedIndex].title}</span>}</p>
        <div className="features-progress" aria-label="Feature progress">
          {FEATURES.map((feature, cardIndex) => (
            <button key={feature.title} type="button" className={`features-progress-bar ${complete || cardIndex < index ? "is-complete" : cardIndex === index ? "is-active" : ""}`} aria-label={`Go to ${feature.title}`} aria-current={!complete && cardIndex === index ? "step" : undefined} disabled={busy} onClick={() => navigate(cardIndex)} />
          ))}
        </div>
        <div className="features-controls">
          <button className="features-control-rounded" type="button" onClick={() => navigate(index - 1)} disabled={busy || index === 0}>Previous</button>
          {phase === "complete" ? <button className="features-control-rounded" type="button" onClick={() => navigate(0)}>Replay <span aria-hidden="true">↻</span></button> : <button type="button" onClick={() => navigate(index + 1)} disabled={busy}>Next <span aria-hidden="true">→</span></button>}
        </div>
      </div>
    </section>
  );
}
