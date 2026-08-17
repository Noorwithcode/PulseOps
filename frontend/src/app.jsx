import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ServersPage from "./pages/ServersPage.jsx";
import IncidentsPage from "./pages/IncidentsPage.jsx";
import AlertRulesPage from "./pages/AlertRulesPage.jsx";
import AlertsPage from "./pages/AlertsPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";

import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";

import "./AppLoading.css";

const MIN_BOOT_TIME_MS = 750;

export default function App() {
  const {
    loading,
  } = useAuth();

  const [
    showBootLoader,
    setShowBootLoader,
  ] = useState(true);

  const bootStartedAtRef =
    useRef(
      performance.now()
    );

  useEffect(() => {
    if (loading) {
      setShowBootLoader(true);
      return undefined;
    }

    const elapsed =
      performance.now() -
      bootStartedAtRef.current;

    const remaining =
      Math.max(
        MIN_BOOT_TIME_MS - elapsed,
        0
      );

    const timer =
      window.setTimeout(
        () => {
          setShowBootLoader(false);
        },
        remaining
      );

    return () =>
      window.clearTimeout(timer);
  }, [loading]);

  if (showBootLoader) {
    return (
      <PulseOpsBootLoader />
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/servers"
        element={
          <ProtectedRoute>
            <ServersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/incidents"
        element={
          <ProtectedRoute>
            <IncidentsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/alert-rules"
        element={
          <ProtectedRoute>
            <AlertRulesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <AlertsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

function PulseOpsBootLoader() {
  return (
    <div
      className="pulseops-boot"
      role="status"
      aria-live="polite"
      aria-label="PulseOps is loading"
    >
      <div
        className="pulseops-boot-grid"
        aria-hidden="true"
      />

      <div className="pulseops-boot-center">
        <div className="pulseops-boot-orbit">
          <span />
          <span />
          <span />

          <div className="pulseops-boot-mark">
            <svg
              viewBox="0 0 64 64"
              aria-hidden="true"
            >
              <path
                className="pulseops-boot-heartbeat"
                d="M4 34H15L20 23L27 46L34 13L41 40L47 29H60"
              />
            </svg>
          </div>
        </div>

        <div className="pulseops-boot-brand">
          PULSE
          <span>OPS</span>
        </div>

        <div className="pulseops-boot-status">
          RESTORING CONTROL SESSION
        </div>

        <div
          className="pulseops-boot-progress"
          aria-hidden="true"
        >
          <i />
        </div>

        <div className="pulseops-boot-meta">
          <span>
            AUTH
            <strong>
              SYNC
            </strong>
          </span>

          <b />

          <span>
            API
            <strong>
              LINK
            </strong>
          </span>

          <b />

          <span>
            NOC
            <strong>
              READY
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}