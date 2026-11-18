import { supabase } from "../../lib/supabaseClient.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function authorizedRequest(path, { method = "GET", body, signal } = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "Server request failed.");
  }
  return payload;
}

export async function fetchLearnDocuments({ signal } = {}) {
  const data = await authorizedRequest("/learn/documents", { signal });
  return data.documents ?? [];
}

export function askLearnQuestion(question, documentId, { signal } = {}) {
  return authorizedRequest("/learn/ask", {
    method: "POST",
    body: { document_id: documentId, question, top_k: 3 },
    signal,
  });
}

export function retryLearnIndex(documentId) {
  return authorizedRequest(`/learn/documents/${encodeURIComponent(documentId)}/index`, {
    method: "POST",
  });
}
