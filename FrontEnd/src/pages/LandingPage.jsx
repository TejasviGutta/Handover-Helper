
import handOne from "../assets/hand-1.png";
import handTwo from "../assets/hand-2.png";
import Features from "./Features.jsx";
import "../styles/landing.css";

export default function LandingPage() {
  function moveNavbarGlow(event) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--glow-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--glow-y", `${event.clientY - bounds.top}px`);
  }

  function moveHands(event) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--hands-x", `${x * 12}px`);
    event.currentTarget.style.setProperty("--hands-y", `${y * 12}px`);
  }

  function resetHands(event) {
    event.currentTarget.style.removeProperty("--hands-x");
    event.currentTarget.style.removeProperty("--hands-y");
  }

  return (
    <main className="landing-page">
      <nav className="landing-navbar" onPointerMove={moveNavbarGlow}>
        <a href="/" className="landing-nav-brand" aria-label="Handover Helper home">H<span>H</span></a>

        <div className="landing-nav-group landing-nav-main">
          <a href="/" className="landing-nav-home">Home</a>
          <a href="#features" className="landing-nav-features">
            Features
          </a>
          <a href="#how-it-works" className="landing-nav-how">How it works</a>
        </div>

        <div className="landing-nav-group landing-nav-account">
          <a href="/login" className="landing-nav-signin">
            Sign in
          </a>
          <a href="/register" className="landing-nav-register">
            Register
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <h1 className="landing-title">
          <span>HANDOVER</span>
          <span className="landing-title-red">HELPER</span>
        </h1>

        <div className="landing-illustration" onPointerMove={moveHands} onPointerLeave={resetHands}>
          <div className="landing-hands" role="img" aria-label="Hands passing project documents">
            <img className="landing-hand-left" src={handOne} alt="" />
            <img className="landing-hand-right" src={handTwo} alt="" />
          </div>
        </div>
      </section>
      <span className="landing-scroll-hint" aria-hidden="true" />
      <Features />
    </main>
  );
}
