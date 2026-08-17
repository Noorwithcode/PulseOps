import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext.jsx";

import {
  alertApi,
  ALERT_METRIC_TYPES,
  ALERT_SEVERITIES,
  ALERT_STATE_STATUSES,
} from "../api/alertApi.js";

import "./DashboardPage.css";
import "./AlertsPage.css";

export default function AlertsPage() {
  const navigate =
    useNavigate();

  const {
    user,
    accessToken,
    logout,
    refreshAccessToken,
  } = useAuth();

  const [
    now,
    setNow,
  ] = useState(
    new Date()
  );

  const [
    sidebarOpen,
    setSidebarOpen,
  ] = useState(false);

  const [
    alerts,
    setAlerts,
  ] = useState([]);

  const [
    summary,
    setSummary,
  ] = useState({
    totalStates: 0,
    activeAlerts: 0,
    normalStates: 0,
    breachingStates: 0,
    alertingStates: 0,
    recoveringStates: 0,
  });

  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [
    filters,
    setFilters,
  ] = useState({
    page: 1,
    limit: 20,
    search: "",
    status: "",
    severity: "",
    metricType: "",
    serverId: "",
    ruleId: "",
    isEnabled: "",
    activeOnly: false,
  });

  const [
    searchDraft,
    setSearchDraft,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    summaryLoading,
    setSummaryLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  const [
    selectedAlert,
    setSelectedAlert,
  ] = useState(null);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    evaluations,
    setEvaluations,
  ] = useState([]);

  const [
    evaluationPagination,
    setEvaluationPagination,
  ] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [
    evaluationsLoading,
    setEvaluationsLoading,
  ] = useState(false);

  const requestRunningRef =
    useRef(false);

  useEffect(() => {
    const timer =
      setInterval(
        () =>
          setNow(
            new Date()
          ),
        1000
      );

    return () =>
      clearInterval(timer);
  }, []);

  const utcTime =
    useMemo(
      () =>
        now.toLocaleTimeString(
          "en-GB",
          {
            hour12: false,
            timeZone: "UTC",
          }
        ),
      [now]
    );

  const utcDate =
    useMemo(
      () =>
        now
          .toLocaleDateString(
            "en-GB",
            {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }
          )
          .toUpperCase(),
      [now]
    );

  const runAuthorizedRequest =
    useCallback(
      async (
        operation
      ) => {
        let token =
          accessToken;

        try {
          return await operation(
            token
          );
        } catch (requestError) {
          if (
            requestError?.status !==
            401
          ) {
            throw requestError;
          }

          token =
            await refreshAccessToken();

          return operation(
            token
          );
        }
      },
      [
        accessToken,
        refreshAccessToken,
      ]
    );

  const loadSummary =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (!accessToken) {
          setSummaryLoading(false);
          return;
        }

        if (!silent) {
          setSummaryLoading(true);
        }

        try {
          const response =
            await runAuthorizedRequest(
              (token) =>
                alertApi.summary(
                  token
                )
            );

          setSummary(
            response?.data
              ?.summary || {
              totalStates: 0,
              activeAlerts: 0,
              normalStates: 0,
              breachingStates: 0,
              alertingStates: 0,
              recoveringStates: 0,
            }
          );
        } catch (requestError) {
          setActionError(
            requestError?.message ||
              "Alert summary could not be loaded."
          );
        } finally {
          setSummaryLoading(false);
        }
      },
      [
        accessToken,
        runAuthorizedRequest,
      ]
    );

  const loadAlerts =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (
          !accessToken ||
          requestRunningRef.current
        ) {
          return;
        }

        requestRunningRef.current =
          true;

        if (!silent) {
          setLoading(true);
        }

        try {
          const response =
            await runAuthorizedRequest(
              (token) =>
                alertApi.list(
                  token,
                  {
                    ...filters,

                    serverId:
                      filters.serverId ||
                      undefined,

                    ruleId:
                      filters.ruleId ||
                      undefined,

                    isEnabled:
                      filters.isEnabled ===
                      ""
                        ? undefined
                        : filters.isEnabled ===
                          "true",

                    activeOnly:
                      filters.activeOnly ||
                      undefined,
                  }
                )
            );

          const data =
            response?.data || {};

          setAlerts(
            Array.isArray(
              data.alerts
            )
              ? data.alerts
              : []
          );

          setPagination({
            page:
              Number(
                data.pagination
                  ?.page
              ) || 1,

            limit:
              Number(
                data.pagination
                  ?.limit
              ) || 20,

            total:
              Number(
                data.pagination
                  ?.total
              ) || 0,

            totalPages:
              Number(
                data.pagination
                  ?.totalPages
              ) || 1,
          });

          setError("");
        } catch (requestError) {
          setError(
            requestError?.message ||
              "Alerts could not be loaded."
          );
        } finally {
          requestRunningRef.current =
            false;

          setLoading(false);
        }
      },
      [
        accessToken,
        filters,
        runAuthorizedRequest,
      ]
    );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    loadAlerts();
    loadSummary();

    const timer =
      setInterval(() => {
        loadAlerts({
          silent: true,
        });

        loadSummary({
          silent: true,
        });
      }, 30000);

    return () =>
      clearInterval(timer);
  }, [
    accessToken,
    loadAlerts,
    loadSummary,
  ]);

  useEffect(() => {
    const timer =
      setTimeout(() => {
        setFilters(
          (
            current
          ) => {
            const nextSearch =
              searchDraft.trim();

            if (
              current.search ===
              nextSearch
            ) {
              return current;
            }

            return {
              ...current,
              page: 1,
              search:
                nextSearch,
            };
          }
        );
      }, 350);

    return () =>
      clearTimeout(timer);
  }, [searchDraft]);

  const handleLogout =
    async () => {
      try {
        await logout();
      } finally {
        navigate(
          "/login",
          {
            replace: true,
          }
        );
      }
    };

  const updateFilter =
    (
      field,
      value
    ) => {
      setFilters(
        (
          current
        ) => ({
          ...current,
          page: 1,
          [field]: value,
        })
      );
    };

  const clearFilters =
    () => {
      setSearchDraft("");

      setFilters({
        page: 1,
        limit: 20,
        search: "",
        status: "",
        severity: "",
        metricType: "",
        serverId: "",
        ruleId: "",
        isEnabled: "",
        activeOnly: false,
      });
    };

  const refreshAll =
    async () => {
      await Promise.all([
        loadAlerts(),
        loadSummary(),
      ]);

      if (
        detailsOpen &&
        selectedAlert
      ) {
        await openDetails(
          selectedAlert,
          {
            preserveDrawer: true,
          }
        );
      }
    };

  const loadEvaluations =
    async (
      alertStateId,
      page = 1
    ) => {
      setEvaluationsLoading(
        true
      );

      try {
        const response =
          await runAuthorizedRequest(
            (token) =>
              alertApi.evaluations(
                token,
                alertStateId,
                {
                  page,
                  limit: 20,
                }
              )
          );

        const data =
          response?.data || {};

        setEvaluations(
          Array.isArray(
            data.evaluations
          )
            ? data.evaluations
            : []
        );

        setEvaluationPagination({
          page:
            Number(
              data.pagination
                ?.page
            ) || 1,

          limit:
            Number(
              data.pagination
                ?.limit
            ) || 20,

          total:
            Number(
              data.pagination
                ?.total
            ) || 0,

          totalPages:
            Number(
              data.pagination
                ?.totalPages
            ) || 1,
        });
      } catch (requestError) {
        setActionError(
          requestError?.message ||
            "Alert evaluation history could not be loaded."
        );

        setEvaluations([]);
      } finally {
        setEvaluationsLoading(
          false
        );
      }
    };

  const openDetails =
    async (
      alert,
      {
        preserveDrawer = false,
      } = {}
    ) => {
      if (!preserveDrawer) {
        setDetailsOpen(true);
      }

      setDetailsLoading(true);
      setSelectedAlert(alert);
      setActionError("");

      try {
        const response =
          await runAuthorizedRequest(
            (token) =>
              alertApi.getById(
                token,
                alert.id
              )
          );

        const freshAlert =
          response?.data
            ?.alert || alert;

        setSelectedAlert(
          freshAlert
        );

        await loadEvaluations(
          freshAlert.id,
          1
        );
      } catch (requestError) {
        setActionError(
          requestError?.message ||
            "Alert details could not be loaded."
        );
      } finally {
        setDetailsLoading(false);
      }
    };

  const changeEvaluationPage =
    async (
      page
    ) => {
      if (!selectedAlert) {
        return;
      }

      await loadEvaluations(
        selectedAlert.id,
        page
      );
    };

  const goToPage =
    (
      page
    ) => {
      setFilters(
        (
          current
        ) => ({
          ...current,
          page,
        })
      );
    };

  const visibleStats =
    useMemo(() => {
      const pageActive =
        alerts.filter(
          (
            alert
          ) =>
            Boolean(
              Number(
                alert.isActive
              )
            )
        ).length;

      const pageCritical =
        alerts.filter(
          (
            alert
          ) =>
            String(
              alert.severity
            ).toUpperCase() ===
            "CRITICAL"
        ).length;

      return {
        pageActive,
        pageCritical,
      };
    }, [alerts]);

  return (
    <main className="ops-shell alerts-shell">
      <div
        className="ops-bg-grid"
        aria-hidden="true"
      />

      <aside
        className={`ops-sidebar ${
          sidebarOpen
            ? "is-open"
            : ""
        }`}
      >
        <div className="brand-block">
          <div className="brand-mark">
            <HeartbeatIcon />
          </div>

          <div>
            <div className="brand-name">
              PULSE
              <span>OPS</span>
            </div>

            <div className="brand-subtitle">
              OPERATIONS CONTROL
            </div>
          </div>
        </div>

        <div className="sidebar-label">
          WORKSPACE
        </div>

        <nav className="sidebar-nav">
          <SidebarItem
            icon={
              <DashboardIcon />
            }
            label="Overview"
            onClick={() =>
              navigate("/")
            }
          />

          <SidebarItem
            icon={
              <ServerIcon />
            }
            label="Servers"
            onClick={() =>
              navigate(
                "/servers"
              )
            }
          />

          <SidebarItem
            icon={
              <IncidentIcon />
            }
            label="Incidents"
            onClick={() =>
              navigate(
                "/incidents"
              )
            }
          />

          <SidebarItem
            active
            icon={
              <AlertIcon />
            }
            label="Alerts"
            badge={
              summary.activeAlerts
            }
          />

          <SidebarItem
            icon={
              <RuleIcon />
            }
            label="Alert Rules"
            onClick={() =>
              navigate(
                "/alert-rules"
              )
            }
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
              <small>
                ALERT PIPELINE
              </small>

              <strong>
                LIVE
              </strong>
            </div>
          </div>

          <div className="operator-card">
            <div className="operator-avatar">
              {getInitials(
                user?.fullName
              )}
            </div>

            <div className="operator-copy">
              <strong>
                {user?.fullName ||
                  "Operator"}
              </strong>

              <span>
                {user?.role?.code ||
                  "USER"}
              </span>
            </div>

            <button
              type="button"
              className="sidebar-logout"
              onClick={
                handleLogout
              }
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
          onClick={() =>
            setSidebarOpen(false)
          }
          aria-label="Close navigation"
        />
      )}

      <section className="ops-main">
        <header className="ops-header">
          <div className="header-start">
            <button
              type="button"
              className="mobile-menu"
              onClick={() =>
                setSidebarOpen(true)
              }
              aria-label="Open navigation"
            >
              <MenuIcon />
            </button>

            <div className="header-title">
              <div className="breadcrumb">
                PULSEOPS / ALERTS
              </div>

              <h1>
                Alert Operations
              </h1>
            </div>
          </div>

          <div className="header-end">
            <div className="session-chip">
              <span className="live-dot" />

              <div>
                <small>
                  ALERT ENGINE
                </small>

                <strong>
                  ACTIVE
                </strong>
              </div>
            </div>

            <div className="utc-block">
              <small>
                UTC
              </small>

              <strong>
                {utcTime}
              </strong>

              <span>
                {utcDate}
              </span>
            </div>

            <button
              type="button"
              className="header-icon-button"
              aria-label="Notifications"
            >
              <NotificationIcon />
            </button>

            <button
              type="button"
              className="mobile-logout"
              onClick={
                handleLogout
              }
              aria-label="Sign out"
            >
              <LogoutIcon />
            </button>
          </div>
        </header>

        <div className="ops-content alerts-content">
          {error && (
            <div className="dashboard-error-banner">
              <div>
                <strong>
                  ALERT DATA LINK ERROR
                </strong>

                <span>
                  {error}
                </span>
              </div>

              <button
                type="button"
                onClick={
                  refreshAll
                }
              >
                RETRY
              </button>
            </div>
          )}

          {actionError && (
            <div className="alerts-action-error">
              <AlertIcon />

              <strong>
                {actionError}
              </strong>

              <button
                type="button"
                onClick={() =>
                  setActionError("")
                }
              >
                ×
              </button>
            </div>
          )}

          <section className="alerts-hero">
            <div>
              <div className="eyebrow">
                LIVE THRESHOLD STATE
              </div>

              <h2>
                See every signal before
                it becomes an incident.
              </h2>

              <p>
                Track current threshold
                state, active alerts,
                recovery progress and
                historical evaluations
                across monitored
                infrastructure.
              </p>
            </div>

            <button
              type="button"
              className="alerts-refresh-main"
              onClick={
                refreshAll
              }
              disabled={
                loading ||
                summaryLoading
              }
            >
              <RefreshIcon />

              Refresh
            </button>
          </section>

          <section className="alert-summary-grid">
            <AlertSummaryCard
              label="Total States"
              value={
                summaryLoading
                  ? "…"
                  : summary.totalStates
              }
              tone="neutral"
              helper="Rule/server states"
            />

            <AlertSummaryCard
              label="Active Alerts"
              value={
                summaryLoading
                  ? "…"
                  : summary.activeAlerts
              }
              tone="danger"
              helper="Alerting + recovering"
            />

            <AlertSummaryCard
              label="Breaching"
              value={
                summaryLoading
                  ? "…"
                  : summary.breachingStates
              }
              tone="warning"
              helper="Before alert opens"
            />

            <AlertSummaryCard
              label="Recovering"
              value={
                summaryLoading
                  ? "…"
                  : summary.recoveringStates
              }
              tone="good"
              helper="Awaiting recovery checks"
            />
          </section>

          <section className="surface alerts-browser">
            <div className="alerts-toolbar">
              <div className="alerts-search">
                <SearchIcon />

                <input
                  type="search"
                  value={
                    searchDraft
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchDraft(
                      event.target
                        .value
                    )
                  }
                  placeholder="Search rule, server, code or description..."
                />
              </div>

              <div className="alerts-filter-grid">
                <AlertFilter
                  label="State"
                  value={
                    filters.status
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "status",
                      value
                    )
                  }
                >
                  <option value="">
                    All states
                  </option>

                  {ALERT_STATE_STATUSES.map(
                    (
                      status
                    ) => (
                      <option
                        key={
                          status
                        }
                        value={
                          status
                        }
                      >
                        {formatLabel(
                          status
                        )}
                      </option>
                    )
                  )}
                </AlertFilter>

                <AlertFilter
                  label="Severity"
                  value={
                    filters.severity
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "severity",
                      value
                    )
                  }
                >
                  <option value="">
                    All severities
                  </option>

                  {ALERT_SEVERITIES.map(
                    (
                      severity
                    ) => (
                      <option
                        key={
                          severity
                        }
                        value={
                          severity
                        }
                      >
                        {formatLabel(
                          severity
                        )}
                      </option>
                    )
                  )}
                </AlertFilter>

                <AlertFilter
                  label="Metric"
                  value={
                    filters.metricType
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "metricType",
                      value
                    )
                  }
                >
                  <option value="">
                    All metrics
                  </option>

                  {ALERT_METRIC_TYPES.map(
                    (
                      metric
                    ) => (
                      <option
                        key={
                          metric
                        }
                        value={
                          metric
                        }
                      >
                        {metricLabel(
                          metric
                        )}
                      </option>
                    )
                  )}
                </AlertFilter>

                <AlertFilter
                  label="Rule"
                  value={
                    filters.isEnabled
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "isEnabled",
                      value
                    )
                  }
                >
                  <option value="">
                    All rules
                  </option>

                  <option value="true">
                    Enabled only
                  </option>

                  <option value="false">
                    Disabled only
                  </option>
                </AlertFilter>

                <label className="alerts-id-filter">
                  <span>
                    Server ID
                  </span>

                  <input
                    type="number"
                    min="1"
                    value={
                      filters.serverId
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "serverId",
                        event.target
                          .value
                      )
                    }
                    placeholder="Any"
                  />
                </label>

                <label className="alerts-id-filter">
                  <span>
                    Rule ID
                  </span>

                  <input
                    type="number"
                    min="1"
                    value={
                      filters.ruleId
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "ruleId",
                        event.target
                          .value
                      )
                    }
                    placeholder="Any"
                  />
                </label>
              </div>

              <div className="alerts-toolbar-bottom">
                <label className="active-alert-toggle">
                  <input
                    type="checkbox"
                    checked={
                      filters.activeOnly
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "activeOnly",
                        event.target
                          .checked
                      )
                    }
                  />

                  <span>
                    Show active alerts
                    only
                  </span>
                </label>

                <button
                  type="button"
                  className="alerts-clear-filters"
                  onClick={
                    clearFilters
                  }
                >
                  Clear filters
                </button>
              </div>
            </div>

            <div className="alerts-browser-meta">
              <div>
                Showing{" "}
                <strong>
                  {alerts.length}
                </strong>{" "}
                of{" "}
                <strong>
                  {pagination.total}
                </strong>{" "}
                states
              </div>

              <div className="alerts-page-meta">
                <span>
                  Active on page
                  <strong>
                    {visibleStats.pageActive}
                  </strong>
                </span>

                <span>
                  Critical on page
                  <strong>
                    {visibleStats.pageCritical}
                  </strong>
                </span>
              </div>
            </div>

            {loading ? (
              <AlertsLoader />
            ) : alerts.length ? (
              <>
                <div className="alerts-table-wrap">
                  <table className="alerts-table">
                    <thead>
                      <tr>
                        <th>
                          Alert Rule
                        </th>

                        <th>
                          Server
                        </th>

                        <th>
                          Metric
                        </th>

                        <th>
                          Last Value
                        </th>

                        <th>
                          State
                        </th>

                        <th>
                          Severity
                        </th>

                        <th>
                          Progress
                        </th>

                        <th>
                          Updated
                        </th>

                        <th
                          aria-label="Open"
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {alerts.map(
                        (
                          alert
                        ) => (
                          <AlertTableRow
                            key={
                              alert.id
                            }
                            alert={
                              alert
                            }
                            onOpen={
                              openDetails
                            }
                          />
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="alerts-mobile-list">
                  {alerts.map(
                    (
                      alert
                    ) => (
                      <AlertMobileCard
                        key={
                          alert.id
                        }
                        alert={
                          alert
                        }
                        onOpen={
                          openDetails
                        }
                      />
                    )
                  )}
                </div>

                <AlertsPagination
                  pagination={
                    pagination
                  }
                  onPage={
                    goToPage
                  }
                />
              </>
            ) : (
              <AlertsEmpty />
            )}
          </section>
        </div>
      </section>

      <nav className="mobile-bottom-nav">
        <button
          type="button"
          onClick={() =>
            navigate("/")
          }
        >
          <DashboardIcon />

          <span>
            Home
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/servers"
            )
          }
        >
          <ServerIcon />

          <span>
            Servers
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/incidents"
            )
          }
        >
          <IncidentIcon />

          <span>
            Incidents
          </span>
        </button>

        <button
          type="button"
          className="active"
        >
          <AlertIcon />

          <span>
            Alerts
          </span>
        </button>
      </nav>

      {detailsOpen && (
        <AlertDetailsDrawer
          alert={
            selectedAlert
          }
          loading={
            detailsLoading
          }
          evaluations={
            evaluations
          }
          evaluationsLoading={
            evaluationsLoading
          }
          evaluationPagination={
            evaluationPagination
          }
          onEvaluationPage={
            changeEvaluationPage
          }
          onClose={() => {
            setDetailsOpen(false);
            setSelectedAlert(null);
            setEvaluations([]);
          }}
          onRefresh={() =>
            openDetails(
              selectedAlert,
              {
                preserveDrawer: true,
              }
            )
          }
        />
      )}
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
      className={`sidebar-item ${
        active
          ? "active"
          : ""
      }`}
      onClick={
        onClick
      }
    >
      <span className="sidebar-item-icon">
        {icon}
      </span>

      <span className="sidebar-item-label">
        {label}
      </span>

      {badge !==
        undefined &&
        badge !== null && (
        <span className="sidebar-item-badge">
          {badge}
        </span>
      )}
    </button>
  );
}

function AlertSummaryCard({
  label,
  value,
  helper,
  tone,
}) {
  return (
    <article
      className={`alert-summary-card ${tone}`}
    >
      <div>
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

        <small>
          {helper}
        </small>
      </div>

      <i />
    </article>
  );
}

function AlertFilter({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="alerts-filter-select">
      <span>
        {label}
      </span>

      <select
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
      >
        {children}
      </select>
    </label>
  );
}

function AlertTableRow({
  alert,
  onOpen,
}) {
  return (
    <tr
      className={
        Number(
          alert.isActive
        )
          ? "is-active-alert"
          : ""
      }
    >
      <td>
        <button
          type="button"
          className="alert-rule-identity"
          onClick={() =>
            onOpen(
              alert
            )
          }
        >
          <span className="alert-rule-icon">
            <AlertIcon />
          </span>

          <span>
            <strong>
              {alert.ruleName}
            </strong>

            <small>
              {alert.ruleCode}
            </small>
          </span>
        </button>
      </td>

      <td>
        <div className="alert-server-cell">
          <strong>
            {alert.serverCode}
          </strong>

          <span>
            {alert.serverName}
          </span>

          <small>
            {alert.environment}
            {" · "}
            {alert.serverStatus}
          </small>
        </div>
      </td>

      <td>
        <div className="alert-metric-cell">
          <strong>
            {metricLabel(
              alert.metricType
            )}
          </strong>

          <span>
            {operatorSymbol(
              alert.comparisonOperator
            )}{" "}
            {formatMetricValue(
              alert.metricType,
              alert.thresholdValue
            )}
          </span>
        </div>
      </td>

      <td>
        <strong className="alert-last-value">
          {formatMetricValue(
            alert.metricType,
            alert.lastMetricValue
          )}
        </strong>
      </td>

      <td>
        <AlertStateBadge
          status={
            alert.currentStatus
          }
        />
      </td>

      <td>
        <AlertSeverityBadge
          severity={
            alert.severity
          }
        />
      </td>

      <td>
        <AlertProgress
          alert={
            alert
          }
        />
      </td>

      <td>
        <span className="alert-updated-time">
          {formatDateTime(
            alert.updatedAt
          )}
        </span>
      </td>

      <td>
        <button
          type="button"
          className="alert-open-button"
          onClick={() =>
            onOpen(
              alert
            )
          }
          aria-label="View alert details"
        >
          <ChevronRightIcon />
        </button>
      </td>
    </tr>
  );
}

function AlertMobileCard({
  alert,
  onOpen,
}) {
  return (
    <button
      type="button"
      className={`alert-mobile-card ${
        Number(
          alert.isActive
        )
          ? "is-active-alert"
          : ""
      }`}
      onClick={() =>
        onOpen(
          alert
        )
      }
    >
      <div className="alert-mobile-top">
        <AlertStateBadge
          status={
            alert.currentStatus
          }
        />

        <AlertSeverityBadge
          severity={
            alert.severity
          }
        />
      </div>

      <strong className="alert-mobile-title">
        {alert.ruleName}
      </strong>

      <span className="alert-mobile-code">
        {alert.ruleCode}
      </span>

      <div className="alert-mobile-server">
        <strong>
          {alert.serverCode}
        </strong>

        <span>
          {alert.serverName}
        </span>
      </div>

      <div className="alert-mobile-metrics">
        <span>
          {metricLabel(
            alert.metricType
          )}
        </span>

        <strong>
          {formatMetricValue(
            alert.metricType,
            alert.lastMetricValue
          )}
        </strong>

        <small>
          Threshold{" "}
          {operatorSymbol(
            alert.comparisonOperator
          )}{" "}
          {formatMetricValue(
            alert.metricType,
            alert.thresholdValue
          )}
        </small>
      </div>

      <AlertProgress
        alert={
          alert
        }
      />
    </button>
  );
}

function AlertProgress({
  alert,
}) {
  const status =
    String(
      alert.currentStatus ||
        "NORMAL"
    ).toUpperCase();

  let label =
    "Stable";

  let current = 0;
  let required = 0;

  if (
    status ===
      "BREACHING" ||
    status ===
      "ALERTING"
  ) {
    label =
      "Breaches";

    current =
      Number(
        alert.consecutiveBreaches ||
          0
      );

    required =
      Number(
        alert.consecutiveBreachesRequired ||
          0
      );
  } else if (
    status ===
    "RECOVERING"
  ) {
    label =
      "Recoveries";

    current =
      Number(
        alert.consecutiveRecoveries ||
          0
      );

    required =
      Number(
        alert.consecutiveRecoveriesRequired ||
          0
      );
  }

  const ratio =
    required > 0
      ? Math.min(
          (current /
            required) *
            100,
          100
        )
      : 0;

  return (
    <div className="alert-progress">
      <div>
        <span>
          {label}
        </span>

        <strong>
          {required
            ? `${current}/${required}`
            : "—"}
        </strong>
      </div>

      <i>
        <b
          style={{
            width: `${ratio}%`,
          }}
        />
      </i>
    </div>
  );
}

function AlertStateBadge({
  status,
}) {
  const normalized =
    String(
      status ||
        "NORMAL"
    ).toUpperCase();

  return (
    <span
      className={`alert-state-badge state-${normalized.toLowerCase()}`}
    >
      <i />

      {normalized}
    </span>
  );
}

function AlertSeverityBadge({
  severity,
}) {
  const normalized =
    String(
      severity ||
        "WARNING"
    ).toUpperCase();

  return (
    <span
      className={`alert-severity-badge severity-${normalized.toLowerCase()}`}
    >
      {normalized}
    </span>
  );
}

function AlertsPagination({
  pagination,
  onPage,
}) {
  const page =
    pagination.page;

  const totalPages =
    Math.max(
      pagination.totalPages,
      1
    );

  return (
    <div className="alerts-pagination">
      <button
        type="button"
        disabled={
          page <= 1
        }
        onClick={() =>
          onPage(
            page - 1
          )
        }
      >
        <ChevronLeftIcon />

        Previous
      </button>

      <span>
        Page{" "}
        <strong>
          {page}
        </strong>{" "}
        of{" "}
        <strong>
          {totalPages}
        </strong>
      </span>

      <button
        type="button"
        disabled={
          page >=
          totalPages
        }
        onClick={() =>
          onPage(
            page + 1
          )
        }
      >
        Next

        <ChevronRightIcon />
      </button>
    </div>
  );
}

function AlertsLoader() {
  return (
    <div className="alerts-loader">
      <span />

      <strong>
        Loading alert states
      </strong>
    </div>
  );
}

function AlertsEmpty() {
  return (
    <div className="alerts-empty">
      <div>
        <AlertIcon />
      </div>

      <strong>
        No alert states found
      </strong>

      <p>
        No alert state matches the
        current filters.
      </p>
    </div>
  );
}

function AlertDetailsDrawer({
  alert,
  loading,
  evaluations,
  evaluationsLoading,
  evaluationPagination,
  onEvaluationPage,
  onClose,
  onRefresh,
}) {
  if (loading) {
    return (
      <div className="alerts-drawer-layer">
        <button
          type="button"
          className="alerts-drawer-backdrop"
          onClick={
            onClose
          }
          aria-label="Close alert details"
        />

        <aside className="alerts-details-drawer">
          <AlertsLoader />
        </aside>
      </div>
    );
  }

  if (!alert) {
    return null;
  }

  return (
    <div className="alerts-drawer-layer">
      <button
        type="button"
        className="alerts-drawer-backdrop"
        onClick={
          onClose
        }
        aria-label="Close alert details"
      />

      <aside className="alerts-details-drawer">
        <div className="alerts-drawer-header">
          <div>
            <span>
              ALERT STATE
            </span>

            <h3>
              {alert.ruleCode}
            </h3>
          </div>

          <button
            type="button"
            className="alerts-drawer-close"
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        <div className="alerts-drawer-state">
          <div>
            <AlertStateBadge
              status={
                alert.currentStatus
              }
            />

            <AlertSeverityBadge
              severity={
                alert.severity
              }
            />
          </div>

          <button
            type="button"
            onClick={
              onRefresh
            }
          >
            <RefreshIcon />

            Refresh
          </button>
        </div>

        <div className="alerts-drawer-title">
          <h4>
            {alert.ruleName}
          </h4>

          <p>
            {alert.ruleDescription ||
              "No description available."}
          </p>
        </div>

        <section className="alerts-detail-section">
          <span className="alerts-section-label">
            CURRENT SIGNAL
          </span>

          <AlertDetailRow
            label="Server"
            value={`${alert.serverName} (${alert.serverCode})`}
          />

          <AlertDetailRow
            label="Environment"
            value={
              alert.environment
            }
          />

          <AlertDetailRow
            label="Server Status"
            value={
              alert.serverStatus
            }
          />

          <AlertDetailRow
            label="Metric"
            value={
              metricLabel(
                alert.metricType
              )
            }
          />

          <AlertDetailRow
            label="Last Value"
            value={
              formatMetricValue(
                alert.metricType,
                alert.lastMetricValue
              )
            }
          />

          <AlertDetailRow
            label="Threshold"
            value={`${operatorSymbol(
              alert.comparisonOperator
            )} ${formatMetricValue(
              alert.metricType,
              alert.thresholdValue
            )}`}
          />

          <AlertDetailRow
            label="Recovery"
            value={`${recoverySymbol(
              alert.comparisonOperator
            )} ${formatMetricValue(
              alert.metricType,
              alert.recoveryValue
            )}`}
          />
        </section>

        <section className="alerts-detail-section">
          <span className="alerts-section-label">
            STATE ENGINE
          </span>

          <AlertDetailRow
            label="State Version"
            value={
              alert.stateVersion
            }
          />

          <AlertDetailRow
            label="Rule Version"
            value={
              alert.ruleVersion
            }
          />

          <AlertDetailRow
            label="Health Check"
            value={
              alert.lastHealthCheckId
                ? `#${alert.lastHealthCheckId}`
                : "--"
            }
          />

          <AlertDetailRow
            label="Breaches"
            value={`${alert.consecutiveBreaches} / ${alert.consecutiveBreachesRequired}`}
          />

          <AlertDetailRow
            label="Recoveries"
            value={`${alert.consecutiveRecoveries} / ${alert.consecutiveRecoveriesRequired}`}
          />

          <AlertDetailRow
            label="Active Alert Key"
            value={
              alert.activeAlertKey ||
              "--"
            }
          />

          <AlertDetailRow
            label="Alert Started"
            value={
              formatDateTime(
                alert.alertStartedAt
              )
            }
          />

          <AlertDetailRow
            label="Last Recovered"
            value={
              formatDateTime(
                alert.lastRecoveredAt
              )
            }
          />

          <AlertDetailRow
            label="Updated"
            value={
              formatDateTime(
                alert.updatedAt
              )
            }
          />
        </section>

        <section className="alerts-detail-section alerts-evaluation-section">
          <div className="alerts-evaluation-heading">
            <div>
              <span className="alerts-section-label">
                EVALUATION HISTORY
              </span>

              <small>
                Newest first
              </small>
            </div>

            <strong>
              {evaluationPagination.total}
            </strong>
          </div>

          {evaluationsLoading ? (
            <div className="alerts-evaluation-loading">
              Loading evaluation
              history...
            </div>
          ) : evaluations.length ? (
            <div className="alerts-evaluation-list">
              {evaluations.map(
                (
                  evaluation
                ) => (
                  <EvaluationCard
                    key={
                      evaluation.id
                    }
                    evaluation={
                      evaluation
                    }
                    metricType={
                      alert.metricType
                    }
                  />
                )
              )}
            </div>
          ) : (
            <div className="alerts-evaluation-empty">
              No evaluation records
              available.
            </div>
          )}

          <div className="alerts-evaluation-pagination">
            <button
              type="button"
              disabled={
                evaluationPagination.page <=
                1
              }
              onClick={() =>
                onEvaluationPage(
                  evaluationPagination.page -
                    1
                )
              }
            >
              Previous
            </button>

            <span>
              Page{" "}
              {evaluationPagination.page}
              {" / "}
              {Math.max(
                evaluationPagination.totalPages,
                1
              )}
            </span>

            <button
              type="button"
              disabled={
                evaluationPagination.page >=
                Math.max(
                  evaluationPagination.totalPages,
                  1
                )
              }
              onClick={() =>
                onEvaluationPage(
                  evaluationPagination.page +
                    1
                )
              }
            >
              Next
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function AlertDetailRow({
  label,
  value,
}) {
  return (
    <div className="alerts-detail-row">
      <span>
        {label}
      </span>

      <strong>
        {value ??
          "--"}
      </strong>
    </div>
  );
}

function EvaluationCard({
  evaluation,
  metricType,
}) {
  return (
    <article
      className={`evaluation-card evaluation-${String(
        evaluation.evaluationResult ||
          "normal"
      ).toLowerCase()}`}
    >
      <div className="evaluation-card-top">
        <EvaluationResultBadge
          result={
            evaluation.evaluationResult
          }
        />

        <span>
          {formatDateTime(
            evaluation.createdAt
          )}
        </span>
      </div>

      <div className="evaluation-transition">
        <strong>
          {evaluation.stateBefore ||
            "--"}
        </strong>

        <ChevronRightIcon />

        <strong>
          {evaluation.stateAfter ||
            "--"}
        </strong>
      </div>

      <div className="evaluation-metric-row">
        <span>
          Metric
          <strong>
            {formatMetricValue(
              metricType,
              evaluation.metricValue
            )}
          </strong>
        </span>

        <span>
          Threshold
          <strong>
            {formatMetricValue(
              metricType,
              evaluation.thresholdValue
            )}
          </strong>
        </span>

        <span>
          Recovery
          <strong>
            {formatMetricValue(
              metricType,
              evaluation.recoveryValue
            )}
          </strong>
        </span>
      </div>

      <p>
        {evaluation.message ||
          "No evaluation message."}
      </p>

      <div className="evaluation-footer">
        <span>
          Health Check #
          {evaluation.healthCheckId}
        </span>

        <code>
          {evaluation.evaluationKey}
        </code>
      </div>
    </article>
  );
}

function EvaluationResultBadge({
  result,
}) {
  const normalized =
    String(
      result ||
        "NORMAL"
    ).toUpperCase();

  return (
    <span
      className={`evaluation-result-badge result-${normalized.toLowerCase()}`}
    >
      {normalized}
    </span>
  );
}

function metricLabel(
  metricType
) {
  const labels = {
    CPU_USAGE_PERCENT:
      "CPU Usage",

    MEMORY_USAGE_PERCENT:
      "Memory Usage",

    DISK_USAGE_PERCENT:
      "Disk Usage",

    RESPONSE_TIME_MS:
      "Response Time",
  };

  return (
    labels[metricType] ||
    formatLabel(
      metricType
    )
  );
}

function operatorSymbol(
  operator
) {
  const symbols = {
    GT: ">",
    GTE: "≥",
    LT: "<",
    LTE: "≤",
  };

  return (
    symbols[operator] ||
    operator ||
    "--"
  );
}

function recoverySymbol(
  operator
) {
  return (
    operator === "GT" ||
    operator === "GTE"
  )
    ? "<"
    : ">";
}

function formatMetricValue(
  metricType,
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "--";
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "--";
  }

  if (
    metricType ===
    "RESPONSE_TIME_MS"
  ) {
    return `${number} ms`;
  }

  return `${number}%`;
}

function formatDateTime(
  value
) {
  if (!value) {
    return "--";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown";
  }

  return date.toLocaleString(
    [],
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatLabel(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /(^|_)([a-z])/g,
      (
        _,
        prefix,
        letter
      ) =>
        `${
          prefix
            ? " "
            : ""
        }${letter.toUpperCase()}`
    );
}

function getInitials(
  name = ""
) {
  const pieces =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!pieces.length) {
    return "OP";
  }

  if (
    pieces.length === 1
  ) {
    return pieces[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${pieces[0][0]}${
    pieces[
      pieces.length -
        1
    ][0]
  }`.toUpperCase();
}

/* =========================================================
   ICONS
========================================================= */

function HeartbeatIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <path d="M2 17H8L11 11L15 23L19 6L23 19L26 14H30" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </svg>
  );
}

function IncidentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3 21 20H3Z" />
      <path d="M12 9v5M12 17h.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8C6 16 3 17 3 17H21C21 17 18 16 18 8Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

function RuleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );
}

function NotificationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8V14L4 17H20L18 14Z" />
      <path d="M10 20h4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M7 7a7 7 0 0 1 11 2M17 17a7 7 0 0 1-11-2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}