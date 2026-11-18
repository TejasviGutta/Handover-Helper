// Frontend fixtures only. These IDs never identify real Supabase records.
export const MOCK_DOCUMENTS = [
  { id: "demo-overview", filename: "project-overview.pdf", type: "PDF" },
  { id: "demo-notes", filename: "handover-notes.txt", type: "TXT" },
  { id: "demo-meeting", filename: "meeting-summary.docx", type: "DOCX" },
  { id: "demo-timeline", filename: "project-timeline.xlsx", type: "XLSX" },
  { id: "demo-actions", filename: "action-register.csv", type: "CSV" },
];

export const SUGGESTIONS = [
  ["Summarize document", "Summarize this document and highlight its most important information."],
  ["Extract action items", "List the action items mentioned in this document."],
  ["Identify key people", "Who are the important people mentioned in this document, and what are their responsibilities?"],
  ["Explain decisions", "What important decisions are documented, and why were they made?"],
  ["Identify unresolved issues", "What unresolved issues, blockers, or risks are mentioned in this document?"],
  ["Explain simply", "Explain the contents of this document in simple, easy-to-understand language."],
];

// Replace this adapter with an authenticated POST /learn/ask later.
// Request: { question, document_id, top_k: 3 }. Response: { answer, sources }.
export function getMockLearnResponse(question, documentId, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      if (!question.trim() || !MOCK_DOCUMENTS.some((document) => document.id === documentId)) {
        reject(new Error("Choose a sample document and enter a question."));
        return;
      }
      resolve({
        answer: "Development demonstration\n\nThe live Learn API is not connected yet. This sample response confirms that your question was submitted in the selected document context.\n\nNo document was read and no AI answer was generated. Once connected, the assistant will answer from your authorized document and show the source references returned by the backend.",
        sources: [],
      });
    }, 450);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
