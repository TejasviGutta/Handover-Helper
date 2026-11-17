import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { handoverApi } from "../lib/handoverApi.js";
import {
  ApiUnavailableError,
  createQuiz,
  generateQuiz,
  getQuiz,
  listQuizzes,
  updateQuiz,
} from "../lib/quizApi.js";
import "../styles/dashboard.css";
import "../styles/admin.css";
import "../styles/create-quiz.css";

const DOCUMENTS = [
  "Client_Status_Report.pdf",
  "Project_Timeline.xlsx",
  "Handover_Guide.pdf",
];

const SAMPLE_QUESTIONS = [
  {
    prompt: "Where should the incoming team member check current project milestones?",
    options: [
      "Project timeline",
      "Personal notes",
      "Archived invoices",
      "Public website",
    ],
    correct: 0,
  },
  {
    prompt: "What should happen when a handover guide is missing an important detail?",
    options: [
      "Skip the topic",
      "Ask the departing team member and update the guide",
      "Assume the answer",
      "Wait until the project ends",
    ],
    correct: 1,
  },
  {
    prompt: "Which information helps the next person continue unfinished work?",
    options: [
      "Only the project name",
      "Only completed tasks",
      "Current status, next steps, and responsible contacts",
      "Unrelated documents",
    ],
    correct: 2,
  },
];

const DRAFT_KEY = "handover-helper-quiz-draft";

const DIFFICULTY_TO_API = {
  Foundational: "foundational",
  Balanced: "balanced",
  "In depth": "in_depth",
};

const DIFFICULTY_FROM_API = Object.fromEntries(
  Object.entries(DIFFICULTY_TO_API).map(([label, value]) => [value, label]),
);

// The backend only builds questions from documents that were already redacted.
const USABLE_DOCUMENT_STATUSES = ["redacted", "in_review", "approved"];

const DEMO_SOURCE_OPTIONS = DOCUMENTS.map((file) => ({ key: file, label: file }));

function createId() {
  return crypto.randomUUID();
}

function blankQuestion() {
  return {
    id: createId(),
    prompt: "",
    options: ["", "", "", ""],
    correct: 0,
    is_ai_generated: false,
  };
}

// Converts an editor question into the shared API question shape.
function toApiQuestion(question) {
  return {
    prompt: question.prompt,
    options: question.options,
    correct: question.correct,
    explanation: question.explanation ?? null,
    source_chunk_ids: question.source_chunk_ids ?? [],
    is_ai_generated: question.is_ai_generated ?? false,
  };
}

// Converts an API question into an editor question with a local id.
function fromApiQuestion(question, isAiGenerated) {
  return {
    prompt: question.prompt,
    options: [...question.options],
    correct: question.correct,
    explanation: question.explanation ?? null,
    source_chunk_ids: question.source_chunk_ids ?? [],
    is_ai_generated: isAiGenerated ?? question.is_ai_generated ?? true,
    id: createId(),
  };
}

function isValidQuestion(question) {
  return (
    question &&
    typeof question.prompt === "string" &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    question.options.every((option) => typeof option === "string") &&
    Number.isInteger(question.correct) &&
    question.correct >= 0 &&
    question.correct < 4
  );
}

export default function CreateQuiz() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handoverId = searchParams.get("handover") ?? "";
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("Project handover · Knowledge check");
  const [sources, setSources] = useState(DOCUMENTS.slice(0, 2));
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("Balanced");
  const [questions, setQuestions] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  // Handovers visible to the user, or [] when they could not be loaded.
  const [handovers, setHandovers] = useState([]);
  // Documents loaded for a handover. documents is null when using demo files.
  const [loadedDocs, setLoadedDocs] = useState({ handoverId: "", documents: null });
  // Quiz saved on the server for a handover, so later saves update it.
  const [savedQuiz, setSavedQuiz] = useState({ handoverId: "", id: null });
  // Which server action is running: "generate", "save", "restore" or null.
  const [busy, setBusy] = useState(null);

  // Values tied to an older handover selection are ignored.
  const documents = loadedDocs.handoverId === handoverId ? loadedDocs.documents : null;
  const documentsLoading = Boolean(handoverId) && loadedDocs.handoverId !== handoverId;
  const quizId = savedQuiz.handoverId === handoverId ? savedQuiz.id : null;
  const setQuizId = (id) => setSavedQuiz({ handoverId, id });

  const backendMode = Boolean(handoverId) && documents !== null;
  const sourceOptions = backendMode
    ? documents.map((doc) => ({ key: doc.id, label: doc.original_name || "Untitled document" }))
    : DEMO_SOURCE_OPTIONS;

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    handoverApi("/handovers", { signal: controller.signal })
      .then((rows) => {
        if (!controller.signal.aborted) setHandovers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // Without a handover list the page keeps working with demo files.
        if (!controller.signal.aborted) setHandovers([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!handoverId) return undefined;
    let active = true;

    // Same direct read as the Admin page; row level security applies here.
    supabase
      .from("documents")
      .select("id, original_name, status")
      .eq("handover_id", handoverId)
      .order("original_name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadedDocs({ handoverId, documents: null });
          setSources(DOCUMENTS.slice(0, 2));
          setMessage("Documents for this handover could not be loaded. Showing demo files instead.");
          return;
        }
        const usable = (data ?? []).filter((doc) =>
          USABLE_DOCUMENT_STATUSES.includes(doc.status),
        );
        setLoadedDocs({ handoverId, documents: usable });
        setSources(usable.map((doc) => doc.id));
      });
    return () => {
      active = false;
    };
  }, [handoverId]);

  const quizIsValid = useMemo(
    () =>
      Boolean(title.trim()) &&
      questions.length > 0 &&
      questions.every(
        (question) =>
          question.prompt.trim() &&
          question.options.every((option) => option.trim()),
      ),
    [questions, title],
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  function toggleSource(file) {
    setSources((current) =>
      current.includes(file)
        ? current.filter((source) => source !== file)
        : [...current, file],
    );
  }

  function updateQuestion(id, patch) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    );
  }

  function selectHandover(nextId) {
    setSearchParams(nextId ? { handover: nextId } : {}, { replace: true });
    setSources(nextId ? [] : DOCUMENTS.slice(0, 2));
    setMessage("");
  }

  // Picks the message for a failed server call in handover mode.
  function serverErrorMessage(error, { unreachable, fallback }) {
    if (error instanceof ApiUnavailableError) return unreachable;
    return error?.detail ?? fallback;
  }

  function loadSampleQuestions() {
    setQuestions(
      Array.from({ length: questionCount }, (_, index) => {
        const sample = SAMPLE_QUESTIONS[index % SAMPLE_QUESTIONS.length];
        return {
          ...sample,
          options: [...sample.options],
          is_ai_generated: false,
          id: createId(),
        };
      }),
    );
    setMessage(
      "Sample questions loaded. They repeat for layout testing and are not generated from your documents.",
    );
  }

  async function loadQuestions() {
    if (!backendMode) {
      loadSampleQuestions();
      return;
    }

    setBusy("generate");
    setMessage("Generating questions from the selected documents…");
    try {
      const result = await generateQuiz({
        handoverId,
        documentIds: sources,
        numQuestions: questionCount,
        difficulty: DIFFICULTY_TO_API[difficulty],
      });
      setQuestions(result.questions.map((question) => fromApiQuestion(question, true)));
      setMessage(
        result.generated < result.requested
          ? `${result.generated} of ${result.requested} questions were generated. Add the rest yourself or try again.`
          : `${result.generated} questions generated. Review them before sharing.`,
      );
    } catch (error) {
      // Keep the current questions; never swap in sample questions here.
      setMessage(
        serverErrorMessage(error, {
          unreachable:
            "The quiz service is not reachable. Make sure the backend is running and try again.",
          fallback: "Could not generate questions. Please try again.",
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  function saveLocalDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title,
          sources,
          questionCount,
          difficulty,
          questions,
        }),
      );
      setMessage("Draft saved in this browser.");
    } catch {
      setMessage("The draft could not be saved. Download a copy instead.");
    }
  }

  async function saveDraft() {
    if (!backendMode) {
      saveLocalDraft();
      return;
    }

    const payload = {
      title,
      status: "draft",
      difficulty: DIFFICULTY_TO_API[difficulty],
      document_ids: sources,
      questions: questions.map(toApiQuestion),
    };

    setBusy("save");
    setMessage("Saving draft…");
    try {
      const saved = quizId
        ? await updateQuiz(quizId, payload)
        : await createQuiz({ ...payload, handover_id: handoverId });
      setQuizId(saved.id);
      setMessage("Draft saved to your account.");
    } catch (error) {
      // No localStorage fallback here: the user must know the account save failed.
      if (error?.status === 404 && quizId) {
        setQuizId(null);
        setMessage("The saved draft no longer exists. Save again to create a new one.");
      } else {
        setMessage(
          serverErrorMessage(error, {
            unreachable:
              "The quiz service is not reachable, so the draft was not saved to your account. Make sure the backend is running and try again.",
            fallback: "The draft could not be saved. Please try again.",
          }),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function restoreDraft() {
    if (!backendMode) {
      restoreLocalDraft();
      return;
    }

    setBusy("restore");
    setMessage("Looking for your latest draft…");
    try {
      const quizzes = await listQuizzes(handoverId);
      const latest = quizzes.find((quiz) => quiz.status === "draft");
      if (!latest) {
        setMessage("No saved draft was found for this handover.");
        return;
      }

      const quiz = await getQuiz(latest.id);
      const knownIds = new Set(documents.map((doc) => doc.id));
      setTitle(quiz.title);
      setDifficulty(DIFFICULTY_FROM_API[quiz.difficulty] ?? "Balanced");
      setSources(quiz.document_ids.filter((id) => knownIds.has(id)));
      setQuestions(quiz.questions.map((question) => fromApiQuestion(question)));
      setQuizId(quiz.id);
      setMessage("Saved draft restored.");
    } catch (error) {
      // No localStorage fallback here; keep the current editor content.
      setMessage(
        serverErrorMessage(error, {
          unreachable:
            "The quiz service is not reachable, so the saved draft could not be loaded. Make sure the backend is running and try again.",
          fallback: "The saved draft could not be loaded. Please try again.",
        }),
      );
    } finally {
      setBusy(null);
    }
  }

  function restoreLocalDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setMessage("No saved draft was found in this browser.");
        return;
      }

      const draft = JSON.parse(raw);
      if (
        typeof draft.title !== "string" ||
        !Array.isArray(draft.questions) ||
        !draft.questions.every(isValidQuestion)
      ) {
        throw new Error("Invalid draft");
      }

      setTitle(draft.title);
      const knownSources = new Set(sourceOptions.map((option) => option.key));
      setSources(
        Array.isArray(draft.sources)
          ? draft.sources.filter((source) => knownSources.has(source))
          : [],
      );
      setQuestionCount(
        [3, 5, 10].includes(draft.questionCount) ? draft.questionCount : 10,
      );
      setDifficulty(
        ["Foundational", "Balanced", "In depth"].includes(draft.difficulty)
          ? draft.difficulty
          : "Balanced",
      );
      setQuestions(
        draft.questions.map((question) => ({
          ...question,
          id: createId(),
        })),
      );
      setMessage("Saved draft restored from this browser.");
    } catch {
      setMessage("The saved draft could not be restored.");
    }
  }

  function downloadQuiz() {
    const payload = JSON.stringify(
      { title, sources, difficulty, questions },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "handover-quiz.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openPreview() {
    setAnswers({});
    setSubmitted(false);
    setPreviewMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const score = questions.filter(
    (question) => answers[question.id] === question.correct,
  ).length;

  return (
    <div className="dash-shell admin-shell cq-shell">
      <header className="dash-top">
        <Link className="dash-brand cq-brand" to="/dashboard">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </Link>
        <nav className="admin-nav cq-nav" aria-label="Main">
          <button type="button" onClick={() => navigate("/dashboard")}>Dashboard</button>
        </nav>
        <div className="dash-user">
          <span>{email}</span>
          <button type="button" className="dash-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dash-main admin-main cq-main">
        <h1>{previewMode ? "Preview your quiz" : "Create a knowledge check"}</h1>
        <p className="dash-sub">
          {previewMode ? "Answer the questions and check your score." : "Build a quiz to help the incoming team member take over."}
        </p>
        {!previewMode && (
          <ol className="cq-steps" aria-label="Handover steps">
            <li><span aria-hidden="true">1</span>Gather</li>
            <li aria-current="step"><span aria-hidden="true">2</span>Learn</li>
            <li><span aria-hidden="true">3</span>Close the gaps</li>
          </ol>
        )}
        <div className="cq-status" role="status" aria-live="polite">
          {message}
        </div>

        {previewMode ? (
          <div className="cq-preview">
            <div className="dash-card cq-section-head cq-preview-head">
              <h2>{title}</h2>
              <button type="button" onClick={() => setPreviewMode(false)}>
                Back to editor
              </button>
            </div>

            {questions.map((question, index) => (
              <section className="dash-card cq-card" key={question.id}>
                <h3>{index + 1}. {question.prompt}</h3>
                <fieldset>
                  <legend className="cq-sr-only">
                    Answer for question {index + 1}
                  </legend>
                  {question.options.map((option, optionIndex) => (
                    <label className="cq-answer" key={option}>
                      <input
                        type="radio"
                        name={`answer-${question.id}`}
                        checked={answers[question.id] === optionIndex}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: optionIndex,
                          }))
                        }
                        disabled={submitted}
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
                {submitted && (
                  <p className="cq-feedback">
                    {answers[question.id] === question.correct
                      ? "Correct"
                      : `Review this topic. Correct answer: ${question.options[question.correct]}`}
                  </p>
                )}
              </section>
            ))}

            {submitted ? (
              <div className="cq-result" role="status">
                <strong>You scored {score} / {questions.length}.</strong>
                <span>Use missed topics to guide your handover questions.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setAnswers({});
                  }}
                >
                  Try again
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="cq-primary"
                disabled={Object.keys(answers).length !== questions.length}
                onClick={() => setSubmitted(true)}
              >
                Check answers
              </button>
            )}
          </div>
        ) : (
          <div className="cq-layout">
            <div>
              <section className="dash-card cq-card">
                <div className="cq-section-head">
                  <h2>Quiz details</h2>
                </div>

                {handovers.length > 0 && (
                  <>
                    <label htmlFor="quiz-handover">Handover</label>
                    <select
                      id="quiz-handover"
                      value={handoverId}
                      disabled={Boolean(busy)}
                      onChange={(event) => selectHandover(event.target.value)}
                    >
                      <option value="">Demo files (no handover)</option>
                      {handovers.map((handover) => (
                        <option key={handover.id} value={handover.id}>
                          {handover.project_name}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <label htmlFor="quiz-title">Quiz title</label>
                <input
                  id="quiz-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />

                <fieldset className="cq-sources">
                  <legend>
                    Source documents{" "}
                    <span>· {backendMode ? "ready for quizzes" : "demo files"}</span>
                  </legend>
                  {documentsLoading && <small>Loading documents…</small>}
                  {backendMode && !documentsLoading && !sourceOptions.length && (
                    <small>No redacted documents in this handover yet.</small>
                  )}
                  {sourceOptions.map((option) => (
                    <label key={option.key}>
                      <input
                        type="checkbox"
                        checked={sources.includes(option.key)}
                        disabled={Boolean(busy)}
                        onChange={() => toggleSource(option.key)}
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>

                <div className="cq-settings">
                  <div>
                    <label htmlFor="question-count">Number of questions</label>
                    <select
                      id="question-count"
                      value={questionCount}
                      onChange={(event) =>
                        setQuestionCount(Number(event.target.value))
                      }
                    >
                      {[3, 5, 10].map((count) => (
                        <option key={count}>{count}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="difficulty">Difficulty</label>
                    <select
                      id="difficulty"
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                    >
                      {["Foundational", "Balanced", "In depth"].map((level) => (
                        <option key={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="cq-generate">
                  <small>
                    {backendMode
                      ? "Questions are generated from the selected documents and replace your current questions."
                      : "Sample questions use example content and replace your current questions."}
                  </small>
                  <button
                    type="button"
                    className="cq-primary"
                    disabled={!sources.length || Boolean(busy)}
                    aria-busy={busy === "generate"}
                    onClick={loadQuestions}
                  >
                    {busy === "generate"
                      ? "Generating…"
                      : backendMode
                        ? "Generate questions ↗"
                        : "Load sample questions ↗"}
                  </button>
                </div>
              </section>

              <section>
                <div className="cq-section-head cq-question-heading">
                  <h2>Questions <span className="dash-tag">{questions.length}</span></h2>
                  <button
                    type="button"
                    onClick={() => setQuestions((current) => [...current, blankQuestion()])}
                  >
                    + Add question
                  </button>
                </div>

                {!questions.length && (
                  <div className="dash-card cq-card cq-empty">
                    <h3>No questions yet</h3>
                    <p>Load sample questions or add your own.</p>
                  </div>
                )}

                {questions.map((question, questionIndex) => (
                  <article className="dash-card cq-card" key={question.id}>
                    <div className="cq-section-head">
                      <h3>Question {questionIndex + 1}</h3>
                      <button
                        type="button"
                        className="cq-remove"
                        onClick={() =>
                          setQuestions((current) =>
                            current.filter((item) => item.id !== question.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>

                    <label htmlFor={`prompt-${question.id}`}>Question text</label>
                    <textarea
                      id={`prompt-${question.id}`}
                      value={question.prompt}
                      placeholder="What should the incoming team member know?"
                      onChange={(event) =>
                        updateQuestion(question.id, { prompt: event.target.value })
                      }
                    />

                    <fieldset>
                      <legend>Answer options <span>· select the correct answer</span></legend>
                      {question.options.map((option, optionIndex) => (
                        <div
                          className={`cq-option ${
                            question.correct === optionIndex ? "cq-correct" : ""
                          }`}
                          key={`${question.id}-${optionIndex}`}
                        >
                          <input
                            type="radio"
                            name={`correct-${question.id}`}
                            aria-label={`Mark option ${optionIndex + 1} as correct`}
                            checked={question.correct === optionIndex}
                            onChange={() =>
                              updateQuestion(question.id, { correct: optionIndex })
                            }
                          />
                          <span>{String.fromCharCode(65 + optionIndex)}</span>
                          <input
                            aria-label={`Question ${questionIndex + 1}, option ${optionIndex + 1}`}
                            value={option}
                            placeholder={`Answer option ${optionIndex + 1}`}
                            onChange={(event) =>
                              updateQuestion(question.id, {
                                options: question.options.map((current, index) =>
                                  index === optionIndex ? event.target.value : current,
                                ),
                              })
                            }
                          />
                          {question.correct === optionIndex && <small>Correct</small>}
                        </div>
                      ))}
                    </fieldset>
                  </article>
                ))}
              </section>

              <footer className="dash-card cq-actions">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  aria-busy={busy === "save"}
                  onClick={saveDraft}
                >
                  {busy === "save" ? "Saving…" : "Save draft"}
                </button>
                <button type="button" disabled={!quizIsValid} onClick={downloadQuiz}>
                  Download quiz
                </button>
                <button
                  type="button"
                  className="cq-primary"
                  disabled={!quizIsValid}
                  onClick={openPreview}
                >
                  Preview quiz →
                </button>
              </footer>

              {!quizIsValid && questions.length > 0 && (
                <p className="cq-hint">
                  Enter a quiz title and fill in every question and answer to
                  preview or download.
                </p>
              )}
            </div>

            <aside>
              <section className="dash-card cq-card cq-sidebar">
                <h2>Quiz summary</h2>
                <div className="cq-summary">
                  <span>Selected documents <b>{sources.length}</b></span>
                  <span>Questions added <b>{questions.length}</b></span>
                  <span>Format <b>Multiple choice</b></span>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  aria-busy={busy === "restore"}
                  onClick={restoreDraft}
                >
                  {busy === "restore" ? "Restoring…" : "Restore saved draft"}
                </button>
                <p className="cq-private">
                  {backendMode
                    ? "Drafts are saved to your account for this handover. Download the quiz to share it."
                    : "Drafts stay in this browser. Download the quiz to share it."}
                </p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
