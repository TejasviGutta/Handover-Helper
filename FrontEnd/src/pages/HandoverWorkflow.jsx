import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { handoverApi as api } from "../lib/handoverApi.js";
import "../styles/dashboard.css";
import "../styles/handover-workflow.css";

const statuses = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export default function HandoverWorkflow() {
  const { handoverId } = useParams();
  const [account, setAccount] = useState(null);
  const [handovers, setHandovers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: sessionData, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        if (!sessionData.session) return;
        const [user, visible] = await Promise.all([
          api("/me"),
          api("/handovers"),
        ]);
        if (!active) return;
        setAccount(user);
        setHandovers(visible);
      } catch (failure) {
        if (active) setError(failure.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const handover = handovers.find(({ id }) => id === handoverId);

  return (
    <div className="dash-shell">
      <header className="dash-top">
        <div className="dash-brand"><span className="dash-mark" aria-hidden="true" />Handover Helper</div>
        <Link to="/dashboard" className="dash-btn">Dashboard</Link>
      </header>
      <main className="dash-main workflow">
        <h1>{handover?.project_name ?? "Handover"}</h1>
        {loading && <p role="status">Loading handover…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !account && <p><Link to="/login">Sign in</Link> to open your handovers.</p>}
        {!loading && !error && account && !handover && <p>This handover isn’t available to your account.</p>}
        {handover && <HandoverDetails key={handover.id} handover={handover} account={account} />}
      </main>
    </div>
  );
}

function HandoverDetails({ handover, account }) {
  const [decisions, setDecisions] = useState([]);
  const [guide, setGuide] = useState(null);
  const [content, setContent] = useState("");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const base = `/handovers/${handover.id}`;
  const { can_write: canWrite, can_edit: canEdit, can_review: canReview, can_approve: canApprove } = handover;
  const editable = canEdit && (!guide || ["draft", "changes_requested"].includes(guide.status));

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(base + "/decisions", { signal: controller.signal }),
      api(base + "/guide", { allowMissing: true, signal: controller.signal }),
    ]).then(([entries, current]) => {
      setDecisions(entries);
      setGuide(current);
      setContent(current?.content ?? "");
      setLoaded(true);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [base]);

  async function perform(action, confirmation) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(confirmation);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function addDecision(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    perform(async () => {
      await api(base + "/decisions", { method: "POST", body });
      form.reset();
      setDecisions(await api(base + "/decisions"));
    }, "Decision recorded.");
  }

  function changeGuide(path, method, body, confirmation) {
    return perform(async () => {
      const next = await api(base + "/guide" + path, { method, body });
      setGuide(next);
      setContent(next.content);
      setComment("");
    }, confirmation);
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loaded && !error && <p role="status">Loading decisions and guide…</p>}
      {loaded && <div className="workflow-columns">
        <section className="dash-card">
          <h2>Decision Log</h2>
          {canWrite && <form className="workflow-form" onSubmit={addDecision}>
            <label>Decision title<input name="title" required maxLength={200} /></label>
            <label>Date<input name="decision_date" type="date" required /></label>
            <label>Details<textarea name="details" maxLength={10000} rows={3} /></label>
            <button className="dash-btn" disabled={busy}>Record decision</button>
          </form>}
          {decisions.length ? <ul className="workflow-decisions">
            {decisions.map((decision) => <li key={decision.id}>
              <strong>{decision.title}</strong>
              <time dateTime={decision.decision_date}>{decision.decision_date}</time>
              {decision.details && <p>{decision.details}</p>}
            </li>)}
          </ul> : <p>No decisions recorded yet.</p>}
        </section>
        <section className="dash-card">
          <h2>Handover Guide</h2>
          {guide && <p><span className="dash-tag">{statuses[guide.status]}</span></p>}
          {guide?.review_comment && <p className="workflow-text">{guide.review_comment}</p>}
          {editable ? <form className="workflow-form" onSubmit={(event) => {
            event.preventDefault();
            changeGuide("", "PUT", { content, revision: guide?.revision ?? 0 }, "Draft saved.");
          }}>
            <label>Guide content<textarea required rows={8} maxLength={100000} value={content} onChange={(event) => setContent(event.target.value)} /></label>
            <div className="workflow-actions">
              <button className="dash-btn" disabled={busy}>Save draft</button>
              {guide && <button type="button" className="dash-btn" disabled={busy || content.trim() !== guide.content}
                onClick={() => changeGuide("/submit", "POST", { revision: guide.revision }, "Guide submitted for review.")}>Submit for review</button>}
            </div>
          </form> : <p className="workflow-text">{guide?.content ?? "No guide has been drafted yet."}</p>}
          {guide?.status === "in_review" && (canApprove || (canReview && guide.submitted_by !== account.id)) && (
            <div className="workflow-form">
              <label>Review comment<textarea value={comment} maxLength={10000} rows={3} onChange={(event) => setComment(event.target.value)} /></label>
              <div className="workflow-actions">
                {canReview && guide.submitted_by !== account.id && <button type="button" className="dash-btn" disabled={busy || !comment.trim()}
                  onClick={() => changeGuide("/review", "POST", { revision: guide.revision, outcome: "changes_requested", comment }, "Changes requested.")}>Request changes</button>}
                {canApprove && <button type="button" className="dash-btn" disabled={busy}
                  onClick={() => changeGuide("/review", "POST", { revision: guide.revision, outcome: "approved", comment }, "Guide approved.")}>Approve guide</button>}
              </div>
            </div>
          )}
        </section>
      </div>}
    </>
  );
}
