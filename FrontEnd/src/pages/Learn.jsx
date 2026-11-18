import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import useLearnSession from "../components/learn/useLearnSession.js";
import { MOCK_DOCUMENTS, SUGGESTIONS, getMockLearnResponse } from "../components/learn/mockLearn.js";
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
export function LearnWorkspace({ user, documents = MOCK_DOCUMENTS, respond = getMockLearnResponse }) {
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
  const messages = conversations[selectedId] ?? [];
  const filtered = documents.filter((item) => item.filename.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => () => request.current?.abort(), []);
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
    if (!document || !question || question.length > 2000 || request.current) return;
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
    } catch {
      if (!controller.signal.aborted && request.current === controller) {
        setError("Your question could not be submitted. Your question has been restored; please try again.");
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
          <p className="learn-arrival-notice" role="status">You arrived from Gather with {arrival.filename}. Live document loading is not connected yet. The documents and responses below are development samples; your uploaded document has not been added to this list.</p>
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
              <p className="learn-sample-note">Fictional development samples</p>
              <label className="learn-sr-only" htmlFor="learn-search">Search documents</label>
              <input id="learn-search" type="search" placeholder="Search documents..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="learn-document-list">
                {!documents.length ? <div className="learn-empty-documents"><h3>No documents available.</h3><p>Upload documents to start learning about your handover.</p><Link to="/upload">Go to Upload</Link></div> : !filtered.length ? <p className="learn-no-results">No matching documents. Try another filename.</p> : filtered.map((item) => (
                  <button className={`learn-document${selectedId === item.id ? " is-selected" : ""}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => selectDocument(item.id)}>
                    <FileIcon type={item.type} /><span><strong>{item.filename}</strong><small>{item.type} document</small></span>
                  </button>
                ))}
              </div>
              <Link className="learn-upload-link" to="/upload">Go to Upload <span aria-hidden="true">&#8594;</span></Link>
            </div>
          </aside>
          <section className="learn-chat" aria-label="Handover Assistant">
            <header className="learn-chat-header"><h2>Handover Assistant</h2><p>{document ? <><FileIcon type={document.type} /><span>Currently learning from: <strong>{document.filename}</strong></span></> : "Select a document to begin."}</p></header>
            <div className="learn-messages" role="log" aria-label="Conversation" aria-live="polite" aria-busy={pending}>
              {!messages.length && <div className="learn-welcome"><span className="learn-welcome-symbol" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" /></svg></span><h3>What would you like to learn?</h3><p>Select a document and ask questions to understand its content, responsibilities, and next steps.</p><div className="learn-suggestions">{SUGGESTIONS.map(([label, prompt]) => <button key={label} disabled={!document || pending} onClick={() => { setDraft(prompt); composer.current?.focus(); }}>{label}<span aria-hidden="true">&#8594;</span></button>)}</div><small>Suggestions fill the input. Review your question, then send.</small></div>}
              {messages.map((message) => <article key={message.id} className={`learn-message learn-message-${message.role}`}><span className="learn-message-label">{message.role === "user" ? "You" : "Assistant - Demo response"}</span><div className="learn-message-body"><AnswerText text={message.text} /></div>{message.role === "assistant" && <Sources sources={message.sources} />}</article>)}
              {pending && <div className="learn-pending" role="status"><span /> Preparing a demonstration response...</div>}
              <div ref={bottom} />
            </div>
            <form className="learn-composer" onSubmit={submit}>
              {error && <p className="learn-error" role="alert">{error}</p>}
              <label className="learn-sr-only" htmlFor="learn-question">Question about the selected document</label>
              <div className="learn-composer-controls"><textarea ref={composer} id="learn-question" rows="2" maxLength={2000} placeholder="Ask a question about this document..." value={draft} disabled={!document || pending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(); }
              }} /><button type="submit" disabled={!document || !draft.trim() || pending}><SendIcon />Send</button></div>
              <div className="learn-composer-note"><span>Frontend prototype: sample documents only. Live AI is not connected.</span><span>{draft.length}/2000 | Shift + Enter for a new line</span></div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function Learn() {
  const session = useLearnSession();
  if (session.checking) return <div className="learn-page learn-session" role="status">Checking your session...</div>;
  if (session.error) return <div className="learn-page learn-session"><p role="alert">Unable to check your session.</p><Link to="/login">Go to Login</Link></div>;
  if (!session.user) return <Navigate to="/login" replace />;
  return <LearnWorkspace user={session.user} />;
}
