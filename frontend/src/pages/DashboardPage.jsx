import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { dashboardApi } from "../api/dashboardApi.js";

import "./DashboardPage.css";
import "./DashboardData.css";

export default function DashboardPage() {
  const navigate = useNavigate();

  const {
    user,
    accessToken,
    logout,
    refreshAccessToken,
  } = useAuth();

  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const requestRunningRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utcTime = useMemo(
    () =>
      now.toLocaleTimeString("en-GB", {
        hour12: false,
        timeZone: "UTC",
      }),
    [now]
  );

  const utcDate = useMemo(
    () =>
      now
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase(),
    [now]
  );

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (!accessToken || requestRunningRef.current) {
        return;
      }

      requestRunningRef.current = true;

      if (!silent) {
        setDashboardLoading(true);
      }

      try {
        let token = accessToken;
        let response;

        try {
          response = await dashboardApi.getOverview(token, {
            recentIncidentLimit: 6,
            serverHealthLimit: 6,
          });
        } catch (error) {
          if (error?.status !== 401) {
            throw error;
          }

          token = await refreshAccessToken();

          response = await dashboardApi.getOverview(token, {
            recentIncidentLimit: 6,
            serverHealthLimit: 6,
          });
        }

        setDashboard(response?.data || null);
        setDashboardError("");
      } catch (error) {
        setDashboardError(
          error?.message || "Dashboard data could not be loaded."
        );
      } finally {
        requestRunningRef.current = false;
        setDashboardLoading(false);
      }
    },
    [accessToken, refreshAccessToken]
  );

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    loadDashboard();

    const refreshTimer = setInterval(() => {
      loadDashboard({ silent: true });
    }, 30000);

    return () => clearInterval(refreshTimer);
  }, [accessToken, loadDashboard]);

  const servers = dashboard?.summary?.servers || {};
  const incidents = dashboard?.summary?.incidents || {};
  const alerts = dashboard?.summary?.alerts || {};

  const recentIncidents = Array.isArray(dashboard?.recentIncidents)
    ? dashboard.recentIncidents
    : [];

  const latestServerHealth = Array.isArray(dashboard?.latestServerHealth)
    ? dashboard.latestServerHealth
    : [];

  const attention = dashboard?.attentionRequired || {};

  const metricValue = useCallback(
    (value) => {
      if (dashboardLoading && !dashboard) {
        return "…";
      }

      if (!dashboard) {
        return "--";
      }

      return Number(value || 0);
    },
    [dashboard, dashboardLoading]
  );

  const avgCpu = averageMetric(latestServerHealth, "cpuUsagePercent");
  const avgMemory = averageMetric(latestServerHealth, "memoryUsagePercent");
  const avgDisk = averageMetric(latestServerHealth, "diskUsagePercent");
  const avgLatency = averageMetric(latestServerHealth, "responseTimeMs");

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <main className="ops-shell">
      <div className="ops-bg-grid" aria-hidden="true" />

      <aside className={`ops-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark">
            <HeartbeatIcon />
          </div>

          <div>
            <div className="brand-name">
              PULSE<span>OPS</span>
            </div>
            <div className="brand-subtitle">OPERATIONS CONTROL</div>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          <SidebarItem active icon={<DashboardIcon />} label="Overview" />
          <SidebarItem
            icon={<ServerIcon />}
            label="Servers"
            onClick={() => navigate("/servers")}
          />
          <SidebarItem
            icon={<IncidentIcon />}
            label="Incidents"
            badge={metricValue(incidents.activeIncidents)}
            onClick={() => navigate("/incidents")}
          />
          <SidebarItem
            icon={<AlertIcon />}
            label="Alerts"
            onClick={() => navigate("/alerts")}
          />
          <SidebarItem
            icon={<RuleIcon />}
            label="Alert Rules"
            onClick={() => navigate("/alert-rules")}
          />
          <SidebarItem
            icon={
              <NotificationIcon />
            }
            label="Notifications"
            onClick={() =>
              navigate(
                "/notifications"
              )
            }
          />
        </nav>

        <div className="sidebar-footer">
          <div className="system-pill">
            <span className="live-dot" />
            <div>
              <small>SYSTEM LINK</small>
              <strong>AUTHENTICATED</strong>
            </div>
          </div>

          <div className="operator-card">
            <div className="operator-avatar">{getInitials(user?.fullName)}</div>

            <div className="operator-copy">
              <strong>{user?.fullName || "Operator"}</strong>
              <span>{user?.role?.code || "USER"}</span>
            </div>

            <button
              type="button"
              className="sidebar-logout"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <section className="ops-main">
        <header className="ops-header">
          <div className="header-start">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon />
            </button>

            <div className="header-title">
              <div className="breadcrumb">PULSEOPS / OVERVIEW</div>
              <h1>Operations Command Center</h1>
            </div>
          </div>

          <div className="header-end">
            <div className="session-chip">
              <span className="live-dot" />
              <div>
                <small>SESSION</small>
                <strong>ACTIVE</strong>
              </div>
            </div>

            <div className="utc-block">
              <small>UTC</small>
              <strong>{utcTime}</strong>
              <span>{utcDate}</span>
            </div>

            <button
              type="button"
              className="header-icon-button"
              aria-label="Notifications"
            >
              <NotificationIcon />
              <span className="notification-dot" />
            </button>

            <button
              type="button"
              className="mobile-logout"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogoutIcon />
            </button>
          </div>
        </header>

        <div className="ops-content">
          {dashboardError && (
            <div className="dashboard-error-banner">
              <div>
                <strong>DATA LINK ERROR</strong>
                <span>{dashboardError}</span>
              </div>

              <button type="button" onClick={() => loadDashboard()}>
                RETRY
              </button>
            </div>
          )}

          <section className="hero-row">
            <div>
              <div className="eyebrow">INFRASTRUCTURE OVERVIEW</div>
              <h2>Monitor what needs attention.</h2>
              <p>
                Live infrastructure health, incidents, alerts and operational
                telemetry in one command view.
              </p>
            </div>

            <div className="hero-status-card">
              <div className="hero-status-icon">
                <SignalIcon />
              </div>

              <div>
                <small>CONTROL PLANE</small>
                <strong>{dashboardError ? "DEGRADED" : "CONNECTED"}</strong>
              </div>
            </div>
          </section>

          <section className="metric-grid">
            <PremiumMetricCard
              label="Managed Servers"
              value={metricValue(servers.totalServers)}
              detail={`${Number(servers.offlineServers || 0)} offline`}
              status="neutral"
              icon={<ServerIcon />}
            />

            <PremiumMetricCard
              label="Operational"
              value={metricValue(servers.onlineServers)}
              detail={`${Number(servers.degradedServers || 0)} degraded`}
              status="good"
              icon={<PulseIcon />}
            />

            <PremiumMetricCard
              label="Active Alerts"
              value={metricValue(alerts.activeAlerts)}
              detail={`${Number(alerts.breachingStates || 0)} breaching`}
              status="warning"
              icon={<AlertIcon />}
            />

            <PremiumMetricCard
              label="Active Incidents"
              value={metricValue(incidents.activeIncidents)}
              detail={`${Number(incidents.activeCriticalIncidents || 0)} critical`}
              status="danger"
              icon={<IncidentIcon />}
            />
          </section>

          <section className="overview-grid">
            <div className="surface telemetry-card">
              <div className="surface-header">
                <div>
                  <span className="section-code">TELEMETRY</span>
                  <h3>Infrastructure health</h3>
                </div>

                <div className="live-badge">
                  <span className="live-dot" />
                  LIVE
                </div>
              </div>

              <div className="telemetry-body">
                <div className="telemetry-chart">
                  <div className="chart-grid" />

                  <div className="telemetry-smooth-track" aria-hidden="true">
                    <svg
                      viewBox="0 0 1000 220"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        className="premium-pulse-path"
                        d="
                          M0 130
                          L120 130
                          L150 112
                          L180 155
                          L210 55
                          L240 175
                          L270 95
                          L300 130
                          L430 130
                          L465 110
                          L495 150
                          L525 68
                          L555 165
                          L585 98
                          L615 130
                          L760 130
                          L795 105
                          L825 152
                          L855 62
                          L885 170
                          L915 100
                          L945 130
                          L1000 130
                        "
                      />
                    </svg>

                    <svg
                      viewBox="0 0 1000 220"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        className="premium-pulse-path"
                        d="
                          M0 130
                          L120 130
                          L150 112
                          L180 155
                          L210 55
                          L240 175
                          L270 95
                          L300 130
                          L430 130
                          L465 110
                          L495 150
                          L525 68
                          L555 165
                          L585 98
                          L615 130
                          L760 130
                          L795 105
                          L825 152
                          L855 62
                          L885 170
                          L915 100
                          L945 130
                          L1000 130
                        "
                      />
                    </svg>
                  </div>

                  <div className="chart-caption">
                    <span>Signal bus</span>
                    <strong>{latestServerHealth.length ? "LIVE" : "WAITING"}</strong>
                  </div>
                </div>

                <div className="telemetry-stats">
                  <TelemetryStat label="AVG CPU" value={formatPercent(avgCpu)} />
                  <TelemetryStat
                    label="AVG MEMORY"
                    value={formatPercent(avgMemory)}
                  />
                  <TelemetryStat
                    label="AVG DISK"
                    value={formatPercent(avgDisk)}
                  />
                  <TelemetryStat
                    label="AVG LATENCY"
                    value={formatMilliseconds(avgLatency)}
                  />
                </div>
              </div>
            </div>

            <div className="surface attention-card">
              <div className="surface-header">
                <div>
                  <span className="section-code">ATTENTION</span>
                  <h3>Needs review</h3>
                </div>
              </div>

              <div className="attention-list">
                <AttentionRow
                  label="Offline servers"
                  value={Number(attention.offlineServers || 0)}
                  tone="danger"
                />
                <AttentionRow
                  label="Degraded servers"
                  value={Number(attention.degradedServers || 0)}
                  tone="warning"
                />
                <AttentionRow
                  label="Critical incidents"
                  value={Number(attention.criticalIncidents || 0)}
                  tone="danger"
                />
                <AttentionRow
                  label="High incidents"
                  value={Number(attention.highIncidents || 0)}
                  tone="warning"
                />
                <AttentionRow
                  label="Active alerts"
                  value={Number(attention.activeAlerts || 0)}
                  tone="neutral"
                />
              </div>
            </div>
          </section>

          <section className="details-grid">
            <div className="surface incidents-card">
              <div className="surface-header">
                <div>
                  <span className="section-code">INCIDENT FEED</span>
                  <h3>Recent incidents</h3>
                </div>

                <span className="count-pill">{recentIncidents.length}</span>
              </div>

              {dashboardLoading && !dashboard ? (
                <DashboardLoader text="Loading incidents" />
              ) : recentIncidents.length ? (
                <div className="incident-feed-list">
                  {recentIncidents.map((incident) => (
                    <IncidentFeedRow key={incident.id} incident={incident} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<IncidentIcon />}
                  title="No recent incidents"
                  text="No incident records are currently available."
                />
              )}
            </div>

            <div className="surface servers-card">
              <div className="surface-header">
                <div>
                  <span className="section-code">SERVER HEALTH</span>
                  <h3>Server network</h3>
                </div>

                <span className="count-pill">{latestServerHealth.length}</span>
              </div>

              {dashboardLoading && !dashboard ? (
                <DashboardLoader text="Loading servers" />
              ) : latestServerHealth.length ? (
                <div className="server-health-list">
                  {latestServerHealth.map((server, index) => (
                    <ServerHealthRow
                      key={server.serverId}
                      index={index + 1}
                      server={server}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<ServerIcon />}
                  title="No server telemetry"
                  text="Server health will appear after heartbeat data is received."
                />
              )}
            </div>
          </section>

          <section className="surface activity-strip">
            <div className="activity-left">
              <span className="live-dot" />

              <div>
                <small>OPERATIONS CHANNEL</small>
                <strong>PulseOps control session active</strong>
              </div>
            </div>

            <div className="activity-meta">
              <span>Operator</span>
              <strong>{user?.fullName || "Authenticated User"}</strong>
              <i />
              <span>Role</span>
              <strong>{user?.role?.code || "USER"}</strong>

              {dashboard?.generatedAt && (
                <>
                  <i />
                  <span>Sync</span>
                  <strong>{formatTime(dashboard.generatedAt)}</strong>
                </>
              )}
            </div>
          </section>
        </div>
      </section>

      <nav className="mobile-bottom-nav">
        <button type="button" className="active">
          <DashboardIcon />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/servers")}
        >
          <ServerIcon />
          <span>Servers</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/incidents")}
        >
          <IncidentIcon />
          <span>Incidents</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/alerts")}
        >
          <AlertIcon />
          <span>Alerts</span>
        </button>
      </nav>
    </main>
  );
}

function SidebarItem({
  icon,
  label,
  active = false,
  badge,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`sidebar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{label}</span>

      {badge !== undefined && badge !== null && (
        <span className="sidebar-item-badge">{badge}</span>
      )}
    </button>
  );
}

function PremiumMetricCard({ label, value, detail, status, icon }) {
  return (
    <article className={`premium-metric ${status}`}>
      <div className="metric-icon-shell">{icon}</div>

      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TelemetryStat({ label, value }) {
  return (
    <div className="telemetry-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <i />
    </div>
  );
}

function AttentionRow({ label, value, tone }) {
  return (
    <div className={`attention-row ${tone}`}>
      <div>
        <span className="attention-dot" />
        <span>{label}</span>
      </div>

      <strong>{value}</strong>
    </div>
  );
}

function IncidentFeedRow({ incident }) {
  const severity = String(incident?.severity || "UNKNOWN").toLowerCase();
  const status = String(incident?.status || "UNKNOWN").toLowerCase();

  return (
    <article className="incident-row">
      <div className={`incident-severity-dot severity-${severity}`} />

      <div className="incident-row-main">
        <div className="incident-row-top">
          <strong>{incident?.title || "Untitled incident"}</strong>

          <span className={`incident-state state-${status}`}>
            {incident?.status || "UNKNOWN"}
          </span>
        </div>

        <div className="incident-row-meta">
          <span className={`severity-text severity-${severity}`}>
            {incident?.severity || "UNKNOWN"}
          </span>

          <span>{incident?.serverCode || incident?.serverName || "Unknown server"}</span>

          <span>{formatDateTime(incident?.openedAt || incident?.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}

function ServerHealthRow({ index, server }) {
  const status = String(
    server?.observedStatus || server?.status || "UNKNOWN"
  ).toUpperCase();

  const statusClass = status.toLowerCase();

  return (
    <article className="server-health-row">
      <div className="server-number">{String(index).padStart(2, "0")}</div>

      <div className="server-health-icon">
        <ServerIcon />
      </div>

      <div className="server-health-main">
        <div className="server-health-top">
          <strong>{server?.serverName || server?.serverCode || "Unnamed server"}</strong>

          <span className={`server-status status-${statusClass}`}>
            <i />
            {status}
          </span>
        </div>

        <div className="server-health-meta">
          <span>{server?.serverCode || "NO-CODE"}</span>
          <span>{server?.environment || "UNKNOWN ENV"}</span>
        </div>

        <div className="server-mini-stats">
          <span>CPU <strong>{formatPercent(server?.cpuUsagePercent)}</strong></span>
          <span>MEM <strong>{formatPercent(server?.memoryUsagePercent)}</strong></span>
          <span>LAT <strong>{formatMilliseconds(server?.responseTimeMs)}</strong></span>
        </div>

        <div className="server-last-seen">
          Last signal:{" "}
          {formatDateTime(
            server?.healthReceivedAt ||
              server?.lastReceivedAt ||
              server?.lastSeenAt
          )}
        </div>
      </div>
    </article>
  );
}

function DashboardLoader({ text }) {
  return (
    <div className="dashboard-loader">
      <span />
      <strong>{text}</strong>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function averageMetric(rows, key) {
  const values = rows
    .map((row) => row?.[key])
    .filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    )
    .map(Number)
    .filter(Number.isFinite);

  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0
    ) / values.length
  );
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return `${Number(value).toFixed(1)}%`;
}

function formatMilliseconds(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return `${Math.round(Number(value))} ms`;
}

function formatDateTime(value) {
  if (!value) {
    return "No telemetry";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getInitials(name = "") {
  const pieces = name.trim().split(/\s+/).filter(Boolean);

  if (!pieces.length) {
    return "OP";
  }

  if (pieces.length === 1) {
    return pieces[0].slice(0, 2).toUpperCase();
  }

  return `${pieces[0][0]}${pieces[pieces.length - 1][0]}`.toUpperCase();
}

function HeartbeatIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M2 17H8L11 11L15 23L19 6L23 19L26 14H30" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </svg>
  );
}

function IncidentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 21 20H3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8C6 16 3 17 3 17H21C21 17 18 16 18 8Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

function RuleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );
}

function NotificationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8V14L4 17H20L18 14Z" />
      <path d="M10 20h4" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12H6L8 7L11 17L14 4L17 14L19 12H22" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18V14M9 18V10M14 18V7M19 18V4" />
    </svg>
  );
}