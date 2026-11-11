import { Navigate } from "react-router-dom";
import { useRole } from "../lib/useRole.js";
import { canAccessAdmin } from "../lib/roles.js";

// Wrap a page with this to keep out people who should not see it.
//   not signed in         -> /login
//   signed in, wrong role -> /dashboard
//   allowed               -> the page
export default function RequireAdmin({ children }) {
  const { status, role, isDeparting } = useRole();

  if (status === "loading") {
    return <p style={{ padding: 24, color: "#6b6a85" }}>Checking access…</p>;
  }
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (!canAccessAdmin(role, isDeparting)) return <Navigate to="/dashboard" replace />;

  return children;
}