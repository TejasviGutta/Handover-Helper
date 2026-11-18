import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import useLearnSession from "../components/learn/useLearnSession.js";
import { SUGGESTIONS } from "../components/learn/mockLearn.js";
import { fetchLearnDocuments, askLearnQuestion, retryLearnIndex } from "../components/learn/learnApi.js";
import Sources from "../components/learn/Sources.jsx";
import "./Learn.css";

function FileIcon({ type = "DOC" }) {
  return <span className={`learn-file-icon learn-file-${type.toLowerCase()}`} aria-hidden="true">{type}</span>;
}

function AnswerText({ text }) {
  return text.split("\n\n").map((block, index) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*] /.test(line))) {
      return <ul key={index}>{lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>;
    }
    if (lines.every((line) => /^\d+\. /.test(line))) {
      return <ol key={index}>{lines.map((line, item) => <li key={item}>{line.replace(/^\d+\. /, "")}</li>)}</ol>;
    }
    if (/^#{1,3} /.test(block) && lines.length === 1) return <h3 key={index}>{block.replace(/^#{1,3} /, "")}</h3>;
    return <p key={index}>{block}</p>;
  });
}

function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Z" /><path d="M7 12h14" /></svg>;
}

// Exported separately so empty-document and communication failures can be tested without auth or real data.
export function LearnWorkspace({ user, documents = [], respond = askLearnQuestion, loadingDocuments = false, loadingError = "", reloadDocuments, retryIndex, retryingId }) {
  const navigate = useNavigate();
  const { state: arrival } = useLocation();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(documents[0]?.id ?? null);
  const [conversations, setConversations] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState("");
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const request = useRef(null);
  const bottom = useRef(null);
  const composer = useRef(null);
  const document = documents.find((item) => item.id === selectedId);
  const ready = document?.indexing_status === "indexed";
  const messages = conversations[selectedId] ?? [];
  const filtered = documents.filter((item) => item.filename.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    setSelectedId((current) => {
      if (arrival?.documentId && documents.some((item) => item.id === arrival.documentId)) return arrival.documentId;
      if (documents.some((item) => item.id === current)) return current;
      return documents[0]?.id ?? null;
    });
  }, [documents, arrival?.documentId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, pending, selectedId]);

  function selectDocument(id) {
    request.current?.abort();
    request.current = null;
    setSelectedId(id);
    setDraft("");
    setPending(false);
    setError("");
    setDocumentsOpen(false);
  }

  async function submit(event) {
    event?.preventDefault();
    const question = draft.trim();
    if (!ready || !question || question.length > 2000 || request.current) return;
    const documentId = document.id;
    const controller = new AbortController();
    request.current = controller;
    const userMessage = { id: crypto.randomUUID(), role: "user", text: question };
    setConversations((current) => ({ ...current, [documentId]: [...(current[documentId] ?? []), userMessage] }));
    setDraft("");
    setError("");
    setPending(true);
    try {
      const result = await respond(question, documentId, { signal: controller.signal });
      if (controller.signal.aborted || request.current !== controller) return;
      setConversations((current) => ({ ...current, [documentId]: [...(current[documentId] ?? []), {
        id: crypto.randomUUID(), role: "assistant", text: result.answer, sources: result.sources ?? [],
      }] }));
    } catch (failure) {
      if (!controller.signal.aborted && request.current === controller) {
        setError(failure instanceof Error ? failure.message : "Question failed. Please try again.");
        setDraft(question);
      }
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }

  async function signOut() {
    setSigningOut(true);
    setAuthError("");
    try {
      const { error: failure } = await supabase.auth.signOut();
      if (failure) throw failure;
      navigate("/");
    } catch { setAuthError("Could not sign out. Please try again."); }
    finally { setSigningOut(false); }
  }

  return (
    <div className="learn-page">
      <header className="learn-gather-header">
        <div className="learn-gather-brand"><span className="learn-gather-mark" aria-hidden="true" />Handover Helper</div>
        <nav className="learn-gather-nav" aria-label="Main">
          <button type="button" onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button type="button" onClick={() => navigate("/admin")}>Admin</button>
        </nav>
        <div className="learn-gather-user"><span>{user.email}</span><button type="button" className="learn-gather-signout" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button></div>
      </header>
      {authError && <p className="learn-error" role="alert">{authError}</p>}
      <main className="learn-main">
        <div className="learn-title-row"><div><h1>Learn</h1><p>Understand your handover documents with AI.</p></div></div>
        {typeof arrival?.documentId === "string" && typeof arrival?.filename === "string" && (
          <p className="learn-arrival-notice" role="status">You arrived from Gather with {arrival.filename}. Your uploaded document will appear below if you have access. Select it to ask questions when indexing is ready.</p>
        )}
        <ol className="learn-steps" aria-label="Handover steps">
          <li><Link to="/upload"><span className="learn-step-number">1</span><span>Gather</span></Link></li>
          <li aria-current="step"><span className="learn-step-number">2</span><span>Learn</span></li>
          <li><span className="learn-step-number">3</span><span>Close the gaps</span></li>
        </ol>
        <div className="learn-layout">
          <aside className={`learn-sidebar${documentsOpen ? " learn-sidebar-open" : ""}`} aria-label="Document selection">
            <button className="learn-mobile-documents" aria-expanded={documentsOpen} aria-controls="learn-document-panel" onClick={() => setDocumentsOpen(!documentsOpen)}>Your Documents ({documents.length}) <span>{documentsOpen ? "Hide" : "Choose"}</span></button>
            <div className="learn-document-panel" id="learn-document-panel">
              <div className="learn-sidebar-heading"><h2>Your Documents</h2><span>{filtered.length}</span></div>
              <p className="learn-sample-note">Your uploaded documents</p>
              <label className="learn-sr-only" htmlFor="learn-search">Search documents</label>
              <input id="learn-search" type="search" placeholder="Search documents..." value={query} onChange={(event) => setQuery(event.target.value)} />
              {loadingDocuments && <p className="learn-sample-note" role="status">Loading your documents...</p>}
              {loadingError && <div className="learn-error" role="alert">{loadingError} <button type="button" onClick={reloadDocuments}>Retry loading</button></div>}
              <div className="learn-document-list">
                {!documents.length ? <div className="learn-empty-documents"><h3>No documents available.</h3><p>Upload documents to start learning about your handover.</p><Link to="/upload">Go to Upload</Link></div> : !filtered.length ? <p className="learn-no-results">No matching documents. Try another filename.</p> : filtered.map((item) => (
                  <button className={`learn-document${selectedId === item.id ? " is-selected" : ""}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => selectDocument(item.id)}>
                    <FileIcon type={item.type} /><span><strong>{item.filename}</strong><small>{item.indexing_status === "indexed" ? `${item.type} · Ready` : `${item.type} · Not indexed`}</small></span>
                  </button>
                ))}
              </div>
              <Link className="learn-upload-link" to="/upload">Go to Upload <span aria-hidden="true">&#8594;</span></Link>
            </div>
          </aside>
          <section className="learn-chat" aria-label="Handover Assistant">
            <header className="learn-chat-header">
              <h2>Handover Assistant</h2>
              <p>{document ? <><FileIcon type={document.type} /><span>Currently learning from: <strong>{document.filename}</strong></span></> : "Select a document to begin."}</p>
              {document && !ready && <div className="learn-index-warning">
                <span>This document is saved but not indexed for AI yet.</span>
                <button type="button" onClick={() => retryIndex(document.id)} disabled={retryingId === document.id}>
                  {retryingId === document.id ? "Indexing..." : "Retry indexing"}
                </button>
              </div>}
            </header>
            <div className="learn-messages" role="log" aria-label="Conversation" aria-live="polite" aria-busy={pending}>
              {!messages.length && <div className="learn-welcome"><span className="learn-welcome-symbol" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" /></svg></span><h3>What would you like to learn?</h3><p>Select a document and ask questions to understand its content, responsibilities, and next steps.</p><div className="learn-suggestions">{SUGGESTIONS.map(([label, prompt]) => <button key={label} disabled={!ready || pending} onClick={() => { setDraft(prompt); composer.current?.focus(); }}>{label}<span aria-hidden="true">&#8594;</span></button>)}</div><small>Suggestions fill the input. Review your question, then send.</small></div>}
              {messages.map((message) => <article key={message.id} className={`learn-message learn-message-${message.role}`}><span className="learn-message-label">{message.role === "user" ? "You" : "Assistant"}</span><div className="learn-message-body"><AnswerText text={message.text} /></div>{message.role === "assistant" && <Sources sources={message.sources} />}</article>)}
              {pending && <div className="learn-pending" role="status"><span /> Searching redacted content and asking Qwen3...</div>}
              <div ref={bottom} />
            </div>
            <form className="learn-composer" onSubmit={submit}>
              {error && <p className="learn-error" role="alert">{error}</p>}
              <label className="learn-sr-only" htmlFor="learn-question">Question about the selected document</label>
              <div className="learn-composer-controls"><textarea ref={composer} id="learn-question" rows="2" maxLength={2000} placeholder="Ask a question about this document..." value={draft} disabled={!ready || pending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(); }
              }} /><button type="submit" disabled={!ready || !draft.trim() || pending}><SendIcon />Send</button></div>
              <div className="learn-composer-note"><span>Answers use redacted document text. Verify important details.</span><span>{draft.length}/2000 | Shift + Enter for a new line</span></div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function Learn() {
  const session = useLearnSession();
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [revision, setRevision] = useState(0);
  const [retryingId, setRetryingId] = useState(null);

  useEffect(() => {
    if (!session.user) return;
    const controller = new AbortController();
    let active = true;
    setLoadingDocuments(true);
    setLoadingError("");
    fetchLearnDocuments({ signal: controller.signal }).then((items) => {
      if (active) setDocuments(items);
    }).catch((failure) => {
      if (active && !controller.signal.aborted) {
        setLoadingError(failure instanceof Error ? failure.message : "Unable to load documents.");
      }
    }).finally(() => {
      if (active) setLoadingDocuments(false);
    });
    return () => { active = false; controller.abort(); };
  }, [session.user?.id, revision]);

  async function retryIndex(documentId) {
    setRetryingId(documentId);
    setLoadingError("");
    try {
      await retryLearnIndex(documentId);
      setRevision((current) => current + 1);
    } catch (failure) {
      setLoadingError(failure instanceof Error ? failure.message : "Indexing failed.");
    } finally {
      setRetryingId(null);
    }
  }

  if (session.checking) return <div className="learn-page learn-session" role="status">Checking your session...</div>;
  if (session.error) return <div className="learn-page learn-session"><p role="alert">Unable to check your session.</p><Link to="/login">Go to Login</Link></div>;
  if (!session.user) return <Navigate to="/login" replace />;
  return (
    <LearnWorkspace
      user={session.user}
      documents={documents}
      respond={askLearnQuestion}
      loadingDocuments={loadingDocuments}
      loadingError={loadingError}
      reloadDocuments={() => setRevision((value) => value + 1)}
      retryIndex={retryIndex}
      retryingId={retryingId}
    />
  );
}
