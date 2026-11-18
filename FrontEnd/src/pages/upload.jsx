
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { supabase } from "../lib/supabaseClient.js";

import "../styles/dashboard.css";
import "../styles/admin.css";
import "./upload.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const projects = [
  { id: "proj-1", name: "Client portal redesign" },
  { id: "proj-2", name: "Billing system migration" },
  { id: "proj-3", name: "Data warehouse rollout" },
];

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
};

const STEPS = ["Gather", "Learn", "Close the gaps"];
const currentStep = 1;

const PULLED_ITEMS = [
  "Unfinished work",
  "Key contacts",
  "Known problems",
  "Why past decisions were made",
];

const STATUS_STYLES = {
  uploading: {
    label: "Uploading",
    className: "bg-gray-100 text-gray-700",
  },
  uploaded: {
    label: "Uploaded",
    className: "bg-gray-100 text-gray-700",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-50 text-blue-700",
  },
  done: {
    label: "Ready",
    className: "bg-green-50 text-green-700",
  },
  index_failed: {
    label: "Not indexed",
    className: "bg-amber-50 text-amber-800",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700",
  },
};

function rejectionMessage(rejection) {
  const codes = rejection.errors.map((error) => error.code);

  if (codes.includes("file-invalid-type")) {
    return "File type not supported";
  }

  if (codes.includes("file-too-large")) {
    return "File is too large (20 MB max)";
  }

  return "This file can't be added";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  const labels = {
    pdf: "PDF",
    docx: "Word",
    xlsx: "Excel",
    csv: "CSV",
    txt: "Text",
  };

  return labels[ext] ?? (ext ? ext.toUpperCase() : "Unknown");
}

function DocIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function UploadIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function StepTracker() {
  return (
    <ol
      aria-label="Handover steps"
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {STEPS.map((label, index) => {
        const number = index + 1;
        const isCurrent = number === currentStep;

        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs sm:justify-start sm:px-3 sm:text-sm ${
              isCurrent
                ? "bg-brand-red font-medium text-white shadow-sm"
                : "bg-white text-gray-600 shadow-sm"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                isCurrent
                  ? "bg-white/20 text-white"
                  : "bg-red-50 text-brand-red"
              }`}
            >
              {number}
            </span>
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [generateClicked, setGenerateClicked] = useState(false);

  const uploadsRef = useRef(new Map());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  const doneCount = files.filter(
    (item) => item.status === "done"
  ).length;

  const canGenerate = projectId !== "" && doneCount > 0;

  // Placeholder until real guide extraction is connected.
  const checkedCount = 0;

  let generateHint = "";

  if (projectId === "") {
    generateHint = "Pick a project to continue.";
  } else if (doneCount === 0) {
    generateHint = "Upload and index at least one file to continue.";
  }

  function updateFile(id, changes) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      )
    );
  }

  async function startUpload(item) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      updateFile(item.id, {
        status: "failed",
        error: "Please sign in to upload files.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", item.file);

    const xhr = new XMLHttpRequest();
    uploadsRef.current.set(item.id, xhr);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        updateFile(item.id, {
          progress: Math.round(
            (event.loaded / event.total) * 100
          ),
        });
      }
    };

    xhr.upload.onload = () => {
      updateFile(item.id, {
        progress: 100,
        status: "processing",
      });
    };

    xhr.onload = () => {
      uploadsRef.current.delete(item.id);

      let body = null;

      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }

      if (xhr.status === 201) {
        const indexed = body?.indexing_status === "indexed";
        const documentId = body?.document?.id;

        updateFile(item.id, {
          progress: 100,
          status:
            indexed && documentId
              ? "done"
              : "index_failed",
          documentId,
          indexingStatus: body?.indexing_status,
          error:
            indexed && documentId
              ? null
              : "Document saved, but AI indexing is not ready. Learn is unavailable.",
        });
      } else {
        updateFile(item.id, {
          status: "failed",
          error:
            typeof body?.detail === "string"
              ? body.detail
              : "Upload failed. Please try again.",
        });
      }
    };

    xhr.onerror = () => {
      uploadsRef.current.delete(item.id);

      updateFile(item.id, {
        status: "failed",
        error:
          "Couldn't reach the server. Check your connection and try again.",
      });
    };

    xhr.open("POST", `${API_URL}/files/upload`);
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${token}`
    );
    xhr.send(formData);
  }

  function onDrop(acceptedFiles, rejectedFiles) {
    const goodItems = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: "uploading",
    }));

    setFiles((current) => [...current, ...goodItems]);

    goodItems.forEach((item) => startUpload(item));

    setBlocked(
      rejectedFiles.map((rejection) => ({
        id: crypto.randomUUID(),
        name: rejection.file.name,
        message: rejectionMessage(rejection),
      }))
    );
  }

  function removeFile(id) {
    const xhr = uploadsRef.current.get(id);

    if (xhr) {
      xhr.abort();
      uploadsRef.current.delete(id);
    }

    setFiles((current) =>
      current.filter((item) => item.id !== id)
    );
  }

  function handleGenerate() {
    setGenerateClicked(true);
  }

  const {
    getRootProps,
    getInputProps,
    isDragActive,
  } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
  });

  return (
    <div className="dash-shell admin-shell upload-page">
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </div>

        <nav className="admin-nav" aria-label="Main">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => navigate("/admin")}
          >
            Admin
          </button>
        </nav>

        <div className="dash-user">
          <span>{email}</span>

          <button
            type="button"
            className="dash-btn"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          Gather your work
        </h1>

        <p className="mt-2 text-sm text-white/80 sm:text-base">
          Upload the files your replacement will need.
          We'll turn them into a handover guide.
        </p>

        <div className="mt-6">
          <StepTracker />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
            <div>
              <label
                htmlFor="project"
                className="block text-sm font-medium text-gray-900"
              >
                Project
              </label>

              <select
                id="project"
                value={projectId}
                onChange={(e) =>
                  setProjectId(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                <option value="" disabled>
                  Select a project
                </option>

                {projects.map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              {...getRootProps()}
              className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                isDragActive
                  ? "border-brand-red bg-red-50"
                  : "border-gray-300 bg-gray-50 hover:border-red-300"
              }`}
            >
              <input {...getInputProps()} />

              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-brand-red">
                <UploadIcon className="h-5 w-5" />
              </div>

              <p className="mt-4 font-medium text-gray-900">
                {isDragActive
                  ? "Drop your files here"
                  : "Hand off your work. Drop files here or click to browse."}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                PDF, Word (.docx), Excel (.xlsx), CSV,
                or text (.txt). 20 MB max per file.
              </p>
            </div>

            {blocked.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
                <p className="text-sm font-medium text-red-800">
                  Some files weren't added:
                </p>

                <ul className="mt-1 space-y-1">
                  {blocked.map((item) => (
                    <li
                      key={item.id}
                      className="text-sm text-red-700"
                    >
                      {item.name}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-8">
                <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  Files

                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-brand-red">
                    {files.length}
                  </span>
                </h2>

                <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
                  {files.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-brand-red">
                          <DocIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {item.file.name}
                          </p>

                          <p className="text-sm text-gray-500">
                            {formatSize(item.file.size)} ·{" "}
                            {fileTypeLabel(item.file.name)}
                          </p>

                          {item.error && (
                            <p className="mt-1 text-sm text-red-600">
                              {item.error}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                          <p className="text-right text-xs text-gray-500">
                            {item.progress}%
                          </p>

                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                item.status === "failed"
                                  ? "bg-red-500"
                                  : item.status === "index_failed"
                                    ? "bg-amber-500"
                                    : "bg-brand-red"
                              }`}
                              style={{
                                width: `${item.progress}%`,
                              }}
                            />
                          </div>
                        </div>

                        <span
                          className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-medium ${
                            STATUS_STYLES[item.status].className
                          }`}
                        >
                          {STATUS_STYLES[item.status].label}
                        </span>

                        {item.status === "done" &&
                          item.documentId && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate("/learn", {
                                  state: {
                                    documentId:
                                      item.documentId,
                                    filename:
                                      item.file.name,
                                  },
                                })
                              }
                              className="shrink-0 rounded-lg bg-brand-red px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-red-dark"
                            >
                              Open Learn
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
              {generateHint && (
                <p className="text-sm text-gray-500">
                  {generateHint}
                </p>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition ${
                  canGenerate
                    ? "bg-brand-red text-white hover:bg-brand-red-dark"
                    : "cursor-not-allowed bg-gray-200 text-gray-500"
                }`}
              >
                Generate handover guide
                <ArrowIcon className="h-4 w-4" />
              </button>
            </div>

            {generateClicked && canGenerate && (
              <p className="mt-3 text-sm text-green-700 sm:text-right">
                Guide generation is not connected yet.
                Your {doneCount} indexed{" "}
                {doneCount === 1 ? "document is" : "documents are"} ready
                for the next processing step.
              </p>
            )}
          </section>

          <aside className="h-fit self-start rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">
              What we'll pull from your files
            </h2>

            <p className="mt-2 text-xs text-gray-500">
              These items will be verified when guide extraction
              is connected.
            </p>

            <ul className="mt-4 space-y-3">
              {PULLED_ITEMS.map((item, index) => {
                const isChecked = index < checkedCount;

                return (
                  <li
                    key={item}
                    className={`flex items-center gap-3 text-sm ${
                      isChecked
                        ? "text-gray-900"
                        : "text-gray-500"
                    }`}
                  >
                    {isChecked ? (
                      <CheckIcon className="h-5 w-5 shrink-0 text-green-600" />
                    ) : (
                      <DocIcon className="h-5 w-5 shrink-0 text-gray-300" />
                    )}

                    {item}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
