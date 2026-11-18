import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { useRole } from "../lib/useRole.js";
import { canAccessAdmin } from "../lib/roles.js";
import { handoverApi } from "../lib/handoverApi.js";
import "../styles/dashboard.css";
import "../styles/admin.css";

const SECTIONS = [
  {
    title: "Upload files",
    text: "Add handover documents to your workspace.",
    to: "/upload",
  },
  {
    title: "Quizzes",
    text: "Create a knowledge check from uploaded material.",
    to: "/create-quiz",
  },
  { title: "Admin", text: "Manage users, approvals and handovers.", to: "/admin" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [handovers, setHandovers] = useState(null);
  const [handoverError, setHandoverError] = useState("");
  const { role, isDeparting } = useRole();
  const showAdmin = canAccessAdmin(role, isDeparting);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboard() {
      const { data } = await supabase.auth.getUser();
      if (controller.signal.aborted || !data.user) return;
      setEmail(data.user.email ?? "");
      try {
        const projects = await handoverApi("/handovers", { signal: controller.signal });
        if (!controller.signal.aborted) setHandovers(projects);
      } catch {
        if (!controller.signal.aborted) setHandoverError("Couldn’t load your handovers.");
      }
    }
    loadDashboard();
    return () => controller.abort();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
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
          {showAdmin && (
            <button type="button" onClick={() => navigate("/admin")}>Admin</button>
          )}
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
          {SECTIONS.filter((s) => s.to !== "/admin" || showAdmin).map((s) =>
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
        {(handovers || handoverError) && (
          <section className="dash-handover-links" aria-labelledby="my-handovers-title">
            <h2 id="my-handovers-title">My handovers</h2>
            {handoverError && <p role="status">{handoverError}</p>}
            {handovers?.length === 0 && <p>No handovers are assigned to your account.</p>}
            {handovers?.length > 0 && <ul>
              {handovers.map(({ id, project_name }) => (
                <li key={id}><Link to={`/handovers/${id}`}>{project_name}</Link></li>
              ))}
            </ul>}
          </section>
        )}
      </main>
    </div>
  );
}
