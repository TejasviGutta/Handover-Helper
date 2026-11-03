import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  function switchMode(next) {
    setMode(next);
    setErrors({});
    setFormError("");
    setInfo("");
    setPassword("");
    setConfirm("");
  }

  function validate() {
    const next = {};
    if (!email.trim()) next.email = "Email is required.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    else if (isSignup && password.length < 6) next.password = "Use at least 6 characters.";
    if (isSignup && confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setInfo("");
    if (!validate()) return;
    setLoading(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setLoading(false);
      if (error) return setFormError(error.message);
      // Supabase returns no identities when the email is already registered
      if (data.user && data.user.identities?.length === 0) {
        return setFormError("An account with this email already exists. Try signing in.");
      }
      if (!data.session) {
        return setInfo("Account created. Check your email to confirm it, then sign in.");
      }
      // TODO: redirect to your app (email confirmation is turned off)
      return setInfo("Account created and signed in.");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) return setFormError(error.message);
    // TODO: redirect to your app once other pages exist
    setInfo("Signed in successfully.");
  }

  async function handleForgot() {
    setFormError("");
    setInfo("");
    if (!EMAIL_RE.test(email.trim())) {
      return setErrors({ email: "Enter your email above first." });
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) setFormError(error.message);
    else setInfo("Password reset link sent. Check your inbox.");
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">

        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="subtitle">
          {isSignup
            ? "Enter your details to get started."
            : "Enter your details to continue."}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor="password">Password</label>
              {!isSignup && (
                <button type="button" className="link-btn" onClick={handleForgot}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="input-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                className="toggle"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          {isSignup && (
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={Boolean(errors.confirm)}
              />
              {errors.confirm && <span className="field-error">{errors.confirm}</span>}
            </div>
          )}

          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          {info && <div className="alert alert-info" role="status">{info}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? isSignup ? "Creating account…" : "Signing in…"
              : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="switch-text">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(isSignup ? "signin" : "signup")}
          >
            {isSignup ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </main>
  );
}