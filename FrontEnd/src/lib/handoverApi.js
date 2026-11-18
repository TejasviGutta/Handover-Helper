import { supabase } from "./supabaseClient.js";

const apiRoot = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

export async function handoverApi(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to access your handovers.");
  const response = await fetch(apiRoot + path, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(options.body && { "Content-Type": "application/json" }),
    },
    body: options.body && JSON.stringify(options.body),
    signal: options.signal,
  });
  if (response.status === 404 && options.allowMissing) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof result?.detail === "string" ? result.detail : `Request failed (${response.status}).`);
  }
  return result;
}
