import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import "../styles/dashboard.css";
import "../styles/admin.css";

/* ---------- Mock data (replace with Supabase/FastAPI later) ---------- */
const PROJECTS = [
  { id: 1, name: "Q4 Sales Pipeline", owner: "Maya Chen", successor: "Dev Patel", progress: 82, status: "On track" },
  { id: 2, name: "Payments Service", owner: "Luis Ortega", successor: "Sara Kim", progress: 45, status: "At risk" },
  { id: 3, name: "Onboarding Portal", owner: "Priya Nair", successor: "Tom Reed", progress: 100, status: "Complete" },
  { id: 4, name: "Data Warehouse Migration", owner: "Ahmed Khan", successor: "Lena Wu", progress: 18, status: "Behind" },
];

const USERS = [
  { id: 1, name: "Maya Chen", email: "maya@company.com", role: "Admin" },
  { id: 2, name: "Dev Patel", email: "dev@company.com", role: "Employee" },
  { id: 3, name: "Luis Ortega", email: "luis@company.com", role: "Manager" },
  { id: 4, name: "Sara Kim", email: "sara@company.com", role: "Employee" },
  { id: 5, name: "Tom Reed", email: "tom@company.com", role: "Viewer" },
];

const REVIEWS = [
  { id: 1, item: "Payments runbook.pdf", project: "Payments Service", by: "Luis Ortega", flag: "Contains 3 redacted items" },
  { id: 2, item: "Vendor contacts.xlsx", project: "Q4 Sales Pipeline", by: "Maya Chen", flag: "Confidential steps removed" },
  { id: 3, item: "Migration plan.docx", project: "Data Warehouse Migration", by: "Ahmed Khan", flag: "No issues found" },
];

const GAPS = [
  { id: 1, question: "Who approves refunds over $5,000?", project: "Payments Service", asked: 6 },
  { id: 2, question: "Where are the staging DB credentials stored?", project: "Data Warehouse Migration", asked: 4 },
  { id: 3, question: "What is the renewal date for the CRM contract?", project: "Q4 Sales Pipeline", asked: 2 },
];

const DECISIONS = [
  { id: 1, date: "Oct 28", title: "Moved billing jobs to nightly batch", project: "Payments Service", by: "Luis Ortega" },
  { id: 2, date: "Oct 21", title: "Chose Postgres over Mongo for reporting", project: "Data Warehouse Migration", by: "Ahmed Khan" },
  { id: 3, date: "Oct 14", title: "Dropped legacy onboarding survey", project: "Onboarding Portal", by: "Priya Nair" },
];

const TABS = ["Overview", "Users & Access", "Review & Approval", "Knowledge Gaps", "Decision Log"];
const ROLES = ["Admin", "Manager", "Employee", "Viewer"];

function statusClass(status) {
  return {
    "On track": "pill-blue",
    "At risk": "pill-purple",
    Behind: "pill-red",
    Complete: "pill-green",
  }[status] ?? "pill-blue";
}

export default function Admin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState(TABS[0]);
  const [users, setUsers] = useState(USERS);
  const [reviews, setReviews] = useState(REVIEWS);
  const [gaps, setGaps] = useState(GAPS);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  const setRole = (id, role) =>
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
  const resolveReview = (id, outcome) =>
    setReviews((r) => r.map((x) => (x.id === id ? { ...x, outcome } : x)));
  const resolveGap = (id) => setGaps((g) => g.filter((x) => x.id !== id));

  const avg = Math.round(PROJECTS.reduce((s, p) => s + p.progress, 0) / PROJECTS.length);
  const pending = reviews.filter((r) => !r.outcome).length;

  return (
    <div className="dash-shell admin-shell">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </div>
        <nav className="admin-nav" aria-label="Main">
          <button type="button" onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button type="button" className="active">Admin</button>
        </nav>
        <div className="dash-user">
          <span>{email}</span>
          <button type="button" className="dash-btn" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main className="dash-main admin-main">
        <h1>Admin</h1>
        <p className="dash-sub">Manage handovers, people and approvals.</p>

        <div className="admin-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "admin-tab active" : "admin-tab"}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "Review & Approval" && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <>
            <div className="stat-row">
              <div className="stat"><span>{PROJECTS.length}</span>Active handovers</div>
              <div className="stat"><span>{avg}%</span>Average progress</div>
              <div className="stat"><span>{pending}</span>Awaiting approval</div>
              <div className="stat"><span>{gaps.length}</span>Open knowledge gaps</div>
            </div>
            <div className="dash-grid">
              {PROJECTS.map((p) => (
                <section key={p.id} className="dash-card">
                  <div className="card-head">
                    <h2>{p.name}</h2>
                    <span className={`pill ${statusClass(p.status)}`}>{p.status}</span>
                  </div>
                  <p>{p.owner} → {p.successor}</p>
                  <div className="progress" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                  </div>
                  <small className="progress-label">{p.progress}% complete</small>
                </section>
              ))}
            </div>
          </>
        )}

        {tab === "Users & Access" && (
          <div className="table-card">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td><a href={`mailto:${u.email}`}>{u.email}</a></td>
                    <td>
                      <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="right"><button className="dash-btn small">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "Review & Approval" && (
          <div className="list">
            {reviews.map((r) => (
              <div key={r.id} className="list-item">
                <div>
                  <strong>{r.item}</strong>
                  <p>{r.project} · submitted by {r.by}</p>
                  <span className="pill pill-purple">{r.flag}</span>
                </div>
                {r.outcome ? (
                  <span className={`pill ${r.outcome === "Approved" ? "pill-green" : "pill-red"}`}>{r.outcome}</span>
                ) : (
                  <div className="actions">
                    <button className="btn-solid" onClick={() => resolveReview(r.id, "Approved")}>Approve</button>
                    <button className="dash-btn small" onClick={() => resolveReview(r.id, "Rejected")}>Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "Knowledge Gaps" && (
          <div className="list">
            {gaps.length === 0 && <p className="empty">No open gaps. Nice work.</p>}
            {gaps.map((g) => (
              <div key={g.id} className="list-item">
                <div>
                  <strong>{g.question}</strong>
                  <p>{g.project} · asked {g.asked} times in Q&amp;A chat</p>
                </div>
                <button className="dash-btn small" onClick={() => resolveGap(g.id)}>Mark answered</button>
              </div>
            ))}
          </div>
        )}

        {tab === "Decision Log" && (
          <div className="timeline">
            {DECISIONS.map((d) => (
              <div key={d.id} className="timeline-item">
                <span className="timeline-date">{d.date}</span>
                <div>
                  <strong>{d.title}</strong>
                  <p>{d.project} · {d.by}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}