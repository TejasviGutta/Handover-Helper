import { supabase } from "./supabaseClient.js";

const apiRoot = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

// Thrown when the backend cannot be reached at all (network error or no
// response). Callers show a "not reachable" message for this case.
export class ApiUnavailableError extends Error {
  constructor() {
    super("The quiz service is not reachable right now.");
    this.name = "ApiUnavailableError";
  }
}

// Thrown when the backend answers with an error status.
// `detail` is a user-facing message from the server, or null when the server
// gave none (callers then show their own default message).
export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function readableDetail(detail, status) {
  if (typeof detail === "string") return detail;
  // FastAPI validation errors come back as a list of {loc, msg}.
  if (Array.isArray(detail) && detail.length) {
    return "Some quiz fields are missing or invalid. Check the title and questions.";
  }
  if (status === 401) return "Your session expired. Sign in again.";
  return null;
}

async function request(path, { method = "GET", body, signal } = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const message = "Sign in to use saved quizzes.";
    throw new ApiError(message, 401, message);
  }

  let response;
  try {
    response = await fetch(apiRoot + path, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiUnavailableError();
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    // A 5xx without a JSON detail did not come from the API itself (for
    // example the dev proxy when the backend process is not running).
    if (response.status >= 500 && typeof result?.detail !== "string") {
      throw new ApiUnavailableError();
    }
    const detail = readableDetail(result?.detail, response.status);
    throw new ApiError(detail ?? `Request failed (${response.status}).`, response.status, detail);
  }
  return result;
}

export function generateQuiz({ handoverId, documentIds, numQuestions, difficulty }, options) {
  return request("/quizzes/generate", {
    ...options,
    method: "POST",
    body: {
      handover_id: handoverId,
      document_ids: documentIds,
      num_questions: numQuestions,
      difficulty,
    },
  });
}

export function listQuizzes(handoverId, options) {
  return request(`/quizzes?handover_id=${encodeURIComponent(handoverId)}`, options);
}

export function getQuiz(quizId, options) {
  return request(`/quizzes/${encodeURIComponent(quizId)}`, options);
}

export function createQuiz(quiz, options) {
  return request("/quizzes", { ...options, method: "POST", body: quiz });
}

export function updateQuiz(quizId, quiz, options) {
  return request(`/quizzes/${encodeURIComponent(quizId)}`, {
    ...options,
    method: "PUT",
    body: quiz,
  });
}
