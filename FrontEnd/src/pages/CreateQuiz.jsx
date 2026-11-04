import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
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

function createId() {
  return crypto.randomUUID();
}

function blankQuestion() {
  return {
    id: createId(),
    prompt: "",
    options: ["", "", "", ""],
    correct: 0,
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

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

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

  function loadSampleQuestions() {
    setQuestions(
      Array.from({ length: questionCount }, (_, index) => {
        const sample = SAMPLE_QUESTIONS[index % SAMPLE_QUESTIONS.length];
        return {
          ...sample,
          options: [...sample.options],
          id: createId(),
        };
      }),
    );
    setMessage(
      "Sample questions loaded. They repeat for layout testing and are not generated from your documents.",
    );
  }

  function saveDraft() {
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

  function restoreDraft() {
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
      setSources(
        Array.isArray(draft.sources)
          ? draft.sources.filter((source) => DOCUMENTS.includes(source))
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
      setMessage("Saved draft restored.");
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
    <div className="cq-shell">
      <header className="cq-top">
        <Link className="cq-brand" to="/dashboard">
          <span className="cq-mark" aria-hidden="true" />
          Handover Helper
        </Link>
        <div className="cq-user">
          <span>{email}</span>
          <button type="button" className="cq-sign-out" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="cq-main">
        <nav className="cq-steps" aria-label="Handover progress">
          <span>✓ <b>Gather</b></span>
          <span className="cq-active" aria-current="step">2 <b>Learn</b></span>
          <span>3 <b>Close the gaps</b></span>
        </nav>

        <section className="cq-hero">
          <p>KNOWLEDGE TRANSFER</p>
          <h1>{previewMode ? "Preview your quiz" : "Create a knowledge check"}</h1>
          <div>
            Help the next person understand the work, spot gaps, and feel ready
            to take over.
          </div>
        </section>

        <div className="cq-demo">
          <strong>Frontend demo</strong> · Source files are examples. AI question
          generation and team sharing will be connected later.
        </div>
        <div className="cq-status" role="status" aria-live="polite">
          {message}
        </div>

        {previewMode ? (
          <main className="cq-preview">
            <div className="cq-section-head cq-preview-head">
              <div>
                <p className="cq-eyebrow">LEARNER VIEW</p>
                <h2>{title}</h2>
              </div>
              <button type="button" onClick={() => setPreviewMode(false)}>
                Back to editor
              </button>
            </div>

            {questions.map((question, index) => (
              <section className="cq-card" key={question.id}>
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
          </main>
        ) : (
          <main className="cq-layout">
            <div>
              <section className="cq-card">
                <div className="cq-section-head">
                  <h2>Quiz details</h2>
                  <span className="cq-tag">Draft</span>
                </div>

                <label htmlFor="quiz-title">Quiz title</label>
                <input
                  id="quiz-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />

                <fieldset className="cq-sources">
                  <legend>Source documents <span>· demo files</span></legend>
                  {DOCUMENTS.map((file) => (
                    <label key={file}>
                      <input
                        type="checkbox"
                        checked={sources.includes(file)}
                        onChange={() => toggleSource(file)}
                      />
                      <span className="cq-file-icon" aria-hidden="true">▤</span>
                      {file}
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
                    Demo questions let you try the editor. Loading replaces
                    current questions.
                  </small>
                  <button
                    type="button"
                    className="cq-primary"
                    disabled={!sources.length}
                    onClick={loadSampleQuestions}
                  >
                    Load sample questions ↗
                  </button>
                </div>
              </section>

              <section>
                <div className="cq-section-head cq-question-heading">
                  <h2>Questions <span className="cq-tag">{questions.length}</span></h2>
                  <button
                    type="button"
                    onClick={() => setQuestions((current) => [...current, blankQuestion()])}
                  >
                    + Add question
                  </button>
                </div>

                {!questions.length && (
                  <div className="cq-empty">
                    <span aria-hidden="true">▤</span>
                    <h3>Your knowledge check starts here</h3>
                    <p>
                      Load sample questions or add your own.<br />
                      You can edit every question and answer.
                    </p>
                  </div>
                )}

                {questions.map((question, questionIndex) => (
                  <article className="cq-card" key={question.id}>
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

              <footer className="cq-actions">
                <button type="button" onClick={saveDraft}>Save draft</button>
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
              <section className="cq-card cq-sidebar">
                <p className="cq-eyebrow">A BETTER HANDOVER</p>
                <h2>Test what matters</h2>
                <p>Focus on the knowledge someone needs to continue the work.</p>
                <ul>
                  <li>Unfinished work &amp; next steps</li>
                  <li>Key contacts &amp; approvals</li>
                  <li>Known problems &amp; workarounds</li>
                  <li>Why past decisions were made</li>
                </ul>
                <hr />
                <h3>Review before sharing</h3>
                <p>
                  Check each answer against the handover guide. Remove anything
                  unclear or outdated.
                </p>
                <div className="cq-summary">
                  <span>Selected documents <b>{sources.length}</b></span>
                  <span>Questions added <b>{questions.length}</b></span>
                  <span>Format <b>Multiple choice</b></span>
                </div>
                <button type="button" onClick={restoreDraft}>
                  Restore saved draft
                </button>
              </section>
              <p className="cq-private">
                Drafts stay in this browser. Download a copy to share with your
                team.
              </p>
            </aside>
          </main>
        )}
      </div>
    </div>
  );
}
