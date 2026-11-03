// Pull in the Tailwind styling for this page.
import "./upload.css";

// Pull in useState from React. It gives the page a memory slot that can change.
import { useState } from "react";

// Pull in the ready-made drag-and-drop tool we installed.
import { useDropzone } from "react-dropzone";

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

// The label and colors for each stage's status pill.
// The stages, in order: uploading, uploaded, processing, done.
// "failed" isn't used yet. It's for real upload errors in step 10.
const STATUS_STYLES = {
  uploading: { label: "Uploading", className: "bg-gray-100 text-gray-700" },
  uploaded: { label: "Uploaded", className: "bg-purple-50 text-purple-700" },
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

// The page itself.
export default function UploadPage() {
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

  // Count how many files have finished (status "done").
  const doneCount = files.filter((item) => item.status === "done").length;

  // The button only works when a project is picked AND at least one file is done.
  const canGenerate = projectId !== "" && doneCount > 0;

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
  // The className text is Tailwind styling (colors, spacing, sizes).
  return (
    // Full-height white page with padding around the edges.
    <main className="min-h-screen bg-white px-6 py-12">
      {/* Centered column so the content doesn't stretch across wide screens. */}
      <div className="mx-auto max-w-5xl">
        {/* Page title. */}
        <h1 className="text-3xl font-semibold text-gray-900">
          Gather your work
        </h1>
        {/* Subtitle. &apos; is how you write an apostrophe safely here. */}
        <p className="mt-2 text-gray-600">
          Upload the files your replacement will need. We&apos;ll turn them into
          a handover guide.
        </p>

        {/* Project dropdown section. */}
        <div className="mt-8 max-w-md">
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
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
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
          className={`mt-6 cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
            isDragActive
              ? "border-purple-700 bg-purple-50"
              : "border-gray-300 bg-gray-50 hover:border-purple-400"
          }`}
        >
          {/* Hidden file browser. Opens when the box is clicked. */}
          <input {...getInputProps()} />
          {/* Main message. Changes while a file is being dragged over. */}
          <p className="font-medium text-gray-900">
            {isDragActive
              ? "Drop your files here"
              : "Hand off your work. Drop files here or click to browse."}
          </p>
          {/* Smaller line listing allowed types and the size limit. */}
          <p className="mt-2 text-sm text-gray-500">
            PDF, Word (.docx), Excel (.xlsx), CSV, or text (.txt). 20 MB max per
            file.
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
            {/* Heading with the number of files. */}
            <h2 className="text-sm font-medium text-gray-900">
              Files ({files.length})
            </h2>
            {/* The list, with a thin line between each row. */}
            <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
              {/* Make one row for each file in the list. */}
              {files.map((item) => (
                // The row lays things out side by side:
                // file details, progress bar, status pill, Remove button.
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  {/* File details. min-w-0 lets long names shrink instead of pushing things off.
                      flex-1 lets this part take up the spare space. */}
                  <div className="min-w-0 flex-1">
                    {/* File name. "truncate" adds "..." if the name is too long. */}
                    <p className="truncate font-medium text-gray-900">
                      {item.file.name}
                    </p>
                    {/* Size and type, like "2.4 MB · PDF". */}
                    <p className="text-sm text-gray-500">
                      {formatSize(item.file.size)} · {fileTypeLabel(item.file.name)}
                    </p>
                  </div>

                  {/* Progress bar with the percentage above it. */}
                  <div className="w-32 shrink-0">
                    {/* Percentage number, lined up on the right. */}
                    <p className="text-right text-xs text-gray-500">
                      {item.progress}%
                    </p>
                    {/* Gray track for the bar. */}
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      {/* Purple fill. Its width matches the progress number. */}
                      <div
                        className="h-full rounded-full bg-purple-700 transition-all duration-300"
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
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom bar with a thin line above it.
            Hint on the left, Generate button on the right. */}
        <div className="mt-8 flex items-center justify-end gap-4 border-t border-gray-200 pt-6">
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
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              canGenerate
                ? "bg-red-600 text-white hover:bg-red-700"
                : "cursor-not-allowed bg-gray-200 text-gray-500"
            }`}
          >
            Generate handover guide
          </button>
        </div>

        {/* Temporary message after clicking Generate.
            Step 12 replaces this with the real call to the backend. */}
        {generateClicked && canGenerate && (
          <p className="mt-3 text-right text-sm text-green-700">
            Got it. Your handover guide will be built from {doneCount}{" "}
            {doneCount === 1 ? "file" : "files"}.
          </p>
        )}
      </div>
    </main>
  );
}
