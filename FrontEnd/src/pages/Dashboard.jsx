import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import "../styles/dashboard.css";

const SECTIONS = [
  { title: "Upload files", text: "Add handover documents to your workspace." },
  {
    title: "Quizzes",
    text: "Create a knowledge check from uploaded material.",
    to: "/create-quiz",
    action: "Create quiz",
  },
  {
    title: "Admin",
    text: "Manage users and settings.",
    to: "/admin",
    action: "Open",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="dash-shell">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </div>
        <div className="dash-user">
          <span>{email}</span>
          <button type="button" className="dash-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dash-main">
        <h1>Dashboard</h1>
        <p className="dash-sub">Welcome back{email ? `, ${email}` : ""}.</p>

        <div className="dash-grid">
          {SECTIONS.map((s) => (
            <section
              key={s.title}
              className="dash-card"
              style={s.to ? { cursor: "pointer" } : undefined}
              onClick={s.to ? () => navigate(s.to) : undefined}
            >
              <h2>{s.title}</h2>
              <p>{s.text}</p>
              <span className="dash-tag">{s.action ?? "Coming soon"}</span>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
