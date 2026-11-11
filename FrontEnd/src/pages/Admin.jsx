import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { useRole } from "../lib/useRole.js";
import { ROLES, ADMIN_ROLES } from "../lib/roles.js";
import "../styles/admin.css";

/* ---------- Sample data (these tabs are connected later by teammates) ---------- */
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
const ROLE_OPTIONS = Object.values(ROLES);
const DONE_STATUSES = ["complete", "completed", "done", "closed"];

const lower = (value) => (value ?? "").toLowerCase();
const isDone = (status) => DONE_STATUSES.includes(lower(status));

function statusClass(status) {
  const s = lower(status);
  if (isDone(s) || s === "approved") return "pill-green";
  if (s.includes("review")) return "pill-purple";
  if (s.includes("block") || s.includes("risk")) return "pill-red";
  return "pill-blue";
}

function SampleNote() {
  return <p className="admin-sample">Sample data until this tab is connected to the database.</p>;
}

export default function Admin() {
  const navigate = useNavigate();
  const { status, user, role: myRole } = useRole();
  const email = user?.email ?? "";
  const canSeeUsers = ADMIN_ROLES.includes(myRole);
  const canEditRoles = myRole === ROLES.ADMIN;

  const [tab, setTab] = useState(TABS[0]);
  const [handovers, setHandovers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviews, setReviews] = useState(REVIEWS);
  const [gaps, setGaps] = useState(GAPS);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      const [h, d, p] = await Promise.all([
        supabase
          .from("handovers")
          .select("id, project_name, departing_employee, incoming_employee, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("documents").select("id, handover_id, status"),
        canSeeUsers
          ? supabase.from("profiles").select("id, email, full_name, role").order("email")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;

      const firstError = h.error || d.error || p.error;
      if (firstError) setLoadError(firstError.message);
      setHandovers(h.data ?? []);
      setDocuments(d.data ?? []);
      setProfiles(p.data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [status, canSeeUsers]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  async function changeRole(id, newRole) {
    const previous = profiles;
    setNotice("");
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, role: newRole } : p)));

    const { data, error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", id)
      .select("id");

    if (error || !data || data.length === 0) {
      setProfiles(previous);
      setNotice(
        error
          ? `Could not change role: ${error.message}`
          : "Could not change role. You may not have permission."
      );
    } else {
      setNotice("Role updated.");
    }
  }

  const resolveReview = (id, outcome) =>
    setReviews((r) => r.map((x) => (x.id === id ? { ...x, outcome } : x)));
  const resolveGap = (id) => setGaps((g) => g.filter((x) => x.id !== id));

  // Progress = approved documents / all documents for that handover.
  const rows = useMemo(
    () =>
      handovers.map((h) => {
        const docs = documents.filter((d) => d.handover_id === h.id);
        const approved = docs.filter((d) => lower(d.status) === "approved").length;
        const progress = docs.length ? Math.round((approved / docs.length) * 100) : 0;
        return { ...h, docCount: docs.length, approved, progress };
      }),
    [handovers, documents]
  );

  const activeCount = rows.filter((r) => !isDone(r.status)).length;
  const avgProgress = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + r.progress, 0) / rows.length)
    : 0;
  const inReviewCount = documents.filter((d) => lower(d.status).includes("review")).length;
  const pendingReviews = reviews.filter((r) => !r.outcome).length;
  const tabs = TABS.filter((t) => t !== "Users & Access" || canSeeUsers);

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
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "admin-tab active" : "admin-tab"}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "Review & Approval" && pendingReviews > 0 && (
                <span className="badge">{pendingReviews}</span>
              )}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="notice notice-error" role="alert">
            Some data could not be loaded: {loadError}. This is usually a Supabase permission
            (RLS) setting.
          </div>
        )}

        {tab === "Overview" && (
          <>
            <div className="stat-row">
              <div className="stat"><span>{activeCount}</span>Active handovers</div>
              <div className="stat"><span>{avgProgress}%</span>Average progress</div>
              <div className="stat"><span>{inReviewCount}</span>Documents in review</div>
              <div className="stat"><span>{canSeeUsers ? profiles.length : "—"}</span>Team members</div>
            </div>

            {loading ? (
              <p className="admin-loading">Loading handovers…</p>
            ) : rows.length === 0 ? (
              <div className="list">
                <p className="empty">No handovers yet.</p>
              </div>
            ) : (
              <div className="dash-grid">
                {rows.map((p) => (
                  <section key={p.id} className="dash-card">
                    <div className="card-head">
                      <h2>{p.project_name || "Untitled project"}</h2>
                      <span className={`pill ${statusClass(p.status)}`}>
                        {(p.status || "no status").replace(/[_-]+/g, " ")}
                      </span>
                    </div>
                    <p>{p.departing_employee || "—"} → {p.incoming_employee || "—"}</p>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuenow={p.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                    </div>
                    <small className="progress-label">
                      {p.docCount
                        ? `${p.progress}% · ${p.approved} of ${p.docCount} documents approved`
                        : "No documents uploaded yet"}
                    </small>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "Users & Access" && canSeeUsers && (
          <>
            {notice && <div className="notice" role="status">{notice}</div>}
            <div className="table-card">
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th></tr>
                </thead>
                <tbody>
                  {profiles.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name || "—"}</td>
                      <td><a href={`mailto:${u.email}`}>{u.email}</a></td>
                      <td>
                        <select
                          value={u.role ?? ""}
                          disabled={!canEditRoles || u.id === user?.id}
                          title={
                            u.id === user?.id
                              ? "You can't change your own role"
                              : canEditRoles
                                ? ""
                                : "Only admins can change roles"
                          }
                          onChange={(e) => changeRole(u.id, e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!loading && profiles.length === 0 && (
                    <tr><td colSpan={3} className="empty">No users found.</td></tr>
                  )}
                </tbody>
              </table>
              {!canEditRoles && (
                <p className="table-note">Only admins can change roles.</p>
              )}
            </div>
          </>
        )}

        {tab === "Review & Approval" && (
          <>
            <SampleNote />
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
          </>
        )}

        {tab === "Knowledge Gaps" && (
          <>
            <SampleNote />
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
          </>
        )}

        {tab === "Decision Log" && (
          <>
            <SampleNote />
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
          </>
        )}
      </main>
    </div>
  );
}