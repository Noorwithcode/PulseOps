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
  incidentApi,
  createIncidentIdempotencyKey,
} from "../api/incidentApi.js";

import {
  serverApi,
} from "../api/serverApi.js";

import "./DashboardPage.css";
import "./IncidentsPage.css";

const INCIDENT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
  "CLOSED",
];

const INCIDENT_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

const INCIDENT_SOURCES = [
  "AUTOMATIC",
  "MANUAL",
];

const INCIDENT_TYPES = [
  "SERVER_OFFLINE",
  "SERVER_DEGRADED",
  "HIGH_CPU",
  "HIGH_MEMORY",
  "HIGH_DISK",
  "HIGH_RESPONSE_TIME",
  "MANUAL",
];

const EMPTY_CREATE_FORM = {
  serverId: "",
  incidentType: "MANUAL",
  title: "",
  description: "",
  severity: "MEDIUM",
  assignedTo: "",
};

export default function IncidentsPage() {
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
    incidents,
    setIncidents,
  ] = useState([]);

  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    mutationError,
    setMutationError,
  ] = useState("");

  const [
    searchDraft,
    setSearchDraft,
  ] = useState("");

  const [
    filters,
    setFilters,
  ] = useState({
    page: 1,
    limit: 20,
    status: "",
    severity: "",
    source: "",
    incidentType: "",
    serverId: "",
    assignedTo: "",
    activeOnly: false,
    unassignedOnly: false,
    search: "",
  });

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    selectedIncident,
    setSelectedIncident,
  ] = useState(null);

  const [
    timeline,
    setTimeline,
  ] = useState([]);

  const [
    timelineLoading,
    setTimelineLoading,
  ] = useState(false);

  const [
    createOpen,
    setCreateOpen,
  ] = useState(false);

  const [
    createForm,
    setCreateForm,
  ] = useState(
    EMPTY_CREATE_FORM
  );

  const [
    createSubmitting,
    setCreateSubmitting,
  ] = useState(false);

  const createKeyRef =
    useRef(null);

  const [
    serverOptions,
    setServerOptions,
  ] = useState([]);

  const [
    actionModal,
    setActionModal,
  ] = useState(null);

  const [
    actionSubmitting,
    setActionSubmitting,
  ] = useState(false);

  const [
    actionValue,
    setActionValue,
  ] = useState("");

  const role =
    user?.role?.code ||
    "VIEWER";

  const canManage =
    role === "ADMIN" ||
    role === "RESPONDER";

  useEffect(() => {
    const timer =
      setInterval(() => {
        setNow(
          new Date()
        );
      }, 1000);

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
            requestError
              ?.status !== 401
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

  const loadIncidents =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (!accessToken) {
          return;
        }

        if (!silent) {
          setLoading(true);
        }

        try {
          const response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi.list(
                  token,
                  filters
                )
            );

          const result =
            response?.data || {};

          setIncidents(
            Array.isArray(
              result.incidents
            )
              ? result.incidents
              : []
          );

          setPagination({
            page:
              Number(
                result
                  ?.pagination
                  ?.page
              ) || 1,

            limit:
              Number(
                result
                  ?.pagination
                  ?.limit
              ) || 20,

            total:
              Number(
                result
                  ?.pagination
                  ?.total
              ) || 0,

            totalPages:
              Number(
                result
                  ?.pagination
                  ?.totalPages
              ) || 0,
          });

          setError("");
        } catch (requestError) {
          setError(
            requestError
              ?.message ||
              "Incidents could not be loaded."
          );
        } finally {
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
    loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    const timer =
      setTimeout(() => {
        setFilters(
          (current) => {
            const normalized =
              searchDraft.trim();

            if (
              current.search ===
              normalized
            ) {
              return current;
            }

            return {
              ...current,
              page: 1,
              search:
                normalized,
            };
          }
        );
      }, 350);

    return () =>
      clearTimeout(timer);
  }, [searchDraft]);

  const loadServerOptions =
    useCallback(
      async () => {
        if (!accessToken) {
          return;
        }

        try {
          const response =
            await runAuthorizedRequest(
              (token) =>
                serverApi.list(
                  token,
                  {
                    page: 1,
                    limit: 100,
                    sortBy: "name",
                    sortOrder: "ASC",
                  }
                )
            );

          setServerOptions(
            Array.isArray(
              response?.data
                ?.servers
            )
              ? response.data
                .servers
              : []
          );
        } catch {
          setServerOptions([]);
        }
      },
      [
        accessToken,
        runAuthorizedRequest,
      ]
    );

  const pageStats =
    useMemo(() => {
      let active = 0;
      let critical = 0;
      let unassigned = 0;

      for (
        const incident of incidents
      ) {
        const status =
          String(
            incident?.status ||
              ""
          ).toUpperCase();

        const severity =
          String(
            incident?.severity ||
              ""
          ).toUpperCase();

        if (
          status === "OPEN" ||
          status ===
            "ACKNOWLEDGED"
        ) {
          active += 1;
        }

        if (
          severity ===
          "CRITICAL"
        ) {
          critical += 1;
        }

        if (
          !incident
            ?.assignedTo
        ) {
          unassigned += 1;
        }
      }

      return {
        active,
        critical,
        unassigned,
      };
    }, [incidents]);

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
        (current) => ({
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
        status: "",
        severity: "",
        source: "",
        incidentType: "",
        serverId: "",
        assignedTo: "",
        activeOnly: false,
        unassignedOnly: false,
        search: "",
      });
    };

  const loadIncidentDetails =
    async (
      incidentId
    ) => {
      const response =
        await runAuthorizedRequest(
          (token) =>
            incidentApi.getById(
              token,
              incidentId
            )
        );

      return (
        response?.data
          ?.incident || null
      );
    };

  const loadIncidentTimeline =
    async (
      incidentId
    ) => {
      const response =
        await runAuthorizedRequest(
          (token) =>
            incidentApi.getTimeline(
              token,
              incidentId
            )
        );

      return (
        Array.isArray(
          response?.data
            ?.timeline
        )
          ? response.data
            .timeline
          : []
      );
    };

  const openDetails =
    async (
      incident
    ) => {
      setDetailsOpen(true);

      setSelectedIncident(
        incident
      );

      setDetailsLoading(true);
      setTimelineLoading(true);
      setMutationError("");

      try {
        const [
          freshIncident,
          freshTimeline,
        ] =
          await Promise.all([
            loadIncidentDetails(
              incident.id
            ),

            loadIncidentTimeline(
              incident.id
            ),
          ]);

        if (freshIncident) {
          setSelectedIncident(
            freshIncident
          );
        }

        setTimeline(
          freshTimeline
        );
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Incident details could not be loaded."
        );
      } finally {
        setDetailsLoading(false);
        setTimelineLoading(false);
      }
    };

  const refreshSelectedIncident =
    async (
      incidentId
    ) => {
      try {
        const [
          freshIncident,
          freshTimeline,
        ] =
          await Promise.all([
            loadIncidentDetails(
              incidentId
            ),

            loadIncidentTimeline(
              incidentId
            ),
          ]);

        if (freshIncident) {
          setSelectedIncident(
            freshIncident
          );
        }

        setTimeline(
          freshTimeline
        );

        return freshIncident;
      } catch {
        return null;
      }
    };

  const openCreate =
    async () => {
      if (!canManage) {
        return;
      }

      setMutationError("");
      setCreateForm(
        EMPTY_CREATE_FORM
      );

      createKeyRef.current =
        createIncidentIdempotencyKey();

      setCreateOpen(true);

      if (
        !serverOptions.length
      ) {
        await loadServerOptions();
      }
    };

  const closeCreate =
    () => {
      if (
        createSubmitting
      ) {
        return;
      }

      setCreateOpen(false);

      setCreateForm(
        EMPTY_CREATE_FORM
      );

      createKeyRef.current =
        null;
    };

  const submitCreate =
    async (
      event
    ) => {
      event.preventDefault();

      if (!canManage) {
        return;
      }

      setMutationError("");
      setCreateSubmitting(true);

      if (
        !createKeyRef.current
      ) {
        createKeyRef.current =
          createIncidentIdempotencyKey();
      }

      try {
        await runAuthorizedRequest(
          (token) =>
            incidentApi.create(
              token,
              {
                serverId:
                  Number(
                    createForm
                      .serverId
                  ),

                incidentType:
                  "MANUAL",

                title:
                  createForm
                    .title,

                description:
                  emptyToNull(
                    createForm
                      .description
                  ),

                severity:
                  createForm
                    .severity,

                assignedTo:
                  createForm
                    .assignedTo
                    ? Number(
                      createForm
                        .assignedTo
                    )
                    : null,
              },
              createKeyRef
                .current
            )
        );

        setCreateOpen(false);

        setCreateForm(
          EMPTY_CREATE_FORM
        );

        createKeyRef.current =
          null;

        await loadIncidents();
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Manual incident could not be created."
        );
      } finally {
        setCreateSubmitting(false);
      }
    };

  const openAction =
    (
      type,
      incident
    ) => {
      if (!canManage) {
        return;
      }

      setMutationError("");

      let defaultValue = "";

      if (
        type === "severity"
      ) {
        defaultValue =
          incident.severity ||
          "MEDIUM";
      }

      if (
        type === "assign"
      ) {
        defaultValue =
          incident
            .assignedTo
            ? String(
              incident
                .assignedTo
            )
            : "";
      }

      setActionValue(
        defaultValue
      );

      setActionModal({
        type,
        incident,
      });
    };

  const closeAction =
    () => {
      if (
        actionSubmitting
      ) {
        return;
      }

      setActionModal(null);
      setActionValue("");
    };

  const submitAction =
    async () => {
      if (
        !canManage ||
        !actionModal
      ) {
        return;
      }

      const {
        type,
        incident,
      } = actionModal;

      setActionSubmitting(true);
      setMutationError("");

      try {
        let response;

        if (
          type ===
          "acknowledge"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi
                  .acknowledge(
                    token,
                    incident.id,
                    Number(
                      incident
                        .version
                    )
                  )
            );
        } else if (
          type === "assign"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi.assign(
                  token,
                  incident.id,
                  {
                    assignedTo:
                      Number(
                        actionValue
                      ),

                    version:
                      Number(
                        incident
                          .version
                      ),
                  }
                )
            );
        } else if (
          type ===
          "unassign"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi
                  .unassign(
                    token,
                    incident.id,
                    Number(
                      incident
                        .version
                    )
                  )
            );
        } else if (
          type ===
          "severity"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi
                  .changeSeverity(
                    token,
                    incident.id,
                    {
                      severity:
                        actionValue,

                      version:
                        Number(
                          incident
                            .version
                        ),
                    }
                  )
            );
        } else if (
          type === "resolve"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi
                  .resolve(
                    token,
                    incident.id,
                    {
                      resolutionNotes:
                        actionValue,

                      version:
                        Number(
                          incident
                            .version
                        ),
                    }
                  )
            );
        } else if (
          type === "close"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi.close(
                  token,
                  incident.id,
                  Number(
                    incident
                      .version
                  )
                )
            );
        } else if (
          type === "reopen"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi.reopen(
                  token,
                  incident.id,
                  {
                    reason:
                      actionValue,

                    version:
                      Number(
                        incident
                          .version
                      ),
                  }
                )
            );
        } else if (
          type === "comment"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                incidentApi
                  .addComment(
                    token,
                    incident.id,
                    {
                      comment:
                        actionValue,

                      version:
                        Number(
                          incident
                            .version
                        ),
                    }
                  )
            );
        }

        const updatedIncident =
          response?.data
            ?.incident ||
          response?.data
            ?.data
            ?.incident ||
          null;

        setActionModal(null);
        setActionValue("");

        await loadIncidents({
          silent: true,
        });

        if (
          detailsOpen &&
          selectedIncident
            ?.id ===
            incident.id
        ) {
          if (
            updatedIncident
          ) {
            setSelectedIncident(
              updatedIncident
            );
          }

          await refreshSelectedIncident(
            incident.id
          );
        }
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Incident action could not be completed."
        );

        if (
          requestError
            ?.status === 409
        ) {
          await loadIncidents({
            silent: true,
          });

          if (
            detailsOpen
          ) {
            await refreshSelectedIncident(
              incident.id
            );
          }
        }
      } finally {
        setActionSubmitting(false);
      }
    };

  const goToPage =
    (
      page
    ) => {
      setFilters(
        (current) => ({
          ...current,
          page,
        })
      );
    };

  return (
    <main className="ops-shell incidents-shell">
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
            active
            icon={
              <IncidentIcon />
            }
            label="Incidents"
          />

          <SidebarItem
            icon={
              <AlertIcon />
            }
            label="Alerts"
            onClick={() =>
              navigate(
                "/alerts"
              )
            }
          />

          <SidebarItem
            icon={<RuleIcon />}
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
                SYSTEM LINK
              </small>

              <strong>
                AUTHENTICATED
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
                {role}
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
                PULSEOPS / INCIDENTS
              </div>

              <h1>
                Incident Management
              </h1>
            </div>
          </div>

          <div className="header-end">
            <div className="session-chip">
              <span className="live-dot" />

              <div>
                <small>
                  SESSION
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

              <span className="notification-dot" />
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

        <div className="ops-content incidents-content">
          {error && (
            <div className="dashboard-error-banner">
              <div>
                <strong>
                  INCIDENT LINK ERROR
                </strong>

                <span>
                  {error}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  loadIncidents()
                }
              >
                RETRY
              </button>
            </div>
          )}

          {mutationError && (
            <div className="incident-action-error">
              <span>
                <AlertIcon />
              </span>

              <strong>
                {mutationError}
              </strong>

              <button
                type="button"
                onClick={() =>
                  setMutationError("")
                }
              >
                ×
              </button>
            </div>
          )}

          <section className="incidents-hero">
            <div>
              <div className="eyebrow">
                RESPONSE OPERATIONS
              </div>

              <h2>
                Investigate, coordinate,
                resolve.
              </h2>

              <p>
                Track incident state,
                ownership, severity and
                immutable timeline events
                while preserving
                concurrency-safe actions.
              </p>
            </div>

            {canManage && (
              <button
                type="button"
                className="primary-action"
                onClick={
                  openCreate
                }
              >
                <PlusIcon />

                <span>
                  Create Incident
                </span>
              </button>
            )}
          </section>

          <section className="incident-stat-grid">
            <IncidentStatCard
              label="Results"
              value={
                pagination.total
              }
              tone="neutral"
            />

            <IncidentStatCard
              label="Active on page"
              value={
                pageStats.active
              }
              tone="good"
            />

            <IncidentStatCard
              label="Critical on page"
              value={
                pageStats.critical
              }
              tone="danger"
            />

            <IncidentStatCard
              label="Unassigned on page"
              value={
                pageStats.unassigned
              }
              tone="warning"
            />
          </section>

          <section className="surface incident-browser">
            <div className="incident-browser-toolbar">
              <div className="incident-search-wrap">
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
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="Search incident number, title, description or server..."
                  aria-label="Search incidents"
                />
              </div>

              <div className="incident-filter-grid">
                <FilterSelect
                  label="Status"
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
                    All statuses
                  </option>

                  {INCIDENT_STATUSES.map(
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
                </FilterSelect>

                <FilterSelect
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

                  {INCIDENT_SEVERITIES.map(
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
                </FilterSelect>

                <FilterSelect
                  label="Source"
                  value={
                    filters.source
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "source",
                      value
                    )
                  }
                >
                  <option value="">
                    All sources
                  </option>

                  {INCIDENT_SOURCES.map(
                    (
                      source
                    ) => (
                      <option
                        key={
                          source
                        }
                        value={
                          source
                        }
                      >
                        {formatLabel(
                          source
                        )}
                      </option>
                    )
                  )}
                </FilterSelect>

                <FilterSelect
                  label="Type"
                  value={
                    filters
                      .incidentType
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "incidentType",
                      value
                    )
                  }
                >
                  <option value="">
                    All types
                  </option>

                  {INCIDENT_TYPES.map(
                    (
                      incidentType
                    ) => (
                      <option
                        key={
                          incidentType
                        }
                        value={
                          incidentType
                        }
                      >
                        {formatLabel(
                          incidentType
                        )}
                      </option>
                    )
                  )}
                </FilterSelect>

                <label className="incident-id-filter">
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
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Any"
                  />
                </label>

                <label className="incident-id-filter">
                  <span>
                    Assigned User
                  </span>

                  <input
                    type="number"
                    min="1"
                    value={
                      filters
                        .assignedTo
                    }
                    disabled={
                      filters
                        .unassignedOnly
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "assignedTo",
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="Any"
                  />
                </label>

                <label className="incident-toggle">
                  <input
                    type="checkbox"
                    checked={
                      filters
                        .activeOnly
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "activeOnly",
                        event
                          .target
                          .checked
                      )
                    }
                  />

                  <span>
                    Active only
                  </span>
                </label>

                <label className="incident-toggle">
                  <input
                    type="checkbox"
                    checked={
                      filters
                        .unassignedOnly
                    }
                    onChange={(
                      event
                    ) => {
                      const checked =
                        event
                          .target
                          .checked;

                      setFilters(
                        (
                          current
                        ) => ({
                          ...current,
                          page: 1,
                          unassignedOnly:
                            checked,
                          assignedTo:
                            checked
                              ? ""
                              : current
                                .assignedTo,
                        })
                      );
                    }}
                  />

                  <span>
                    Unassigned only
                  </span>
                </label>

                <button
                  type="button"
                  className="clear-filter-button"
                  onClick={
                    clearFilters
                  }
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="incident-browser-meta">
              <div>
                <span>
                  Showing
                </span>

                <strong>
                  {incidents.length}
                </strong>

                <span>
                  of
                </span>

                <strong>
                  {pagination.total}
                </strong>

                <span>
                  incidents
                </span>
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={() =>
                  loadIncidents()
                }
                disabled={
                  loading
                }
              >
                <RefreshIcon />

                Refresh
              </button>
            </div>

            {loading ? (
              <IncidentListLoader />
            ) : incidents.length ? (
              <>
                <div className="incident-table-wrap">
                  <table className="incident-table">
                    <thead>
                      <tr>
                        <th>
                          Incident
                        </th>

                        <th>
                          Severity
                        </th>

                        <th>
                          Status
                        </th>

                        <th>
                          Server
                        </th>

                        <th>
                          Source
                        </th>

                        <th>
                          Assigned
                        </th>

                        <th>
                          Opened
                        </th>

                        <th
                          aria-label="Actions"
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {incidents.map(
                        (
                          incident
                        ) => (
                          <IncidentTableRow
                            key={
                              incident.id
                            }
                            incident={
                              incident
                            }
                            canManage={
                              canManage
                            }
                            onDetails={
                              openDetails
                            }
                            onAction={
                              openAction
                            }
                          />
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="incident-mobile-list">
                  {incidents.map(
                    (
                      incident
                    ) => (
                      <IncidentMobileCard
                        key={
                          incident.id
                        }
                        incident={
                          incident
                        }
                        canManage={
                          canManage
                        }
                        onDetails={
                          openDetails
                        }
                        onAction={
                          openAction
                        }
                      />
                    )
                  )}
                </div>

                <Pagination
                  pagination={
                    pagination
                  }
                  onPage={
                    goToPage
                  }
                />
              </>
            ) : (
              <EmptyIncidents
                canManage={
                  canManage
                }
                onCreate={
                  openCreate
                }
              />
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
          className="active"
        >
          <IncidentIcon />

          <span>
            Incidents
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(
              "/alerts"
            )
          }
        >
          <AlertIcon />

          <span>
            Alerts
          </span>
        </button>
      </nav>

      {detailsOpen && (
        <IncidentDetailsDrawer
          incident={
            selectedIncident
          }
          detailsLoading={
            detailsLoading
          }
          timeline={
            timeline
          }
          timelineLoading={
            timelineLoading
          }
          canManage={
            canManage
          }
          onClose={() => {
            setDetailsOpen(false);
            setSelectedIncident(null);
            setTimeline([]);
          }}
          onAction={
            openAction
          }
        />
      )}

      {createOpen && (
        <CreateIncidentModal
          form={
            createForm
          }
          servers={
            serverOptions
          }
          submitting={
            createSubmitting
          }
          onChange={(
            field,
            value
          ) =>
            setCreateForm(
              (
                current
              ) => ({
                ...current,
                [field]: value,
              })
            )
          }
          onClose={
            closeCreate
          }
          onSubmit={
            submitCreate
          }
        />
      )}

      {actionModal && (
        <IncidentActionModal
          action={
            actionModal
              .type
          }
          incident={
            actionModal
              .incident
          }
          value={
            actionValue
          }
          submitting={
            actionSubmitting
          }
          onChange={
            setActionValue
          }
          onClose={
            closeAction
          }
          onSubmit={
            submitAction
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
    </button>
  );
}

function IncidentStatCard({
  label,
  value,
  tone,
}) {
  return (
    <article
      className={`incident-stat-card ${tone}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

      <i />
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="incident-filter-select">
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
            event
              .target
              .value
          )
        }
      >
        {children}
      </select>
    </label>
  );
}

function IncidentTableRow({
  incident,
  canManage,
  onDetails,
  onAction,
}) {
  return (
    <tr>
      <td>
        <button
          type="button"
          className="incident-identity-button"
          onClick={() =>
            onDetails(
              incident
            )
          }
        >
          <span
            className={`incident-leading-dot severity-${String(
              incident
                .severity ||
                "LOW"
            ).toLowerCase()}`}
          />

          <span className="incident-identity-copy">
            <strong>
              {incident.title}
            </strong>

            <small>
              {incident
                .incidentNumber}
              {" · "}
              {formatLabel(
                incident
                  .incidentType
              )}
            </small>
          </span>
        </button>
      </td>

      <td>
        <SeverityBadge
          severity={
            incident.severity
          }
        />
      </td>

      <td>
        <IncidentStatusBadge
          status={
            incident.status
          }
        />
      </td>

      <td>
        <div className="incident-server-cell">
          <strong>
            {incident
              .serverCode}
          </strong>

          <span>
            {incident
              .serverName}
          </span>
        </div>
      </td>

      <td>
        <span className="incident-source-pill">
          {formatLabel(
            incident.source
          )}
        </span>
      </td>

      <td>
        <span className="incident-assignee-cell">
          {incident
            .assignedToName ||
            "Unassigned"}
        </span>
      </td>

      <td>
        {formatDateTime(
          incident.openedAt
        )}
      </td>

      <td>
        <IncidentRowActions
          incident={
            incident
          }
          canManage={
            canManage
          }
          onDetails={
            onDetails
          }
          onAction={
            onAction
          }
        />
      </td>
    </tr>
  );
}

function IncidentMobileCard({
  incident,
  canManage,
  onDetails,
  onAction,
}) {
  return (
    <article className="incident-mobile-card">
      <button
        type="button"
        className="incident-mobile-main"
        onClick={() =>
          onDetails(
            incident
          )
        }
      >
        <div className="incident-mobile-top">
          <SeverityBadge
            severity={
              incident.severity
            }
          />

          <IncidentStatusBadge
            status={
              incident.status
            }
          />
        </div>

        <strong className="incident-mobile-title">
          {incident.title}
        </strong>

        <span className="incident-mobile-number">
          {incident
            .incidentNumber}
        </span>

        <div className="incident-mobile-meta">
          <span>
            {incident
              .serverCode}
          </span>

          <span>
            {formatLabel(
              incident.source
            )}
          </span>

          <span>
            {incident
              .assignedToName ||
              "Unassigned"}
          </span>
        </div>

        <div className="incident-mobile-time">
          Opened{" "}
          <strong>
            {formatDateTime(
              incident.openedAt
            )}
          </strong>
        </div>
      </button>

      <IncidentRowActions
        incident={
          incident
        }
        canManage={
          canManage
        }
        onDetails={
          onDetails
        }
        onAction={
          onAction
        }
      />
    </article>
  );
}

function IncidentRowActions({
  incident,
  canManage,
  onDetails,
  onAction,
}) {
  const status =
    String(
      incident
        ?.status || ""
    ).toUpperCase();

  return (
    <div className="incident-row-actions">
      <button
        type="button"
        onClick={() =>
          onDetails(
            incident
          )
        }
        title="View incident"
      >
        <EyeIcon />
      </button>

      {canManage &&
        status ===
          "OPEN" && (
          <button
            type="button"
            onClick={() =>
              onAction(
                "acknowledge",
                incident
              )
            }
            title="Acknowledge"
          >
            <CheckIcon />
          </button>
        )}

      {canManage &&
        (
          status ===
            "OPEN" ||
          status ===
            "ACKNOWLEDGED"
        ) && (
          <button
            type="button"
            onClick={() =>
              onAction(
                "resolve",
                incident
              )
            }
            title="Resolve"
          >
            <ResolveIcon />
          </button>
        )}
    </div>
  );
}

function SeverityBadge({
  severity,
}) {
  const normalized =
    String(
      severity ||
        "LOW"
    ).toUpperCase();

  return (
    <span
      className={`incident-severity-badge severity-${normalized.toLowerCase()}`}
    >
      {normalized}
    </span>
  );
}

function IncidentStatusBadge({
  status,
}) {
  const normalized =
    String(
      status ||
        "OPEN"
    ).toUpperCase();

  return (
    <span
      className={`incident-status-badge incident-status-${normalized.toLowerCase()}`}
    >
      <i />

      {normalized}
    </span>
  );
}

function Pagination({
  pagination,
  onPage,
}) {
  const page =
    pagination.page;

  const totalPages =
    pagination.totalPages;

  const hasPrevious =
    page > 1;

  const hasNext =
    totalPages > 0 &&
    page < totalPages;

  return (
    <div className="incident-pagination">
      <button
        type="button"
        disabled={
          !hasPrevious
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
          {Math.max(
            totalPages,
            1
          )}
        </strong>
      </span>

      <button
        type="button"
        disabled={
          !hasNext
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

function EmptyIncidents({
  canManage,
  onCreate,
}) {
  return (
    <div className="incidents-empty-state">
      <div>
        <IncidentIcon />
      </div>

      <strong>
        No incidents found
      </strong>

      <p>
        Adjust the filters or
        create a manual incident
        if an operational issue
        needs investigation.
      </p>

      {canManage && (
        <button
          type="button"
          className="primary-action"
          onClick={
            onCreate
          }
        >
          <PlusIcon />

          Create Incident
        </button>
      )}
    </div>
  );
}

function IncidentListLoader() {
  return (
    <div className="incident-list-loader">
      <span />

      <strong>
        Loading incident queue
      </strong>
    </div>
  );
}

function IncidentDetailsDrawer({
  incident,
  detailsLoading,
  timeline,
  timelineLoading,
  canManage,
  onClose,
  onAction,
}) {
  if (
    detailsLoading
  ) {
    return (
      <div className="incident-overlay">
        <button
          type="button"
          className="incident-overlay-backdrop"
          onClick={
            onClose
          }
          aria-label="Close incident details"
        />

        <aside className="incident-details-drawer">
          <IncidentListLoader />
        </aside>
      </div>
    );
  }

  return (
    <div className="incident-overlay">
      <button
        type="button"
        className="incident-overlay-backdrop"
        onClick={
          onClose
        }
        aria-label="Close incident details"
      />

      <aside className="incident-details-drawer">
        <div className="drawer-header">
          <div>
            <span>
              INCIDENT DETAILS
            </span>

            <h3>
              {incident
                ?.incidentNumber ||
                "Incident"}
            </h3>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        {incident && (
          <>
            <div className="incident-drawer-summary">
              <div>
                <SeverityBadge
                  severity={
                    incident.severity
                  }
                />

                <IncidentStatusBadge
                  status={
                    incident.status
                  }
                />
              </div>

              <span className="version-pill">
                VERSION{" "}
                {incident.version}
              </span>
            </div>

            <div className="incident-drawer-title">
              <h4>
                {incident.title}
              </h4>

              <p>
                {incident.description ||
                  "No description provided."}
              </p>
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                INCIDENT
              </span>

              <DetailRow
                label="Type"
                value={formatLabel(
                  incident.incidentType
                )}
              />

              <DetailRow
                label="Source"
                value={formatLabel(
                  incident.source
                )}
              />

              <DetailRow
                label="Occurrences"
                value={
                  incident.occurrenceCount
                }
              />

              <DetailRow
                label="Opened"
                value={formatDateTime(
                  incident.openedAt
                )}
              />

              <DetailRow
                label="Last Occurrence"
                value={formatDateTime(
                  incident.lastOccurrenceAt
                )}
              />
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                SERVER
              </span>

              <DetailRow
                label="Server Code"
                value={
                  incident.serverCode
                }
                mono
              />

              <DetailRow
                label="Server Name"
                value={
                  incident.serverName
                }
              />

              <DetailRow
                label="Server ID"
                value={
                  incident.serverId
                }
              />
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                OWNERSHIP
              </span>

              <DetailRow
                label="Assigned To"
                value={
                  incident.assignedToName ||
                  "Unassigned"
                }
              />

              <DetailRow
                label="Assigned Email"
                value={
                  incident.assignedToEmail ||
                  "--"
                }
              />

              <DetailRow
                label="Acknowledged By"
                value={
                  incident.acknowledgedByName ||
                  "--"
                }
              />

              <DetailRow
                label="Resolved By"
                value={
                  incident.resolvedByName ||
                  "--"
                }
              />

              <DetailRow
                label="Closed By"
                value={
                  incident.closedByName ||
                  "--"
                }
              />
            </div>

            {incident
              .resolutionNotes && (
              <div className="drawer-section">
                <span className="drawer-section-label">
                  RESOLUTION
                </span>

                <p className="incident-resolution-notes">
                  {incident
                    .resolutionNotes}
                </p>
              </div>
            )}

            <div className="drawer-section">
              <span className="drawer-section-label">
                TIMELINE
              </span>

              {timelineLoading ? (
                <div className="timeline-loading">
                  Loading timeline...
                </div>
              ) : timeline.length ? (
                <div className="incident-timeline">
                  {timeline.map(
                    (
                      event
                    ) => (
                      <TimelineEvent
                        key={
                          event.id
                        }
                        event={
                          event
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="timeline-empty">
                  No timeline events.
                </div>
              )}
            </div>

            {canManage && (
              <IncidentDrawerActions
                incident={
                  incident
                }
                onAction={
                  onAction
                }
              />
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function IncidentDrawerActions({
  incident,
  onAction,
}) {
  const status =
    String(
      incident
        ?.status || ""
    ).toUpperCase();

  const active =
    status === "OPEN" ||
    status ===
      "ACKNOWLEDGED";

  return (
    <div className="incident-drawer-actions">
      {status ===
        "OPEN" && (
        <button
          type="button"
          className="secondary-action"
          onClick={() =>
            onAction(
              "acknowledge",
              incident
            )
          }
        >
          <CheckIcon />

          Acknowledge
        </button>
      )}

      {active && (
        <>
          <button
            type="button"
            className="secondary-action"
            onClick={() =>
              onAction(
                "assign",
                incident
              )
            }
          >
            <UserIcon />

            Assign
          </button>

          {incident
            .assignedTo && (
            <button
              type="button"
              className="secondary-action"
              onClick={() =>
                onAction(
                  "unassign",
                  incident
                )
              }
            >
              <UserMinusIcon />

              Unassign
            </button>
          )}

          <button
            type="button"
            className="secondary-action"
            onClick={() =>
              onAction(
                "severity",
                incident
              )
            }
          >
            <AlertIcon />

            Severity
          </button>

          <button
            type="button"
            className="primary-action"
            onClick={() =>
              onAction(
                "resolve",
                incident
              )
            }
          >
            <ResolveIcon />

            Resolve
          </button>
        </>
      )}

      {status ===
        "RESOLVED" && (
        <button
          type="button"
          className="primary-action"
          onClick={() =>
            onAction(
              "close",
              incident
            )
          }
        >
          <LockIcon />

          Close
        </button>
      )}

      {(
        status ===
          "RESOLVED" ||
        status ===
          "CLOSED"
      ) && (
        <button
          type="button"
          className="secondary-action"
          onClick={() =>
            onAction(
              "reopen",
              incident
            )
          }
        >
          <RefreshIcon />

          Reopen
        </button>
      )}

      {status !==
        "CLOSED" && (
        <button
          type="button"
          className="secondary-action"
          onClick={() =>
            onAction(
              "comment",
              incident
            )
          }
        >
          <CommentIcon />

          Comment
        </button>
      )}
    </div>
  );
}

function TimelineEvent({
  event,
}) {
  return (
    <article className="timeline-event">
      <span className="timeline-node" />

      <div className="timeline-event-body">
        <div className="timeline-event-top">
          <strong>
            {formatLabel(
              event.eventType
            )}
          </strong>

          <span>
            {formatDateTime(
              event.createdAt
            )}
          </span>
        </div>

        <p>
          {event.message ||
            "Incident event recorded."}
        </p>

        <div className="timeline-event-meta">
          <span>
            {event.actorName ||
              "System"}
          </span>

          {event.fromStatus &&
            event.toStatus &&
            event.fromStatus !==
              event.toStatus && (
              <>
                <i />

                <span>
                  {event.fromStatus}
                  {" → "}
                  {event.toStatus}
                </span>
              </>
            )}
        </div>
      </div>
    </article>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="detail-row">
      <span>
        {label}
      </span>

      <strong
        className={
          mono
            ? "mono"
            : ""
        }
      >
        {value ??
          "--"}
      </strong>
    </div>
  );
}

function CreateIncidentModal({
  form,
  servers,
  submitting,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="incident-modal-layer">
      <button
        type="button"
        className="incident-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close create incident form"
      />

      <form
        className="incident-form-modal"
        onSubmit={
          onSubmit
        }
      >
        <div className="drawer-header">
          <div>
            <span>
              MANUAL INCIDENT
            </span>

            <h3>
              Create operational incident
            </h3>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={
              onClose
            }
            disabled={
              submitting
            }
          >
            ×
          </button>
        </div>

        <div className="incident-form-body">
          <div className="incident-form-grid">
            <label className="incident-form-field">
              <span>
                Server
                <b>*</b>
              </span>

              <select
                required
                value={
                  form.serverId
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "serverId",
                    event
                      .target
                      .value
                  )
                }
              >
                <option value="">
                  Select server
                </option>

                {servers.map(
                  (
                    server
                  ) => (
                    <option
                      key={
                        server.id
                      }
                      value={
                        server.id
                      }
                    >
                      {server.name}
                      {" · "}
                      {server.serverCode}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="incident-form-field">
              <span>
                Severity
                <b>*</b>
              </span>

              <select
                required
                value={
                  form.severity
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "severity",
                    event
                      .target
                      .value
                  )
                }
              >
                {INCIDENT_SEVERITIES.map(
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
              </select>
            </label>

            <label className="incident-form-field full-span">
              <span>
                Title
                <b>*</b>
              </span>

              <input
                required
                minLength="3"
                maxLength="180"
                value={
                  form.title
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "title",
                    event
                      .target
                      .value
                  )
                }
                placeholder="Describe the operational issue"
              />
            </label>

            <label className="incident-form-field">
              <span>
                Assigned User ID
              </span>

              <input
                type="number"
                min="1"
                value={
                  form.assignedTo
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "assignedTo",
                    event
                      .target
                      .value
                  )
                }
                placeholder="Optional"
              />
            </label>

            <label className="incident-form-field">
              <span>
                Incident Type
              </span>

              <input
                value="MANUAL"
                disabled
              />
            </label>

            <label className="incident-form-field full-span">
              <span>
                Description
              </span>

              <textarea
                rows="5"
                maxLength="1000"
                value={
                  form.description
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "description",
                    event
                      .target
                      .value
                  )
                }
                placeholder="Add investigation context, symptoms or impact..."
              />
            </label>
          </div>
        </div>

        <div className="incident-form-footer">
          <button
            type="button"
            className="secondary-action"
            onClick={
              onClose
            }
            disabled={
              submitting
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-action"
            disabled={
              submitting
            }
          >
            {submitting
              ? "Creating..."
              : "Create Incident"}
          </button>
        </div>
      </form>
    </div>
  );
}

function IncidentActionModal({
  action,
  incident,
  value,
  submitting,
  onChange,
  onClose,
  onSubmit,
}) {
  const config =
    getActionConfig(
      action
    );

  return (
    <div className="incident-modal-layer compact">
      <button
        type="button"
        className="incident-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close incident action"
      />

      <div className="incident-action-modal">
        <div className="drawer-header">
          <div>
            <span>
              INCIDENT ACTION
            </span>

            <h3>
              {config.title}
            </h3>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={
              onClose
            }
            disabled={
              submitting
            }
          >
            ×
          </button>
        </div>

        <div className="incident-action-body">
          <div className="action-incident-reference">
            <strong>
              {incident
                .incidentNumber}
            </strong>

            <span>
              {incident.title}
            </span>
          </div>

          {config.input ===
            "severity" && (
            <label className="incident-form-field">
              <span>
                New Severity
              </span>

              <select
                value={
                  value
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    event
                      .target
                      .value
                  )
                }
              >
                {INCIDENT_SEVERITIES.map(
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
              </select>
            </label>
          )}

          {config.input ===
            "userId" && (
            <label className="incident-form-field">
              <span>
                Assigned User ID
              </span>

              <input
                type="number"
                min="1"
                required
                value={
                  value
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Enter active user ID"
              />
            </label>
          )}

          {config.input ===
            "textarea" && (
            <label className="incident-form-field">
              <span>
                {config
                  .fieldLabel}
              </span>

              <textarea
                rows="5"
                required
                minLength={
                  config.minLength
                }
                maxLength="1000"
                value={
                  value
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    event
                      .target
                      .value
                  )
                }
                placeholder={
                  config.placeholder
                }
              />
            </label>
          )}

          {!config.input && (
            <p className="action-confirmation-copy">
              {config.message}
            </p>
          )}

          <div className="action-version-note">
            Current version:{" "}
            <strong>
              {incident.version}
            </strong>
          </div>
        </div>

        <div className="incident-form-footer">
          <button
            type="button"
            className="secondary-action"
            onClick={
              onClose
            }
            disabled={
              submitting
            }
          >
            Cancel
          </button>

          <button
            type="button"
            className={
              action ===
                "resolve" ||
              action ===
                "close"
                ? "primary-action"
                : "secondary-action"
            }
            onClick={
              onSubmit
            }
            disabled={
              submitting ||
              !isActionValueValid(
                action,
                value
              )
            }
          >
            {submitting
              ? "Processing..."
              : config.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function getActionConfig(
  action
) {
  const configs = {
    acknowledge: {
      title:
        "Acknowledge incident",
      submitLabel:
        "Acknowledge",
      message:
        "Confirm that this incident has been seen and investigation can begin.",
    },

    assign: {
      title:
        "Assign incident",
      submitLabel:
        "Assign",
      input:
        "userId",
    },

    unassign: {
      title:
        "Remove assignment",
      submitLabel:
        "Unassign",
      message:
        "Remove the current responder assignment from this incident.",
    },

    severity: {
      title:
        "Change severity",
      submitLabel:
        "Update Severity",
      input:
        "severity",
    },

    resolve: {
      title:
        "Resolve incident",
      submitLabel:
        "Resolve Incident",
      input:
        "textarea",
      fieldLabel:
        "Resolution Notes",
      minLength: 3,
      placeholder:
        "Describe the fix, recovery or resolution...",
    },

    close: {
      title:
        "Close incident",
      submitLabel:
        "Close Incident",
      message:
        "Close this resolved incident and mark its lifecycle complete.",
    },

    reopen: {
      title:
        "Reopen incident",
      submitLabel:
        "Reopen",
      input:
        "textarea",
      fieldLabel:
        "Reopen Reason",
      minLength: 3,
      placeholder:
        "Explain why the incident needs further investigation...",
    },

    comment: {
      title:
        "Add investigation note",
      submitLabel:
        "Add Comment",
      input:
        "textarea",
      fieldLabel:
        "Comment",
      minLength: 1,
      placeholder:
        "Add an investigation update or operational note...",
    },
  };

  return (
    configs[action] ||
    {
      title:
        "Incident action",
      submitLabel:
        "Confirm",
      message:
        "Confirm this incident action.",
    }
  );
}

function isActionValueValid(
  action,
  value
) {
  if (
    action ===
      "assign"
  ) {
    const parsed =
      Number(value);

    return (
      Number.isSafeInteger(
        parsed
      ) &&
      parsed > 0
    );
  }

  if (
    action ===
      "resolve" ||
    action ===
      "reopen"
  ) {
    return (
      String(
        value || ""
      ).trim().length >= 3
    );
  }

  if (
    action ===
      "comment"
  ) {
    return Boolean(
      String(
        value || ""
      ).trim()
    );
  }

  return true;
}

function emptyToNull(
  value
) {
  const normalized =
    String(
      value ?? ""
    ).trim();

  return normalized ||
    null;
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

function formatDateTime(
  value
) {
  if (!value) {
    return "--";
  }

  const date =
    new Date(
      value
    );

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

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
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

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ResolveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6" />
    </svg>
  );
}

function UserMinusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c.7-4 2.7-6 6-6 2 0 3.5.7 4.6 2" />
      <path d="M15 17h6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 5h16v11H9l-5 4Z" />
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