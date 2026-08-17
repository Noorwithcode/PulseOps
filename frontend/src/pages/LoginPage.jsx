import { useState } from "react";
import {
  Navigate,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    login,
    loading,
    isAuthenticated,
  } = useAuth();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  if (!loading && isAuthenticated) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setSubmitting(true);

    try {
      await login({
        email: email.trim(),
        password,
      });

      navigate("/", {
        replace: true,
      });
    } catch (err) {
      setError(
        err?.message ||
          "Authentication failed."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pulseops-login">
      {/* Animated background */}
      <div className="circuit-background">
        <CircuitLine className="circuit-1" />
        <CircuitLine className="circuit-2" />
        <CircuitLine className="circuit-3" />
        <CircuitLine className="circuit-4" />
        <CircuitLine className="circuit-5" />
        <CircuitLine className="circuit-6" />
      </div>

      <div className="digital-grid" />
      <div className="scanner-light" />

      <section className="login-console">
        {/* corner decorations */}
        <span className="corner corner-top-left" />
        <span className="corner corner-top-right" />
        <span className="corner corner-bottom-left" />
        <span className="corner corner-bottom-right" />

        <div className="console-noise" />

        {/* BRAND */}
        <header className="login-brand">
          <div className="heartbeat-logo">
            <svg
              viewBox="0 0 120 44"
              aria-hidden="true"
            >
              <path
                className="heartbeat-line"
                d="
                  M2 23
                  H29
                  L37 23
                  L43 12
                  L50 34
                  L59 4
                  L68 39
                  L76 18
                  L84 23
                  H118
                "
              />
            </svg>
          </div>

          <h1>
            PULSE<span>O</span>PS
          </h1>

          <p>
            Operations Control Platform
          </p>
        </header>

        {/* secure heading */}
        <div className="secure-heading">
          <span className="heading-line" />

          <div>
            <span className="secure-dot" />
            Secure Login
          </div>

          <span className="heading-line" />
        </div>

        <form
          className="login-form"
          onSubmit={handleSubmit}
        >
          {/* EMAIL */}
          <div className="login-field">
            <div className="field-icon">
              <UserIcon />
            </div>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="Email or Username"
              autoComplete="email"
              spellCheck="false"
              required
            />

            <div className="field-terminal">
              01
            </div>
          </div>

          {/* PASSWORD */}
          <div className="login-field">
            <div className="field-icon">
              <LockIcon />
            </div>

            <input
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Password"
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="password-eye"
              onClick={() =>
                setShowPassword(
                  (current) => !current
                )
              }
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              <EyeIcon
                crossed={showPassword}
              />
            </button>
          </div>

          {error && (
            <div
              className="login-error"
              role="alert"
            >
              <span className="error-symbol">
                !
              </span>

              <div>
                <strong>
                  ACCESS DENIED
                </strong>

                <span>
                  {error}
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={submitting}
          >
            <span className="button-scan" />

            {submitting ? (
              <>
                <span>
                  AUTHENTICATING
                </span>

                <span className="login-spinner" />
              </>
            ) : (
              <>
                <span>
                  LOGIN
                </span>

                <span className="login-arrow">
                  →
                </span>
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          className="forgot-password"
        >
          <span />
          Forgot Password?
          <span />
        </button>

        <footer className="login-footer">
          <span>Monitoring</span>
          <i />
          <span>Alerting</span>
          <i />
          <span>Responding</span>
        </footer>

        <div className="console-status">
          <span>
            <i />
            AUTH NODE ONLINE
          </span>

          <span>
            TLS SECURED
          </span>
        </div>
      </section>
    </main>
  );
}

/* ---------- ICONS ---------- */

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="7"
        r="4"
      />

      <path
        d="
          M4.5 21
          V18
          C4.5 14.7
          7.4 12
          12 12
          C16.6 12
          19.5 14.7
          19.5 18
          V21
        "
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="11"
        rx="2"
      />

      <path
        d="
          M8 10
          V7
          A4 4 0 0 1
          16 7
          V10
        "
      />

      <path
        d="M12 14V17"
      />
    </svg>
  );
}

function EyeIcon({
  crossed,
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="
          M2.5 12
          C4.8 7.8
          8 5.8
          12 5.8
          C16 5.8
          19.2 7.8
          21.5 12
          C19.2 16.2
          16 18.2
          12 18.2
          C8 18.2
          4.8 16.2
          2.5 12
        "
      />

      <circle
        cx="12"
        cy="12"
        r="2.7"
      />

      {crossed && (
        <path
          d="M4 4L20 20"
        />
      )}
    </svg>
  );
}

function CircuitLine({
  className,
}) {
  return (
    <div
      className={`circuit ${className}`}
    >
      <span />
      <span />
      <span />
    </div>
  );
}