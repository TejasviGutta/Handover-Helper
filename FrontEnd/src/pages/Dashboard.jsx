import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import "../styles/dashboard.css";
import "../styles/admin.css";

const SECTIONS = [
  { title: "Upload files", text: "Add handover documents to your workspace." },
  { title: "Quizzes", text: "Test your knowledge on uploaded material." },
  { title: "Admin", text: "Manage users, approvals and handovers.", to: "/admin" },
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
    <div className="dash-shell admin-shell">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </div>
        <nav className="admin-nav" aria-label="Main">
          <button type="button" className="active">Dashboard</button>
          <button type="button" onClick={() => navigate("/admin")}>Admin</button>
        </nav>
        <div className="dash-user">
          <span>{email}</span>
          <button type="button" className="dash-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dash-main admin-main">
        <h1>Dashboard</h1>
        <p className="dash-sub">Welcome back{email ? `, ${email}` : ""}.</p>

        <div className="dash-grid">
          {SECTIONS.map((s) =>
            s.to ? (
              <Link key={s.title} to={s.to} className="dash-card dash-card-link">
                <h2>{s.title}</h2>
                <p>{s.text}</p>
                <span className="dash-tag">Open →</span>
              </Link>
            ) : (
              <section key={s.title} className="dash-card">
                <h2>{s.title}</h2>
                <p>{s.text}</p>
                <span className="dash-tag">Coming soon</span>
              </section>
            )
          )}
        </div>
      </main>
    </div>
  );
}