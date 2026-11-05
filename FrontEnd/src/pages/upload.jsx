// Pull in useState and useEffect from React.
// useState gives the page a memory slot that can change.
// useEffect runs code once when the page opens (used to look up who is signed in).
import { useEffect, useState } from "react";

// Pull in page-switching tools, the same ones the Dashboard uses.
import { useNavigate } from "react-router-dom";

// Pull in the ready-made drag-and-drop tool we installed.
import { useDropzone } from "react-dropzone";

// Pull in the Supabase connection Tejasvi set up, to get the signed-in user's email
// and to sign out.
import { supabase } from "../lib/supabaseClient.js";

// Pull in Tejasvi's styles so the top bar and background match the Dashboard.
import "../styles/dashboard.css";
import "../styles/admin.css";

// Pull in the Tailwind classes and brand colors for this page.
import "./upload.css";

// Fake project list for the dropdown. Step 11 replaces this with real projects.
// Each project has an id (for the computer) and a name (for people).
const projects = [
  { id: "proj-1", name: "Client portal redesign" },
  { id: "proj-2", name: "Billing system migration" },
  { id: "proj-3", name: "Data warehouse rollout" },
];

// The size limit, 20 MB, written in bytes (20 x 1024 x 1024).
// Change the 20 here if the team agrees on a different limit.
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// The file types we allow.
// Left side: the official type name browsers use.
// Right side: the file ending that goes with it.
// A file passes if it matches either side.
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
};

// The three steps of a handover, shown in the tracker at the top.
// currentStep is the one this page belongs to (1 = Gather).
const STEPS = ["Gather", "Learn", "Close the gaps"];
const currentStep = 1;

// The four things the guide will pull from the files, shown in the side card.
const PULLED_ITEMS = [
  "Unfinished work",
  "Key contacts",
  "Known problems",
  "Why past decisions were made",
];

// The label and colors for each stage's status pill.
// The stages, in order: uploading, uploaded, processing, done.
// "failed" isn't used yet. It's for real upload errors in step 10.
const STATUS_STYLES = {
  uploading: { label: "Uploading", className: "bg-gray-100 text-gray-700" },
  uploaded: { label: "Uploaded", className: "bg-brand-purple-50 text-brand-purple" },
  processing: { label: "Processing", className: "bg-blue-50 text-blue-700" },
  done: { label: "Done", className: "bg-green-50 text-green-700" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700" },
};

// Each item in the file list looks like this:
// id: a random tag so the page can tell files apart, even two with the same name.
// file: the actual file the user dropped in.
// progress: how full the bar is, from 0 to 100.
// status: which stage the file is in (one of the names in STATUS_STYLES).

// Turns the drag-and-drop tool's error codes into plain messages for the user.
function rejectionMessage(rejection) {
  // Collect the error codes for this file, like "file-invalid-type".
  const codes = rejection.errors.map((error) => error.code);
  // Wrong type gets checked first, since that matters more than size.
  if (codes.includes("file-invalid-type")) return "File type not supported";
  if (codes.includes("file-too-large")) return "File is too large (20 MB max)";
  // Backup message for anything unexpected.
  return "This file can't be added";
}

// Turns a raw size in bytes into something readable, like "2.4 MB".
function formatSize(bytes) {
  // Under 1 KB: show bytes.
  if (bytes < 1024) return `${bytes} B`;
  // Under 1 MB: show KB, rounded to a whole number.
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  // Otherwise: show MB with one decimal place.
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Turns a file name into a friendly type label, like "Report.pdf" into "PDF".
function fileTypeLabel(name) {
  // Grab the part after the last dot and make it lowercase. "Report.PDF" becomes "pdf".
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  // Lookup table: file ending on the left, label to show on the right.
  const labels = {
    pdf: "PDF",
    docx: "Word",
    xlsx: "Excel",
    csv: "CSV",
    txt: "Text",
  };
  // Use the friendly label if we have one.
  // If not, show the ending in capitals (like "ZIP"), or "Unknown" if there's no ending.
  return labels[ext] ?? (ext ? ext.toUpperCase() : "Unknown");
}

// Small drawings (icons) used around the page.
// Each one is an SVG, which is a tiny built-in drawing.
// aria-hidden tells screen readers to skip them, since the text next to them says it all.

// A page with a folded corner. Used for file rows and the side card.
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

// An arrow pointing up out of a tray. Used in the drop box.
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

// A circle with a check mark. Used in the side card.
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

// An arrow pointing right. Used on the Generate button.
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

// The step tracker: three boxes in a row. The current step is filled purple.
function StepTracker() {
  return (
    // aria-label tells screen readers what this list is.
    <ol aria-label="Handover steps" className="grid grid-cols-3 gap-2 sm:gap-3">
      {/* Make one box for each step. */}
      {STEPS.map((label, index) => {
        // Steps are numbered from 1, but the list counts from 0.
        const number = index + 1;
        const isCurrent = number === currentStep;
        return (
          <li
            key={label}
            // aria-current marks the step the user is on, for screen readers.
            aria-current={isCurrent ? "step" : undefined}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs sm:justify-start sm:px-3 sm:text-sm ${
              isCurrent
                ? "bg-brand-purple font-medium text-white shadow-sm"
                : "bg-white text-gray-600 shadow-sm"
            }`}
          >
            {/* Small circle with the step number. */}
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                isCurrent
                  ? "bg-white/20 text-white"
                  : "bg-brand-purple-50 text-brand-purple"
              }`}
            >
              {number}
            </span>
            {/* Step name. */}
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// The page itself.
export default function UploadPage() {
  // Lets the page switch to another page, like the Dashboard.
  const navigate = useNavigate();

  // Memory slot for the signed-in user's email, shown in the top bar.
  const [email, setEmail] = useState("");

  // Memory slot for the chosen project. Starts empty ("") since nothing is picked yet.
  // projectId is the current value. setProjectId is how we change it.
  const [projectId, setProjectId] = useState("");

  // Memory slot for the file list. Starts as an empty list.
  const [files, setFiles] = useState([]);

  // Memory slot for blocked file messages. Starts empty.
  const [blocked, setBlocked] = useState([]);

  // Memory slot for whether the Generate button has been clicked.
  // Used to show a temporary message until step 12 connects the backend.
  const [generateClicked, setGenerateClicked] = useState(false);

  // When the page opens, ask Supabase who is signed in and save their email.
  // Same as the Dashboard does.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  // Signs the user out and goes back to the landing page. Same as the Dashboard.
  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/");
  }

  // Count how many files have finished (status "done").
  const doneCount = files.filter((item) => item.status === "done").length;

  // The button only works when a project is picked AND at least one file is done.
  const canGenerate = projectId !== "" && doneCount > 0;

  // How many side card items show a check mark.
  // PLACEHOLDER: each finished file checks off one item, just to show the idea.
  // Once the backend reports what it really found, use that instead.
  const checkedCount = Math.min(doneCount, PULLED_ITEMS.length);

  // The hint shown next to a gray button, telling the user what's missing.
  // Empty when the button is ready.
  let generateHint = "";
  if (projectId === "") {
    generateHint = "Pick a project to continue.";
  } else if (doneCount === 0) {
    generateHint = "Add at least one file to continue.";
  }

  // Changes some details of one file in the list, found by its id.
  // Every other file stays the same.
  function updateFile(id, changes) {
    setFiles((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item))
    );
  }

  // Pretends to upload one file. Step 10 replaces this with the real upload.
  function startFakeUpload(id) {
    // Start the bar at 0%.
    let progress = 0;
    // Every 0.3 seconds, add a random amount (between 10% and 25%) to the bar.
    const timer = setInterval(() => {
      // Math.min stops it from going past 100.
      progress = Math.min(progress + 10 + Math.random() * 15, 100);
      updateFile(id, { progress: Math.round(progress) });

      // Once the bar is full, stop the timer and move through the stages.
      if (progress >= 100) {
        clearInterval(timer);
        updateFile(id, { status: "uploaded" });
        // After 0.8 seconds, switch to Processing.
        setTimeout(() => updateFile(id, { status: "processing" }), 800);
        // After 2.5 seconds, switch to Done.
        setTimeout(() => updateFile(id, { status: "done" }), 2500);
      }
    }, 300);
  }

  // Runs whenever files are dropped in or picked from the file browser.
  // The tool hands us two lists: files that passed the checks,
  // and files that failed them.
  function onDrop(acceptedFiles, rejectedFiles) {
    // Wrap each good file with a random id.
    // Each one starts at 0% and in the Uploading stage.
    const goodItems = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: "uploading",
    }));
    // Only good files go into the file list.
    setFiles((current) => [...current, ...goodItems]);

    // Start the fake upload for each good file.
    goodItems.forEach((item) => startFakeUpload(item.id));

    // Blocked files go into the message area instead.
    // Each drop replaces the old messages, so they don't pile up.
    setBlocked(
      rejectedFiles.map((rejection) => ({
        id: crypto.randomUUID(),
        name: rejection.file.name,
        message: rejectionMessage(rejection),
      }))
    );
  }

  // Removes one file from the list.
  // It keeps every file except the one whose id matches.
  function removeFile(id) {
    setFiles((current) => current.filter((item) => item.id !== id));
  }

  // Runs when the Generate button is clicked.
  // For now it only shows a message. Step 12 makes it call the backend.
  function handleGenerate() {
    setGenerateClicked(true);
  }

  // Set up the drag-and-drop tool.
  // We pass in the allowed types and the size limit, so the tool checks them.
  // getRootProps: settings for the drop box.
  // getInputProps: settings for the hidden file browser.
  // isDragActive: true while a file is being dragged over the box.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
  });

  // Everything below is the layout: what the user sees.
  // Class names starting with "dash-" or "admin-" are Tejasvi's styles.
  // Everything else is Tailwind.
  return (
    // Tejasvi's page wrapper, which gives the gradient background.
    // "upload-page" switches on this page's own small reset from upload.css.
    <div className="dash-shell admin-shell upload-page">
      {/* Top bar, copied from the Dashboard so every page matches.
          Later this could move into one shared file for all pages. */}
      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark" aria-hidden="true" />
          Handover Helper
        </div>
        <nav className="admin-nav" aria-label="Main">
          <button type="button" onClick={() => navigate("/dashboard")}>
            Dashboard
          </button>
          <button type="button" onClick={() => navigate("/admin")}>
            Admin
          </button>
        </nav>
        <div className="dash-user">
          <span>{email}</span>
          <button type="button" className="dash-btn" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Main content, centered so it doesn't stretch across wide screens. */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Page title and subtitle in white, like the Dashboard heading. */}
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">
          Gather your work
        </h1>
        <p className="mt-2 text-sm text-white/80 sm:text-base">
          Upload the files your replacement will need. We&apos;ll turn them into
          a handover guide.
        </p>

        {/* Step tracker: Gather, Learn, Close the gaps. */}
        <div className="mt-6">
          <StepTracker />
        </div>

        {/* Two columns on wide screens: upload card on the left, side card on the right.
            On a phone they stack, with the side card at the bottom. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* LEFT COLUMN: one white card holding the dropdown, drop box, and file list. */}
          <section className="rounded-xl bg-white p-5 shadow-sm sm:p-6">
            {/* Project dropdown section. */}
            <div>
              {/* Label above the dropdown. htmlFor links it to the dropdown below. */}
              <label
                htmlFor="project"
                className="block text-sm font-medium text-gray-900"
              >
                Project
              </label>
              {/* The dropdown. It shows whatever is in projectId,
                  and updates projectId when the user picks something. */}
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-brand-purple focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              >
                {/* Placeholder option. "disabled" means it can't be picked again. */}
                <option value="" disabled>
                  Select a project
                </option>
                {/* Make one option for each project in the fake list. */}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* The drag-and-drop box. getRootProps makes it accept drops and clicks.
                The styling switches to purple while a file is being dragged over it. */}
            <div
              {...getRootProps()}
              className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                isDragActive
                  ? "border-brand-purple bg-brand-purple-50"
                  : "border-gray-300 bg-gray-50 hover:border-brand-purple/60"
              }`}
            >
              {/* Hidden file browser. Opens when the box is clicked. */}
              <input {...getInputProps()} />
              {/* Upload icon in a small purple square. */}
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-brand-purple-50 text-brand-purple">
                <UploadIcon className="h-5 w-5" />
              </div>
              {/* Main message. Changes while a file is being dragged over. */}
              <p className="mt-4 font-medium text-gray-900">
                {isDragActive
                  ? "Drop your files here"
                  : "Hand off your work. Drop files here or click to browse."}
              </p>
              {/* Smaller line listing allowed types and the size limit. */}
              <p className="mt-2 text-sm text-gray-500">
                PDF, Word (.docx), Excel (.xlsx), CSV, or text (.txt). 20 MB max
                per file.
              </p>
            </div>

            {/* Red message box for blocked files. Only shows if something was blocked.
                role="alert" makes screen readers announce it right away. */}
            {blocked.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
              >
                {/* Heading for the message box. */}
                <p className="text-sm font-medium text-red-800">
                  Some files weren&apos;t added:
                </p>
                {/* One line per blocked file: the name, then the reason. */}
                <ul className="mt-1 space-y-1">
                  {blocked.map((item) => (
                    <li key={item.id} className="text-sm text-red-700">
                      {item.name}: {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* File list. Only shows once at least one file has been added. */}
            {files.length > 0 && (
              <div className="mt-8">
                {/* Heading with the number of files in a small purple pill. */}
                <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  Files
                  <span className="rounded-full bg-brand-purple-50 px-2 py-0.5 text-xs text-brand-purple">
                    {files.length}
                  </span>
                </h2>
                {/* The list, with a thin line between each row. */}
                <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
                  {/* Make one row for each file in the list. */}
                  {files.map((item) => (
                    // On a phone the row stacks into two lines.
                    // On a wider screen it sits on one line:
                    // icon and details, progress bar, status pill, Remove button.
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      {/* File icon and details. flex-1 lets this part take the spare space. */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {/* File icon in a small purple square. */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-purple-50 text-brand-purple">
                          <DocIcon className="h-5 w-5" />
                        </div>
                        {/* min-w-0 lets long names shrink instead of pushing things off. */}
                        <div className="min-w-0">
                          {/* File name. "truncate" adds "..." if the name is too long. */}
                          <p className="truncate font-medium text-gray-900">
                            {item.file.name}
                          </p>
                          {/* Size and type, like "2.4 MB · PDF". */}
                          <p className="text-sm text-gray-500">
                            {formatSize(item.file.size)} ·{" "}
                            {fileTypeLabel(item.file.name)}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar, status pill, and Remove button.
                          On a phone they share a second line. */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* Progress bar with the percentage above it. */}
                        <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                          {/* Percentage number, lined up on the right. */}
                          <p className="text-right text-xs text-gray-500">
                            {item.progress}%
                          </p>
                          {/* Gray track for the bar. */}
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                            {/* Purple fill. Its width matches the progress number. */}
                            <div
                              className="h-full rounded-full bg-brand-purple transition-all duration-300"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Status pill. Label and colors come from STATUS_STYLES. */}
                        <span
                          className={`w-24 shrink-0 rounded-full px-2.5 py-1 text-center text-xs font-medium ${
                            STATUS_STYLES[item.status].className
                          }`}
                        >
                          {STATUS_STYLES[item.status].label}
                        </span>

                        {/* Remove button. Clicking it runs removeFile for this row's file. */}
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

            {/* Bottom bar with a thin line above it.
                Hint on the left, Generate button on the right. */}
            <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
              {/* Hint explaining why the button is gray. Only shows when it isn't ready. */}
              {generateHint && (
                <p className="text-sm text-gray-500">{generateHint}</p>
              )}
              {/* The Generate button.
                  disabled: can't be clicked until canGenerate is true.
                  The colors switch between gray (disabled) and red (ready). */}
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

            {/* Temporary message after clicking Generate.
                Step 12 replaces this with the real call to the backend. */}
            {generateClicked && canGenerate && (
              <p className="mt-3 text-sm text-green-700 sm:text-right">
                Got it. Your handover guide will be built from {doneCount}{" "}
                {doneCount === 1 ? "file" : "files"}.
              </p>
            )}
          </section>

          {/* RIGHT COLUMN: side card listing what the guide will pull from the files.
              "self-start" keeps it from stretching to match the left card's height. */}
          <aside className="h-fit self-start rounded-xl bg-white p-5 shadow-sm">
            {/* Card title. */}
            <h2 className="text-sm font-semibold text-gray-900">
              What we&apos;ll pull from your files
            </h2>
            {/* The four items. Checked ones are green, the rest are gray. */}
            <ul className="mt-4 space-y-3">
              {PULLED_ITEMS.map((item, index) => {
                // An item is checked once enough files have finished.
                const isChecked = index < checkedCount;
                return (
                  <li
                    key={item}
                    className={`flex items-center gap-3 text-sm ${
                      isChecked ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {/* Green check when found, gray page icon when not yet. */}
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
