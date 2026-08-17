import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext.jsx";

import {
  serverApi,
} from "../api/serverApi.js";

import "./DashboardPage.css";
import "./ServersPage.css";

const ENVIRONMENTS = [
  "PRODUCTION",
  "STAGING",
  "DEVELOPMENT",
  "TEST",
];

const SERVER_STATUSES = [
  "ONLINE",
  "OFFLINE",
  "DEGRADED",
  "MAINTENANCE",
  "UNKNOWN",
];

const SORT_OPTIONS = [
  {
    value: "createdAt",
    label: "Recently added",
  },
  {
    value: "name",
    label: "Server name",
  },
  {
    value: "serverCode",
    label: "Server code",
  },
  {
    value: "environment",
    label: "Environment",
  },
  {
    value: "status",
    label: "Status",
  },
  {
    value: "lastSeenAt",
    label: "Last seen",
  },
];

const EMPTY_FORM = {
  serverCode: "",
  name: "",
  hostname: "",
  ipAddress: "",
  environment: "PRODUCTION",
  operatingSystem: "",
  location: "",
  description: "",
  checkIntervalSeconds: "60",
};

export default function ServersPage() {
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
    servers,
    setServers,
  ] = useState([]);

  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
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
    limit: 10,
    environment: "",
    status: "",
    search: "",
    sortBy: "createdAt",
    sortOrder: "DESC",
  });

  const [
    formMode,
    setFormMode,
  ] = useState(null);

  const [
    formData,
    setFormData,
  ] = useState(
    EMPTY_FORM
  );

  const [
    formServer,
    setFormServer,
  ] = useState(null);

  const [
    formSubmitting,
    setFormSubmitting,
  ] = useState(false);

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  const [
    selectedServer,
    setSelectedServer,
  ] = useState(null);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    statusTarget,
    setStatusTarget,
  ] = useState(null);

  const [
    statusValue,
    setStatusValue,
  ] = useState("");

  const [
    statusSubmitting,
    setStatusSubmitting,
  ] = useState(false);

  const [
    deleteTarget,
    setDeleteTarget,
  ] = useState(null);

  const [
    deleteSubmitting,
    setDeleteSubmitting,
  ] = useState(false);

  const role =
    user?.role?.code ||
    "VIEWER";

  const canManage =
    role === "ADMIN" ||
    role === "RESPONDER";

  const canDelete =
    role === "ADMIN";

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

  const loadServers =
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
                serverApi.list(
                  token,
                  filters
                )
            );

          const result =
            response?.data || {};

          setServers(
            Array.isArray(
              result.servers
            )
              ? result.servers
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
              ) || 10,

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

            hasNext:
              Boolean(
                result
                  ?.pagination
                  ?.hasNext
              ),

            hasPrevious:
              Boolean(
                result
                  ?.pagination
                  ?.hasPrevious
              ),
          });

          setError("");
        } catch (requestError) {
          setError(
            requestError
              ?.message ||
              "Servers could not be loaded."
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
    loadServers();
  }, [loadServers]);

  useEffect(() => {
    const timer =
      setTimeout(() => {
        setFilters(
          (current) => {
            if (
              current.search ===
              searchDraft.trim()
            ) {
              return current;
            }

            return {
              ...current,
              page: 1,
              search:
                searchDraft.trim(),
            };
          }
        );
      }, 350);

    return () =>
      clearTimeout(timer);
  }, [searchDraft]);

  const stats =
    useMemo(() => {
      const result = {
        total:
          pagination.total,
        online: 0,
        offline: 0,
        degraded: 0,
        maintenance: 0,
        unknown: 0,
      };

      for (
        const server of servers
      ) {
        const status =
          String(
            server?.status ||
              "UNKNOWN"
          ).toUpperCase();

        if (
          status === "ONLINE"
        ) {
          result.online += 1;
        } else if (
          status === "OFFLINE"
        ) {
          result.offline += 1;
        } else if (
          status === "DEGRADED"
        ) {
          result.degraded += 1;
        } else if (
          status ===
          "MAINTENANCE"
        ) {
          result.maintenance += 1;
        } else {
          result.unknown += 1;
        }
      }

      return result;
    }, [
      pagination.total,
      servers,
    ]);

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
        limit: 10,
        environment: "",
        status: "",
        search: "",
        sortBy: "createdAt",
        sortOrder: "DESC",
      });
    };

  const openCreate =
    () => {
      setMutationError("");
      setFormMode("create");
      setFormServer(null);
      setFormData(
        EMPTY_FORM
      );
    };

  const loadServerDetails =
    async (
      serverId
    ) => {
      const response =
        await runAuthorizedRequest(
          (token) =>
            serverApi.getById(
              token,
              serverId
            )
        );

      return (
        response?.data
          ?.server || null
      );
    };

  const openDetails =
    async (
      server
    ) => {
      setDetailsOpen(true);
      setSelectedServer(
        server
      );
      setDetailsLoading(true);
      setMutationError("");

      try {
        const freshServer =
          await loadServerDetails(
            server.id
          );

        if (freshServer) {
          setSelectedServer(
            freshServer
          );
        }
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Server details could not be loaded."
        );
      } finally {
        setDetailsLoading(false);
      }
    };

  const openEdit =
    async (
      server
    ) => {
      if (!canManage) {
        return;
      }

      setMutationError("");

      try {
        const freshServer =
          await loadServerDetails(
            server.id
          );

        if (!freshServer) {
          return;
        }

        setFormServer(
          freshServer
        );

        setFormData({
          serverCode:
            freshServer
              .serverCode || "",

          name:
            freshServer.name ||
            "",

          hostname:
            freshServer
              .hostname || "",

          ipAddress:
            freshServer
              .ipAddress || "",

          environment:
            freshServer
              .environment ||
            "PRODUCTION",

          operatingSystem:
            freshServer
              .operatingSystem ||
            "",

          location:
            freshServer
              .location || "",

          description:
            freshServer
              .description ||
            "",

          checkIntervalSeconds:
            String(
              freshServer
                .checkIntervalSeconds ??
                60
            ),
        });

        setFormMode("edit");
        setDetailsOpen(false);
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Server data could not be loaded for editing."
        );
      }
    };

  const closeForm =
    () => {
      if (
        formSubmitting
      ) {
        return;
      }

      setFormMode(null);
      setFormServer(null);
      setMutationError("");
    };

  const changeFormField =
    (
      field,
      value
    ) => {
      setFormData(
        (current) => ({
          ...current,
          [field]: value,
        })
      );
    };

  const submitServerForm =
    async (
      event
    ) => {
      event.preventDefault();

      if (!canManage) {
        return;
      }

      setMutationError("");
      setFormSubmitting(true);

      try {
        if (
          formMode ===
          "create"
        ) {
          await runAuthorizedRequest(
            (token) =>
              serverApi.create(
                token,
                {
                  serverCode:
                    formData
                      .serverCode,

                  name:
                    formData.name,

                  hostname:
                    formData
                      .hostname,

                  ipAddress:
                    formData
                      .ipAddress,

                  environment:
                    formData
                      .environment,

                  operatingSystem:
                    emptyToUndefined(
                      formData
                        .operatingSystem
                    ),

                  location:
                    emptyToUndefined(
                      formData
                        .location
                    ),

                  description:
                    emptyToUndefined(
                      formData
                        .description
                    ),

                  checkIntervalSeconds:
                    Number(
                      formData
                        .checkIntervalSeconds
                    ),
                }
              )
          );
        } else if (
          formMode ===
          "edit" &&
          formServer
        ) {
          await runAuthorizedRequest(
            (token) =>
              serverApi.update(
                token,
                formServer.id,
                {
                  name:
                    formData.name,

                  hostname:
                    formData
                      .hostname,

                  ipAddress:
                    formData
                      .ipAddress,

                  environment:
                    formData
                      .environment,

                  operatingSystem:
                    emptyToNull(
                      formData
                        .operatingSystem
                    ),

                  location:
                    emptyToNull(
                      formData
                        .location
                    ),

                  description:
                    emptyToNull(
                      formData
                        .description
                    ),

                  checkIntervalSeconds:
                    Number(
                      formData
                        .checkIntervalSeconds
                    ),

                  version:
                    Number(
                      formServer
                        .version
                    ),
                }
              )
          );
        }

        setFormMode(null);
        setFormServer(null);

        await loadServers();
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Server could not be saved."
        );

        if (
          requestError
            ?.status === 409
        ) {
          await loadServers({
            silent: true,
          });
        }
      } finally {
        setFormSubmitting(false);
      }
    };

  const openStatusDialog =
    (
      server
    ) => {
      if (!canManage) {
        return;
      }

      setMutationError("");
      setStatusTarget(
        server
      );

      setStatusValue(
        server.status ||
          "UNKNOWN"
      );
    };

  const submitStatusChange =
    async () => {
      if (
        !statusTarget ||
        !canManage
      ) {
        return;
      }

      setStatusSubmitting(true);
      setMutationError("");

      try {
        await runAuthorizedRequest(
          (token) =>
            serverApi.updateStatus(
              token,
              statusTarget.id,
              {
                status:
                  statusValue,

                version:
                  Number(
                    statusTarget
                      .version
                  ),
              }
            )
        );

        setStatusTarget(null);

        await loadServers();
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Server status could not be updated."
        );

        if (
          requestError
            ?.status === 409
        ) {
          await loadServers({
            silent: true,
          });
        }
      } finally {
        setStatusSubmitting(false);
      }
    };

  const confirmDelete =
    (
      server
    ) => {
      if (!canDelete) {
        return;
      }

      setMutationError("");
      setDeleteTarget(
        server
      );
    };

  const submitDelete =
    async () => {
      if (
        !deleteTarget ||
        !canDelete
      ) {
        return;
      }

      setDeleteSubmitting(true);
      setMutationError("");

      try {
        await runAuthorizedRequest(
          (token) =>
            serverApi.remove(
              token,
              deleteTarget.id,
              Number(
                deleteTarget
                  .version
              )
            )
        );

        setDeleteTarget(null);

        if (
          selectedServer?.id ===
          deleteTarget.id
        ) {
          setDetailsOpen(false);
          setSelectedServer(null);
        }

        await loadServers();
      } catch (requestError) {
        setMutationError(
          requestError
            ?.message ||
            "Server could not be deleted."
        );

        if (
          requestError
            ?.status === 409
        ) {
          await loadServers({
            silent: true,
          });
        }
      } finally {
        setDeleteSubmitting(false);
      }
    };

  const goToPage =
    (page) => {
      setFilters(
        (current) => ({
          ...current,
          page,
        })
      );
    };

  return (
    <main className="ops-shell servers-shell">
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
            active
            icon={
              <ServerIcon />
            }
            label="Servers"
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
                PULSEOPS / SERVERS
              </div>

              <h1>
                Server Management
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

        <div className="ops-content servers-content">
          {error && (
            <div className="dashboard-error-banner">
              <div>
                <strong>
                  SERVER LINK ERROR
                </strong>

                <span>
                  {error}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  loadServers()
                }
              >
                RETRY
              </button>
            </div>
          )}

          {mutationError && (
            <div className="server-action-error">
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

          <section className="servers-hero">
            <div>
              <div className="eyebrow">
                INFRASTRUCTURE INVENTORY
              </div>

              <h2>
                Manage every node
                from one place.
              </h2>

              <p>
                Register, filter,
                inspect and manage
                monitored PulseOps
                servers with
                concurrency-safe
                updates.
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
                  Register Server
                </span>
              </button>
            )}
          </section>

          <section className="server-stat-grid">
            <ServerStatCard
              label="Registered"
              value={
                pagination.total
              }
              tone="neutral"
            />

            <ServerStatCard
              label="Online"
              value={
                stats.online
              }
              tone="good"
            />

            <ServerStatCard
              label="Offline"
              value={
                stats.offline
              }
              tone="danger"
            />

            <ServerStatCard
              label="Degraded"
              value={
                stats.degraded
              }
              tone="warning"
            />
          </section>

          <section className="surface server-browser">
            <div className="server-browser-toolbar">
              <div className="server-search-wrap">
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
                  placeholder="Search name, code, host, IP or location..."
                  aria-label="Search servers"
                />
              </div>

              <div className="server-filter-row">
                <label>
                  <span>
                    Environment
                  </span>

                  <select
                    value={
                      filters
                        .environment
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "environment",
                        event
                          .target
                          .value
                      )
                    }
                  >
                    <option value="">
                      All environments
                    </option>

                    {ENVIRONMENTS.map(
                      (
                        environment
                      ) => (
                        <option
                          key={
                            environment
                          }
                          value={
                            environment
                          }
                        >
                          {formatLabel(
                            environment
                          )}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  <span>
                    Status
                  </span>

                  <select
                    value={
                      filters.status
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "status",
                        event
                          .target
                          .value
                      )
                    }
                  >
                    <option value="">
                      All statuses
                    </option>

                    {SERVER_STATUSES.map(
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
                  </select>
                </label>

                <label>
                  <span>
                    Sort
                  </span>

                  <select
                    value={
                      filters.sortBy
                    }
                    onChange={(
                      event
                    ) =>
                      updateFilter(
                        "sortBy",
                        event
                          .target
                          .value
                      )
                    }
                  >
                    {SORT_OPTIONS.map(
                      (
                        option
                      ) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {option.label}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <button
                  type="button"
                  className="sort-order-button"
                  onClick={() =>
                    updateFilter(
                      "sortOrder",
                      filters
                        .sortOrder ===
                        "DESC"
                        ? "ASC"
                        : "DESC"
                    )
                  }
                  title="Toggle sort direction"
                >
                  <SortIcon />

                  {filters
                    .sortOrder}
                </button>

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

            <div className="server-browser-meta">
              <div>
                <span>
                  Showing
                </span>

                <strong>
                  {servers.length}
                </strong>

                <span>
                  of
                </span>

                <strong>
                  {pagination.total}
                </strong>

                <span>
                  servers
                </span>
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={() =>
                  loadServers()
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
              <ServerListLoader />
            ) : servers.length ? (
              <>
                <div className="server-table-wrap">
                  <table className="server-table">
                    <thead>
                      <tr>
                        <th>
                          Server
                        </th>

                        <th>
                          Environment
                        </th>

                        <th>
                          Status
                        </th>

                        <th>
                          IP Address
                        </th>

                        <th>
                          Last Seen
                        </th>

                        <th>
                          Check
                        </th>

                        <th
                          aria-label="Actions"
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {servers.map(
                        (
                          server
                        ) => (
                          <ServerTableRow
                            key={
                              server.id
                            }
                            server={
                              server
                            }
                            canManage={
                              canManage
                            }
                            canDelete={
                              canDelete
                            }
                            onDetails={
                              openDetails
                            }
                            onEdit={
                              openEdit
                            }
                            onStatus={
                              openStatusDialog
                            }
                            onDelete={
                              confirmDelete
                            }
                          />
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="server-mobile-list">
                  {servers.map(
                    (
                      server
                    ) => (
                      <ServerMobileCard
                        key={
                          server.id
                        }
                        server={
                          server
                        }
                        canManage={
                          canManage
                        }
                        canDelete={
                          canDelete
                        }
                        onDetails={
                          openDetails
                        }
                        onEdit={
                          openEdit
                        }
                        onStatus={
                          openStatusDialog
                        }
                        onDelete={
                          confirmDelete
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
              <EmptyServers
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
          className="active"
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

        <button type="button">
          <AlertIcon />

          <span>
            Alerts
          </span>
        </button>
      </nav>

      {detailsOpen && (
        <ServerDetailsDrawer
          server={
            selectedServer
          }
          loading={
            detailsLoading
          }
          canManage={
            canManage
          }
          canDelete={
            canDelete
          }
          onClose={() => {
            setDetailsOpen(false);
            setSelectedServer(null);
          }}
          onEdit={
            openEdit
          }
          onStatus={
            openStatusDialog
          }
          onDelete={
            confirmDelete
          }
        />
      )}

      {formMode && (
        <ServerFormModal
          mode={
            formMode
          }
          data={
            formData
          }
          submitting={
            formSubmitting
          }
          onChange={
            changeFormField
          }
          onClose={
            closeForm
          }
          onSubmit={
            submitServerForm
          }
        />
      )}

      {statusTarget && (
        <StatusModal
          server={
            statusTarget
          }
          value={
            statusValue
          }
          submitting={
            statusSubmitting
          }
          onChange={
            setStatusValue
          }
          onClose={() => {
            if (
              !statusSubmitting
            ) {
              setStatusTarget(
                null
              );
            }
          }}
          onSubmit={
            submitStatusChange
          }
        />
      )}

      {deleteTarget && (
        <DeleteModal
          server={
            deleteTarget
          }
          submitting={
            deleteSubmitting
          }
          onClose={() => {
            if (
              !deleteSubmitting
            ) {
              setDeleteTarget(
                null
              );
            }
          }}
          onSubmit={
            submitDelete
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

function ServerStatCard({
  label,
  value,
  tone,
}) {
  return (
    <article
      className={`server-stat-card ${tone}`}
    >
      <span className="server-stat-label">
        {label}
      </span>

      <strong>
        {value}
      </strong>

      <i />
    </article>
  );
}

function ServerTableRow({
  server,
  canManage,
  canDelete,
  onDetails,
  onEdit,
  onStatus,
  onDelete,
}) {
  const status =
    normalizeStatus(
      server?.status
    );

  return (
    <tr>
      <td>
        <button
          type="button"
          className="server-identity-button"
          onClick={() =>
            onDetails(
              server
            )
          }
        >
          <span className="server-table-icon">
            <ServerIcon />
          </span>

          <span className="server-identity-copy">
            <strong>
              {server.name}
            </strong>

            <small>
              {server
                .serverCode}
              {" · "}
              {server.hostname}
            </small>
          </span>
        </button>
      </td>

      <td>
        <span className="environment-pill">
          {formatLabel(
            server.environment
          )}
        </span>
      </td>

      <td>
        <StatusBadge
          status={
            status
          }
        />
      </td>

      <td className="mono-cell">
        {server.ipAddress}
      </td>

      <td>
        {formatDateTime(
          server.lastSeenAt
        )}
      </td>

      <td>
        <span className="interval-cell">
          {server
            .checkIntervalSeconds}
          s
        </span>
      </td>

      <td>
        <RowActions
          server={
            server
          }
          canManage={
            canManage
          }
          canDelete={
            canDelete
          }
          onDetails={
            onDetails
          }
          onEdit={
            onEdit
          }
          onStatus={
            onStatus
          }
          onDelete={
            onDelete
          }
        />
      </td>
    </tr>
  );
}

function ServerMobileCard({
  server,
  canManage,
  canDelete,
  onDetails,
  onEdit,
  onStatus,
  onDelete,
}) {
  const status =
    normalizeStatus(
      server?.status
    );

  return (
    <article className="server-mobile-card">
      <button
        type="button"
        className="server-mobile-main"
        onClick={() =>
          onDetails(
            server
          )
        }
      >
        <div className="server-mobile-top">
          <div className="server-table-icon">
            <ServerIcon />
          </div>

          <div className="server-mobile-copy">
            <strong>
              {server.name}
            </strong>

            <span>
              {server.serverCode}
            </span>
          </div>

          <StatusBadge
            status={
              status
            }
          />
        </div>

        <div className="server-mobile-meta">
          <span>
            {server.hostname}
          </span>

          <span>
            {server.ipAddress}
          </span>

          <span>
            {formatLabel(
              server.environment
            )}
          </span>
        </div>

        <div className="server-mobile-last">
          Last seen:{" "}
          <strong>
            {formatDateTime(
              server.lastSeenAt
            )}
          </strong>
        </div>
      </button>

      <RowActions
        server={
          server
        }
        canManage={
          canManage
        }
        canDelete={
          canDelete
        }
        onDetails={
          onDetails
        }
        onEdit={
          onEdit
        }
        onStatus={
          onStatus
        }
        onDelete={
          onDelete
        }
      />
    </article>
  );
}

function RowActions({
  server,
  canManage,
  canDelete,
  onDetails,
  onEdit,
  onStatus,
  onDelete,
}) {
  return (
    <div className="server-row-actions">
      <button
        type="button"
        onClick={() =>
          onDetails(
            server
          )
        }
        title="View details"
      >
        <EyeIcon />
      </button>

      {canManage && (
        <>
          <button
            type="button"
            onClick={() =>
              onEdit(
                server
              )
            }
            title="Edit server"
          >
            <EditIcon />
          </button>

          <button
            type="button"
            onClick={() =>
              onStatus(
                server
              )
            }
            title="Change status"
          >
            <PulseIcon />
          </button>
        </>
      )}

      {canDelete && (
        <button
          type="button"
          className="danger"
          onClick={() =>
            onDelete(
              server
            )
          }
          title="Delete server"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}) {
  return (
    <span
      className={`server-status-badge status-${status.toLowerCase()}`}
    >
      <i />

      {status}
    </span>
  );
}

function Pagination({
  pagination,
  onPage,
}) {
  const {
    page,
    totalPages,
    hasNext,
    hasPrevious,
  } = pagination;

  return (
    <div className="server-pagination">
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

function EmptyServers({
  canManage,
  onCreate,
}) {
  return (
    <div className="servers-empty-state">
      <div>
        <ServerIcon />
      </div>

      <strong>
        No servers found
      </strong>

      <p>
        Adjust the filters or
        register a new server to
        begin monitoring.
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

          Register Server
        </button>
      )}
    </div>
  );
}

function ServerListLoader() {
  return (
    <div className="server-list-loader">
      <span />

      <strong>
        Loading server inventory
      </strong>
    </div>
  );
}

function ServerDetailsDrawer({
  server,
  loading,
  canManage,
  canDelete,
  onClose,
  onEdit,
  onStatus,
  onDelete,
}) {
  return (
    <div className="server-overlay">
      <button
        type="button"
        className="server-overlay-backdrop"
        onClick={
          onClose
        }
        aria-label="Close details"
      />

      <aside className="server-details-drawer">
        <div className="drawer-header">
          <div>
            <span>
              SERVER DETAILS
            </span>

            <h3>
              {server?.name ||
                "Loading..."}
            </h3>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={
              onClose
            }
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <ServerListLoader />
        ) : server ? (
          <>
            <div className="drawer-status-row">
              <StatusBadge
                status={
                  normalizeStatus(
                    server.status
                  )
                }
              />

              <span className="version-pill">
                VERSION{" "}
                {server.version}
              </span>
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                IDENTITY
              </span>

              <DetailRow
                label="Server Code"
                value={
                  server.serverCode
                }
                mono
              />

              <DetailRow
                label="Hostname"
                value={
                  server.hostname
                }
                mono
              />

              <DetailRow
                label="IP Address"
                value={
                  server.ipAddress
                }
                mono
              />

              <DetailRow
                label="Environment"
                value={formatLabel(
                  server.environment
                )}
              />
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                SYSTEM
              </span>

              <DetailRow
                label="Operating System"
                value={
                  server.operatingSystem ||
                  "Not specified"
                }
              />

              <DetailRow
                label="Location"
                value={
                  server.location ||
                  "Not specified"
                }
              />

              <DetailRow
                label="Check Interval"
                value={`${server.checkIntervalSeconds}s`}
              />

              <DetailRow
                label="Last Seen"
                value={formatDateTime(
                  server.lastSeenAt
                )}
              />
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                DESCRIPTION
              </span>

              <p className="drawer-description">
                {server.description ||
                  "No description provided."}
              </p>
            </div>

            <div className="drawer-section">
              <span className="drawer-section-label">
                AUDIT
              </span>

              <DetailRow
                label="Created"
                value={formatDateTime(
                  server.createdAt
                )}
              />

              <DetailRow
                label="Updated"
                value={formatDateTime(
                  server.updatedAt
                )}
              />

              <DetailRow
                label="Created By"
                value={
                  server.createdBy ??
                  "--"
                }
              />
            </div>

            <div className="drawer-actions">
              {canManage && (
                <>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      onEdit(
                        server
                      )
                    }
                  >
                    <EditIcon />

                    Edit
                  </button>

                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      onStatus(
                        server
                      )
                    }
                  >
                    <PulseIcon />

                    Status
                  </button>
                </>
              )}

              {canDelete && (
                <button
                  type="button"
                  className="danger-action"
                  onClick={() =>
                    onDelete(
                      server
                    )
                  }
                >
                  <TrashIcon />

                  Delete
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="drawer-missing">
            Server data unavailable.
          </div>
        )}
      </aside>
    </div>
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
        {value}
      </strong>
    </div>
  );
}

function ServerFormModal({
  mode,
  data,
  submitting,
  onChange,
  onClose,
  onSubmit,
}) {
  const editing =
    mode === "edit";

  return (
    <div className="server-modal-layer">
      <button
        type="button"
        className="server-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close server form"
      />

      <form
        className="server-form-modal"
        onSubmit={
          onSubmit
        }
      >
        <div className="drawer-header">
          <div>
            <span>
              {editing
                ? "UPDATE SERVER"
                : "REGISTER SERVER"}
            </span>

            <h3>
              {editing
                ? "Edit infrastructure node"
                : "Add infrastructure node"}
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

        <div className="server-form-body">
          <div className="form-grid">
            <ServerField
              label="Server Code"
              required
              value={
                data.serverCode
              }
              disabled={
                editing
              }
              placeholder="WEB-PROD-01"
              onChange={(
                value
              ) =>
                onChange(
                  "serverCode",
                  value
                )
              }
            />

            <ServerField
              label="Server Name"
              required
              value={
                data.name
              }
              placeholder="Production Web Server 01"
              onChange={(
                value
              ) =>
                onChange(
                  "name",
                  value
                )
              }
            />

            <ServerField
              label="Hostname"
              required
              value={
                data.hostname
              }
              placeholder="web-prod-01.pulseops.local"
              onChange={(
                value
              ) =>
                onChange(
                  "hostname",
                  value
                )
              }
            />

            <ServerField
              label="IP Address"
              required
              value={
                data.ipAddress
              }
              placeholder="10.0.0.21"
              onChange={(
                value
              ) =>
                onChange(
                  "ipAddress",
                  value
                )
              }
            />

            <label className="server-form-field">
              <span>
                Environment
                <b>*</b>
              </span>

              <select
                value={
                  data.environment
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "environment",
                    event
                      .target
                      .value
                  )
                }
                required
              >
                {ENVIRONMENTS.map(
                  (
                    environment
                  ) => (
                    <option
                      key={
                        environment
                      }
                      value={
                        environment
                      }
                    >
                      {formatLabel(
                        environment
                      )}
                    </option>
                  )
                )}
              </select>
            </label>

            <ServerField
              label="Operating System"
              value={
                data.operatingSystem
              }
              placeholder="Ubuntu Server 24.04 LTS"
              onChange={(
                value
              ) =>
                onChange(
                  "operatingSystem",
                  value
                )
              }
            />

            <ServerField
              label="Location"
              value={
                data.location
              }
              placeholder="Primary Data Center - Rack A3"
              onChange={(
                value
              ) =>
                onChange(
                  "location",
                  value
                )
              }
            />

            <ServerField
              label="Check Interval (seconds)"
              required
              type="number"
              min="10"
              max="3600"
              step="1"
              value={
                data.checkIntervalSeconds
              }
              onChange={(
                value
              ) =>
                onChange(
                  "checkIntervalSeconds",
                  value
                )
              }
            />
          </div>

          <label className="server-form-field full-width">
            <span>
              Description
            </span>

            <textarea
              rows="4"
              maxLength="500"
              value={
                data.description
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
              placeholder="Describe the server role or operational purpose..."
            />
          </label>
        </div>

        <div className="server-form-footer">
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
              ? "Saving..."
              : editing
                ? "Save Changes"
                : "Register Server"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ServerField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  type = "text",
  placeholder,
  min,
  max,
  step,
}) {
  return (
    <label className="server-form-field">
      <span>
        {label}

        {required && (
          <b>
            *
          </b>
        )}
      </span>

      <input
        type={
          type
        }
        value={
          value
        }
        required={
          required
        }
        disabled={
          disabled
        }
        placeholder={
          placeholder
        }
        min={
          min
        }
        max={
          max
        }
        step={
          step
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
      />
    </label>
  );
}

function StatusModal({
  server,
  value,
  submitting,
  onChange,
  onClose,
  onSubmit,
}) {
  return (
    <div className="server-modal-layer compact">
      <button
        type="button"
        className="server-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close status dialog"
      />

      <div className="compact-modal">
        <div className="drawer-header">
          <div>
            <span>
              SERVER STATUS
            </span>

            <h3>
              {server.name}
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

        <div className="compact-modal-body">
          <label className="server-form-field">
            <span>
              New Status
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
              {SERVER_STATUSES.map(
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
            </select>
          </label>

          <p>
            Current version:{" "}
            <strong>
              {server.version}
            </strong>
          </p>
        </div>

        <div className="server-form-footer">
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
            className="primary-action"
            onClick={
              onSubmit
            }
            disabled={
              submitting
            }
          >
            {submitting
              ? "Updating..."
              : "Update Status"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  server,
  submitting,
  onClose,
  onSubmit,
}) {
  return (
    <div className="server-modal-layer compact">
      <button
        type="button"
        className="server-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close delete dialog"
      />

      <div className="compact-modal delete-modal">
        <div className="delete-icon">
          <TrashIcon />
        </div>

        <h3>
          Delete server?
        </h3>

        <p>
          <strong>
            {server.name}
          </strong>{" "}
          will be soft-deleted from
          the active server inventory.
        </p>

        <small>
          {server.serverCode}
          {" · "}
          Version{" "}
          {server.version}
        </small>

        <div className="server-form-footer">
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
            className="danger-action"
            onClick={
              onSubmit
            }
            disabled={
              submitting
            }
          >
            {submitting
              ? "Deleting..."
              : "Delete Server"}
          </button>
        </div>
      </div>
    </div>
  );
}

function emptyToUndefined(
  value
) {
  const normalized =
    String(
      value ?? ""
    ).trim();

  return normalized ||
    undefined;
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

function normalizeStatus(
  value
) {
  const status =
    String(
      value ||
        "UNKNOWN"
    ).toUpperCase();

  return SERVER_STATUSES.includes(
    status
  )
    ? status
    : "UNKNOWN";
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
    return "No signal";
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
      <rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="1"
      />

      <rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1"
      />

      <rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1"
      />

      <rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1"
      />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="6"
        rx="1.5"
      />

      <rect
        x="3"
        y="14"
        width="18"
        height="6"
        rx="1.5"
      />

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

      <circle
        cx="9"
        cy="6"
        r="2"
      />

      <circle
        cx="15"
        cy="12"
        r="2"
      />

      <circle
        cx="8"
        cy="18"
        r="2"
      />
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

function PulseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M2 12H6L8 7L11 17L14 4L17 14L19 12H22" />
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
      <circle
        cx="11"
        cy="11"
        r="6"
      />

      <path d="m16 16 4 4" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" />
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

      <circle
        cx="12"
        cy="12"
        r="2.5"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />

      <path d="m13 7 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />

      <path d="M10 11v5M14 11v5" />
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
