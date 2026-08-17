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
  alertRuleApi,
  ALERT_RULE_SCOPE_TYPES,
  ALERT_RULE_METRIC_TYPES,
  ALERT_RULE_OPERATORS,
  ALERT_RULE_SEVERITIES,
  ALERT_RULE_STATE_STATUSES,
} from "../api/alertRuleApi.js";

import {
  serverApi,
} from "../api/serverApi.js";

import "./DashboardPage.css";
import "./AlertRulesPage.css";

const EMPTY_FORM = {
  ruleCode: "",
  name: "",
  description: "",
  scopeType: "GLOBAL",
  serverId: "",
  metricType: "CPU_USAGE_PERCENT",
  comparisonOperator: "GTE",
  thresholdValue: "85",
  recoveryValue: "75",
  severity: "HIGH",
  consecutiveBreachesRequired: "3",
  consecutiveRecoveriesRequired: "2",
  isEnabled: true,
  version: "",
};

export default function AlertRulesPage() {
  const navigate =
    useNavigate();

  const {
    user,
    accessToken,
    logout,
    refreshAccessToken,
  } = useAuth();

  const role =
    String(
      user?.role?.code ||
        "VIEWER"
    ).toUpperCase();

  const isAdmin =
    role === "ADMIN";

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
    rules,
    setRules,
  ] = useState([]);

  const [
    pagination,
    setPagination,
  ] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
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
    actionError,
    setActionError,
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
    search: "",
    scopeType: "",
    serverId: "",
    metricType: "",
    severity: "",
    isEnabled: "",
  });

  const [
    servers,
    setServers,
  ] = useState([]);

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    selectedRule,
    setSelectedRule,
  ] = useState(null);

  const [
    states,
    setStates,
  ] = useState([]);

  const [
    statesLoading,
    setStatesLoading,
  ] = useState(false);

  const [
    statePagination,
    setStatePagination,
  ] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [
    stateFilters,
    setStateFilters,
  ] = useState({
    page: 1,
    limit: 10,
    status: "",
    serverId: "",
  });

  const [
    formModal,
    setFormModal,
  ] = useState(null);

  const [
    form,
    setForm,
  ] = useState(
    EMPTY_FORM
  );

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    confirmModal,
    setConfirmModal,
  ] = useState(null);

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

  const loadRules =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (
          !accessToken ||
          !isAdmin
        ) {
          setLoading(false);
          return;
        }

        if (!silent) {
          setLoading(true);
        }

        try {
          const response =
            await runAuthorizedRequest(
              (token) =>
                alertRuleApi.list(
                  token,
                  {
                    ...filters,
                    isEnabled:
                      filters.isEnabled ===
                      ""
                        ? undefined
                        : filters.isEnabled ===
                          "true",
                  }
                )
            );

          const data =
            response?.data || {};

          setRules(
            Array.isArray(
              data.rules
            )
              ? data.rules
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
              ) || 10,

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
              "Alert rules could not be loaded."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        accessToken,
        filters,
        isAdmin,
        runAuthorizedRequest,
      ]
    );

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    const timer =
      setTimeout(() => {
        setFilters(
          (current) => {
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
              search: nextSearch,
            };
          }
        );
      }, 350);

    return () =>
      clearTimeout(timer);
  }, [searchDraft]);

  const loadServers =
    useCallback(
      async () => {
        if (
          !accessToken ||
          !isAdmin
        ) {
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

          setServers(
            Array.isArray(
              response?.data
                ?.servers
            )
              ? response.data
                .servers
              : []
          );
        } catch {
          setServers([]);
        }
      },
      [
        accessToken,
        isAdmin,
        runAuthorizedRequest,
      ]
    );

  const pageStats =
    useMemo(() => {
      let enabled = 0;
      let critical = 0;
      let serverScoped = 0;

      for (
        const rule of rules
      ) {
        if (
          Boolean(
            rule.isEnabled
          )
        ) {
          enabled += 1;
        }

        if (
          String(
            rule.severity
          ).toUpperCase() ===
          "CRITICAL"
        ) {
          critical += 1;
        }

        if (
          String(
            rule.scopeType
          ).toUpperCase() ===
          "SERVER"
        ) {
          serverScoped += 1;
        }
      }

      return {
        enabled,
        critical,
        serverScoped,
      };
    }, [rules]);

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
        search: "",
        scopeType: "",
        serverId: "",
        metricType: "",
        severity: "",
        isEnabled: "",
      });
    };

  const openCreate =
    async () => {
      setActionError("");

      setForm(
        EMPTY_FORM
      );

      setFormModal({
        mode: "create",
        rule: null,
      });

      if (
        !servers.length
      ) {
        await loadServers();
      }
    };

  const openEdit =
    async (
      rule
    ) => {
      setActionError("");

      setForm({
        ruleCode:
          rule.ruleCode || "",

        name:
          rule.name || "",

        description:
          rule.description || "",

        scopeType:
          rule.scopeType ||
          "GLOBAL",

        serverId:
          rule.serverId
            ? String(
              rule.serverId
            )
            : "",

        metricType:
          rule.metricType ||
          "CPU_USAGE_PERCENT",

        comparisonOperator:
          rule.comparisonOperator ||
          "GTE",

        thresholdValue:
          String(
            rule.thresholdValue ??
              ""
          ),

        recoveryValue:
          String(
            rule.recoveryValue ??
              ""
          ),

        severity:
          rule.severity ||
          "HIGH",

        consecutiveBreachesRequired:
          String(
            rule
              .consecutiveBreachesRequired ??
              3
          ),

        consecutiveRecoveriesRequired:
          String(
            rule
              .consecutiveRecoveriesRequired ??
              2
          ),

        isEnabled:
          Boolean(
            rule.isEnabled
          ),

        version:
          String(
            rule.version
          ),
      });

      setFormModal({
        mode: "edit",
        rule,
      });

      if (
        !servers.length
      ) {
        await loadServers();
      }
    };

  const closeFormModal =
    () => {
      if (submitting) {
        return;
      }

      setFormModal(null);
      setForm(
        EMPTY_FORM
      );
    };

  const submitRule =
    async (
      event
    ) => {
      event.preventDefault();

      if (
        !formModal ||
        !isAdmin
      ) {
        return;
      }

      const validationMessage =
        validateRuleForm(
          form
        );

      if (
        validationMessage
      ) {
        setActionError(
          validationMessage
        );
        return;
      }

      setSubmitting(true);
      setActionError("");

      try {
        let response;

        if (
          formModal.mode ===
          "create"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                alertRuleApi.create(
                  token,
                  form
                )
            );
        } else {
          response =
            await runAuthorizedRequest(
              (token) =>
                alertRuleApi.update(
                  token,
                  formModal.rule.id,
                  form
                )
            );
        }

        const updatedRule =
          response?.data
            ?.rule || null;

        setFormModal(null);
        setForm(
          EMPTY_FORM
        );

        await loadRules({
          silent: true,
        });

        if (
          updatedRule &&
          detailsOpen &&
          selectedRule?.id ===
            updatedRule.id
        ) {
          setSelectedRule(
            updatedRule
          );

          await loadStates(
            updatedRule.id,
            stateFilters
          );
        }
      } catch (requestError) {
        setActionError(
          requestError?.message ||
            "Alert rule could not be saved."
        );

        if (
          requestError?.status ===
          409
        ) {
          await loadRules({
            silent: true,
          });
        }
      } finally {
        setSubmitting(false);
      }
    };

  const loadRuleById =
    async (
      ruleId
    ) => {
      const response =
        await runAuthorizedRequest(
          (token) =>
            alertRuleApi.getById(
              token,
              ruleId
            )
        );

      return (
        response?.data
          ?.rule || null
      );
    };

  const loadStates =
    async (
      ruleId,
      nextFilters =
        stateFilters
    ) => {
      setStatesLoading(true);

      try {
        const response =
          await runAuthorizedRequest(
            (token) =>
              alertRuleApi.listStates(
                token,
                ruleId,
                nextFilters
              )
          );

        const data =
          response?.data || {};

        setStates(
          Array.isArray(
            data.states
          )
            ? data.states
            : []
        );

        setStatePagination({
          page:
            Number(
              data.pagination
                ?.page
            ) || 1,

          limit:
            Number(
              data.pagination
                ?.limit
            ) || 10,

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
            "Rule states could not be loaded."
        );

        setStates([]);
      } finally {
        setStatesLoading(false);
      }
    };

  const openDetails =
    async (
      rule
    ) => {
      setDetailsOpen(true);
      setDetailsLoading(true);
      setSelectedRule(
        rule
      );
      setStates([]);
      setActionError("");

      const nextStateFilters = {
        page: 1,
        limit: 10,
        status: "",
        serverId: "",
      };

      setStateFilters(
        nextStateFilters
      );

      try {
        const [
          freshRule,
        ] =
          await Promise.all([
            loadRuleById(
              rule.id
            ),
            loadStates(
              rule.id,
              nextStateFilters
            ),
          ]);

        if (
          freshRule
        ) {
          setSelectedRule(
            freshRule
          );
        }
      } catch (requestError) {
        setActionError(
          requestError?.message ||
            "Rule details could not be loaded."
        );
      } finally {
        setDetailsLoading(false);
      }
    };

  const refreshSelectedRule =
    async (
      ruleId
    ) => {
      try {
        const fresh =
          await loadRuleById(
            ruleId
          );

        if (fresh) {
          setSelectedRule(
            fresh
          );
        }

        return fresh;
      } catch {
        return null;
      }
    };

  const updateStateFilter =
    async (
      field,
      value
    ) => {
      if (
        !selectedRule
      ) {
        return;
      }

      const nextFilters = {
        ...stateFilters,
        page: 1,
        [field]: value,
      };

      setStateFilters(
        nextFilters
      );

      await loadStates(
        selectedRule.id,
        nextFilters
      );
    };

  const goToStatePage =
    async (
      page
    ) => {
      if (
        !selectedRule
      ) {
        return;
      }

      const nextFilters = {
        ...stateFilters,
        page,
      };

      setStateFilters(
        nextFilters
      );

      await loadStates(
        selectedRule.id,
        nextFilters
      );
    };

  const openConfirm =
    (
      type,
      rule
    ) => {
      setActionError("");

      setConfirmModal({
        type,
        rule,
      });
    };

  const closeConfirm =
    () => {
      if (submitting) {
        return;
      }

      setConfirmModal(null);
    };

  const submitConfirm =
    async () => {
      if (
        !confirmModal ||
        !isAdmin
      ) {
        return;
      }

      const {
        type,
        rule,
      } = confirmModal;

      setSubmitting(true);
      setActionError("");

      try {
        let response;

        if (
          type === "enable" ||
          type === "disable"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                alertRuleApi
                  .updateStatus(
                    token,
                    rule.id,
                    {
                      isEnabled:
                        type ===
                        "enable",

                      version:
                        Number(
                          rule.version
                        ),
                    }
                  )
            );
        } else if (
          type === "delete"
        ) {
          response =
            await runAuthorizedRequest(
              (token) =>
                alertRuleApi.remove(
                  token,
                  rule.id,
                  Number(
                    rule.version
                  )
                )
            );
        }

        const updatedRule =
          response?.data
            ?.rule || null;

        setConfirmModal(null);

        await loadRules({
          silent: true,
        });

        if (
          detailsOpen &&
          selectedRule?.id ===
            rule.id
        ) {
          if (
            type === "delete"
          ) {
            setDetailsOpen(
              false
            );
            setSelectedRule(
              null
            );
          } else {
            if (
              updatedRule
            ) {
              setSelectedRule(
                updatedRule
              );
            } else {
              await refreshSelectedRule(
                rule.id
              );
            }

            await loadStates(
              rule.id,
              stateFilters
            );
          }
        }
      } catch (requestError) {
        setActionError(
          requestError?.message ||
            "Alert rule action could not be completed."
        );

        if (
          requestError?.status ===
          409
        ) {
          await loadRules({
            silent: true,
          });

          if (
            detailsOpen
          ) {
            await refreshSelectedRule(
              rule.id
            );

            await loadStates(
              rule.id,
              stateFilters
            );
          }
        }
      } finally {
        setSubmitting(false);
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

  if (!isAdmin) {
    return (
      <main className="ops-shell alert-rules-shell">
        <section className="ops-main admin-only-main">
          <div className="admin-only-card">
            <div className="admin-only-icon">
              <LockIcon />
            </div>

            <span>
              ADMINISTRATOR ACCESS
            </span>

            <h1>
              Alert Rules are
              restricted.
            </h1>

            <p>
              Your current role is{" "}
              <strong>
                {role}
              </strong>
              . Alert-rule
              management is available
              only to administrators.
            </p>

            <button
              type="button"
              className="primary-action"
              onClick={() =>
                navigate("/")
              }
            >
              Return to Overview
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="ops-shell alert-rules-shell">
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
            active
            icon={
              <RuleIcon />
            }
            label="Alert Rules"
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
                POLICY ENGINE
              </small>

              <strong>
                ADMIN CONTROL
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
                  "Administrator"}
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
                PULSEOPS / ALERT RULES
              </div>

              <h1>
                Alert Rule Engine
              </h1>
            </div>
          </div>

          <div className="header-end">
            <div className="session-chip">
              <span className="live-dot" />

              <div>
                <small>
                  POLICY ENGINE
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

        <div className="ops-content alert-rules-content">
          {error && (
            <div className="dashboard-error-banner">
              <div>
                <strong>
                  ALERT RULE LINK ERROR
                </strong>

                <span>
                  {error}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  loadRules()
                }
              >
                RETRY
              </button>
            </div>
          )}

          {actionError && (
            <div className="rule-action-error">
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

          <section className="alert-rules-hero">
            <div>
              <div className="eyebrow">
                THRESHOLD AUTOMATION
              </div>

              <h2>
                Define when telemetry
                becomes an alert.
              </h2>

              <p>
                Control global or
                server-specific
                thresholds, recovery
                bands and consecutive
                evaluation requirements
                from one policy surface.
              </p>
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={
                openCreate
              }
            >
              <PlusIcon />

              Create Rule
            </button>
          </section>

          <section className="alert-rule-stat-grid">
            <RuleStatCard
              label="Total Rules"
              value={
                pagination.total
              }
              tone="neutral"
            />

            <RuleStatCard
              label="Enabled on page"
              value={
                pageStats.enabled
              }
              tone="good"
            />

            <RuleStatCard
              label="Critical on page"
              value={
                pageStats.critical
              }
              tone="danger"
            />

            <RuleStatCard
              label="Server scope on page"
              value={
                pageStats.serverScoped
              }
              tone="warning"
            />
          </section>

          <section className="surface alert-rule-browser">
            <div className="alert-rule-toolbar">
              <div className="rule-search">
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
                  placeholder="Search rule code, name, description or server..."
                />
              </div>

              <div className="rule-filter-grid">
                <RuleFilter
                  label="Scope"
                  value={
                    filters.scopeType
                  }
                  onChange={(
                    value
                  ) =>
                    updateFilter(
                      "scopeType",
                      value
                    )
                  }
                >
                  <option value="">
                    All scopes
                  </option>

                  {ALERT_RULE_SCOPE_TYPES.map(
                    (
                      scope
                    ) => (
                      <option
                        key={
                          scope
                        }
                        value={
                          scope
                        }
                      >
                        {formatLabel(
                          scope
                        )}
                      </option>
                    )
                  )}
                </RuleFilter>

                <RuleFilter
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

                  {ALERT_RULE_METRIC_TYPES.map(
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
                </RuleFilter>

                <RuleFilter
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

                  {ALERT_RULE_SEVERITIES.map(
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
                </RuleFilter>

                <RuleFilter
                  label="Enabled"
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
                    All
                  </option>

                  <option value="true">
                    Enabled
                  </option>

                  <option value="false">
                    Disabled
                  </option>
                </RuleFilter>

                <label className="rule-id-filter">
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

                <button
                  type="button"
                  className="clear-rule-filter"
                  onClick={
                    clearFilters
                  }
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="rule-browser-meta">
              <div>
                Showing{" "}
                <strong>
                  {rules.length}
                </strong>{" "}
                of{" "}
                <strong>
                  {pagination.total}
                </strong>{" "}
                rules
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={() =>
                  loadRules()
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
              <RuleLoader />
            ) : rules.length ? (
              <>
                <div className="alert-rule-table-wrap">
                  <table className="alert-rule-table">
                    <thead>
                      <tr>
                        <th>
                          Rule
                        </th>

                        <th>
                          Scope
                        </th>

                        <th>
                          Metric
                        </th>

                        <th>
                          Threshold
                        </th>

                        <th>
                          Severity
                        </th>

                        <th>
                          Status
                        </th>

                        <th>
                          Version
                        </th>

                        <th
                          aria-label="Actions"
                        />
                      </tr>
                    </thead>

                    <tbody>
                      {rules.map(
                        (
                          rule
                        ) => (
                          <RuleTableRow
                            key={
                              rule.id
                            }
                            rule={
                              rule
                            }
                            onDetails={
                              openDetails
                            }
                            onEdit={
                              openEdit
                            }
                            onConfirm={
                              openConfirm
                            }
                          />
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="alert-rule-mobile-list">
                  {rules.map(
                    (
                      rule
                    ) => (
                      <RuleMobileCard
                        key={
                          rule.id
                        }
                        rule={
                          rule
                        }
                        onDetails={
                          openDetails
                        }
                        onEdit={
                          openEdit
                        }
                        onConfirm={
                          openConfirm
                        }
                      />
                    )
                  )}
                </div>

                <RulePagination
                  pagination={
                    pagination
                  }
                  onPage={
                    goToPage
                  }
                />
              </>
            ) : (
              <RuleEmpty
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
          <RuleIcon />

          <span>
            Rules
          </span>
        </button>
      </nav>

      {detailsOpen && (
        <RuleDetailsDrawer
          rule={
            selectedRule
          }
          loading={
            detailsLoading
          }
          states={
            states
          }
          statesLoading={
            statesLoading
          }
          stateFilters={
            stateFilters
          }
          statePagination={
            statePagination
          }
          onStateFilter={
            updateStateFilter
          }
          onStatePage={
            goToStatePage
          }
          onClose={() => {
            setDetailsOpen(false);
            setSelectedRule(null);
            setStates([]);
          }}
          onEdit={
            openEdit
          }
          onConfirm={
            openConfirm
          }
        />
      )}

      {formModal && (
        <RuleFormModal
          mode={
            formModal.mode
          }
          form={
            form
          }
          servers={
            servers
          }
          submitting={
            submitting
          }
          onChange={(
            field,
            value
          ) =>
            setForm(
              (
                current
              ) => {
                const next = {
                  ...current,
                  [field]: value,
                };

                if (
                  field ===
                    "scopeType" &&
                  value ===
                    "GLOBAL"
                ) {
                  next.serverId =
                    "";
                }

                return next;
              }
            )
          }
          onClose={
            closeFormModal
          }
          onSubmit={
            submitRule
          }
        />
      )}

      {confirmModal && (
        <RuleConfirmModal
          type={
            confirmModal.type
          }
          rule={
            confirmModal.rule
          }
          submitting={
            submitting
          }
          onClose={
            closeConfirm
          }
          onSubmit={
            submitConfirm
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

function RuleStatCard({
  label,
  value,
  tone,
}) {
  return (
    <article
      className={`alert-rule-stat-card ${tone}`}
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

function RuleFilter({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="rule-filter-select">
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

function RuleTableRow({
  rule,
  onDetails,
  onEdit,
  onConfirm,
}) {
  const enabled =
    Boolean(
      rule.isEnabled
    );

  return (
    <tr>
      <td>
        <button
          type="button"
          className="rule-identity-button"
          onClick={() =>
            onDetails(
              rule
            )
          }
        >
          <span className="rule-identity-icon">
            <RuleIcon />
          </span>

          <span className="rule-identity-copy">
            <strong>
              {rule.name}
            </strong>

            <small>
              {rule.ruleCode}
            </small>
          </span>
        </button>
      </td>

      <td>
        <ScopeBadge
          scopeType={
            rule.scopeType
          }
          serverCode={
            rule.serverCode
          }
        />
      </td>

      <td>
        <span className="metric-label">
          {metricLabel(
            rule.metricType
          )}
        </span>
      </td>

      <td>
        <ThresholdCell
          rule={
            rule
          }
        />
      </td>

      <td>
        <RuleSeverityBadge
          severity={
            rule.severity
          }
        />
      </td>

      <td>
        <EnabledBadge
          enabled={
            enabled
          }
        />
      </td>

      <td>
        <span className="rule-version">
          v{rule.version}
        </span>
      </td>

      <td>
        <RuleRowActions
          rule={
            rule
          }
          onDetails={
            onDetails
          }
          onEdit={
            onEdit
          }
          onConfirm={
            onConfirm
          }
        />
      </td>
    </tr>
  );
}

function RuleMobileCard({
  rule,
  onDetails,
  onEdit,
  onConfirm,
}) {
  return (
    <article className="rule-mobile-card">
      <button
        type="button"
        className="rule-mobile-main"
        onClick={() =>
          onDetails(
            rule
          )
        }
      >
        <div className="rule-mobile-top">
          <RuleSeverityBadge
            severity={
              rule.severity
            }
          />

          <EnabledBadge
            enabled={
              Boolean(
                rule.isEnabled
              )
            }
          />
        </div>

        <strong>
          {rule.name}
        </strong>

        <span className="rule-mobile-code">
          {rule.ruleCode}
        </span>

        <div className="rule-mobile-meta">
          <span>
            {formatLabel(
              rule.scopeType
            )}
          </span>

          <span>
            {metricLabel(
              rule.metricType
            )}
          </span>

          <span>
            {operatorSymbol(
              rule.comparisonOperator
            )}{" "}
            {formatMetricValue(
              rule.metricType,
              rule.thresholdValue
            )}
          </span>
        </div>
      </button>

      <RuleRowActions
        rule={
          rule
        }
        onDetails={
          onDetails
        }
        onEdit={
          onEdit
        }
        onConfirm={
          onConfirm
        }
      />
    </article>
  );
}

function RuleRowActions({
  rule,
  onDetails,
  onEdit,
  onConfirm,
}) {
  const enabled =
    Boolean(
      rule.isEnabled
    );

  return (
    <div className="rule-row-actions">
      <button
        type="button"
        onClick={() =>
          onDetails(
            rule
          )
        }
        title="View rule and states"
      >
        <EyeIcon />
      </button>

      <button
        type="button"
        onClick={() =>
          onEdit(
            rule
          )
        }
        title="Edit rule"
      >
        <EditIcon />
      </button>

      <button
        type="button"
        onClick={() =>
          onConfirm(
            enabled
              ? "disable"
              : "enable",
            rule
          )
        }
        title={
          enabled
            ? "Disable rule"
            : "Enable rule"
        }
      >
        {enabled
          ? <PauseIcon />
          : <PlayIcon />}
      </button>

      <button
        type="button"
        className="danger"
        onClick={() =>
          onConfirm(
            "delete",
            rule
          )
        }
        title="Delete rule"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function ScopeBadge({
  scopeType,
  serverCode,
}) {
  const serverScope =
    String(
      scopeType
    ).toUpperCase() ===
    "SERVER";

  return (
    <div className="rule-scope-cell">
      <span
        className={`scope-badge ${
          serverScope
            ? "server"
            : "global"
        }`}
      >
        {serverScope
          ? "SERVER"
          : "GLOBAL"}
      </span>

      {serverScope && (
        <small>
          {serverCode ||
            "Server"}
        </small>
      )}
    </div>
  );
}

function ThresholdCell({
  rule,
}) {
  return (
    <div className="threshold-cell">
      <strong>
        {operatorSymbol(
          rule.comparisonOperator
        )}{" "}
        {formatMetricValue(
          rule.metricType,
          rule.thresholdValue
        )}
      </strong>

      <span>
        recover{" "}
        {recoveryPrefix(
          rule.comparisonOperator
        )}
        {" "}
        {formatMetricValue(
          rule.metricType,
          rule.recoveryValue
        )}
      </span>
    </div>
  );
}

function RuleSeverityBadge({
  severity,
}) {
  const normalized =
    String(
      severity ||
        "WARNING"
    ).toUpperCase();

  return (
    <span
      className={`rule-severity-badge severity-${normalized.toLowerCase()}`}
    >
      {normalized}
    </span>
  );
}

function EnabledBadge({
  enabled,
}) {
  return (
    <span
      className={`rule-enabled-badge ${
        enabled
          ? "enabled"
          : "disabled"
      }`}
    >
      <i />

      {enabled
        ? "ENABLED"
        : "DISABLED"}
    </span>
  );
}

function RulePagination({
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
    <div className="rule-pagination">
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

function RuleEmpty({
  onCreate,
}) {
  return (
    <div className="rule-empty-state">
      <div>
        <RuleIcon />
      </div>

      <strong>
        No alert rules found
      </strong>

      <p>
        Adjust your filters or
        create a threshold policy
        for server telemetry.
      </p>

      <button
        type="button"
        className="primary-action"
        onClick={
          onCreate
        }
      >
        <PlusIcon />

        Create Rule
      </button>
    </div>
  );
}

function RuleLoader() {
  return (
    <div className="rule-loader">
      <span />

      <strong>
        Loading alert rules
      </strong>
    </div>
  );
}

function RuleDetailsDrawer({
  rule,
  loading,
  states,
  statesLoading,
  stateFilters,
  statePagination,
  onStateFilter,
  onStatePage,
  onClose,
  onEdit,
  onConfirm,
}) {
  if (loading) {
    return (
      <div className="rule-overlay">
        <button
          type="button"
          className="rule-overlay-backdrop"
          onClick={
            onClose
          }
          aria-label="Close rule details"
        />

        <aside className="rule-details-drawer">
          <RuleLoader />
        </aside>
      </div>
    );
  }

  if (!rule) {
    return null;
  }

  return (
    <div className="rule-overlay">
      <button
        type="button"
        className="rule-overlay-backdrop"
        onClick={
          onClose
        }
        aria-label="Close rule details"
      />

      <aside className="rule-details-drawer">
        <div className="rule-drawer-header">
          <div>
            <span>
              ALERT RULE
            </span>

            <h3>
              {rule.ruleCode}
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

        <div className="rule-drawer-status">
          <div>
            <RuleSeverityBadge
              severity={
                rule.severity
              }
            />

            <EnabledBadge
              enabled={
                Boolean(
                  rule.isEnabled
                )
              }
            />
          </div>

          <span>
            VERSION{" "}
            {rule.version}
          </span>
        </div>

        <div className="rule-drawer-title">
          <h4>
            {rule.name}
          </h4>

          <p>
            {rule.description ||
              "No description provided."}
          </p>
        </div>

        <div className="rule-detail-section">
          <span className="rule-section-label">
            POLICY
          </span>

          <DetailRow
            label="Scope"
            value={
              formatLabel(
                rule.scopeType
              )
            }
          />

          <DetailRow
            label="Server"
            value={
              rule.scopeType ===
              "SERVER"
                ? `${
                  rule.serverName ||
                  "--"
                } (${
                  rule.serverCode ||
                  "--"
                })`
                : "All active servers"
            }
          />

          <DetailRow
            label="Metric"
            value={
              metricLabel(
                rule.metricType
              )
            }
          />

          <DetailRow
            label="Condition"
            value={`${operatorSymbol(
              rule.comparisonOperator
            )} ${formatMetricValue(
              rule.metricType,
              rule.thresholdValue
            )}`}
          />

          <DetailRow
            label="Recovery"
            value={`${recoveryPrefix(
              rule.comparisonOperator
            )} ${formatMetricValue(
              rule.metricType,
              rule.recoveryValue
            )}`}
          />
        </div>

        <div className="rule-detail-section">
          <span className="rule-section-label">
            EVALUATION
          </span>

          <DetailRow
            label="Severity"
            value={
              rule.severity
            }
          />

          <DetailRow
            label="Breaches Required"
            value={
              rule.consecutiveBreachesRequired
            }
          />

          <DetailRow
            label="Recoveries Required"
            value={
              rule.consecutiveRecoveriesRequired
            }
          />

          <DetailRow
            label="Created"
            value={
              formatDateTime(
                rule.createdAt
              )
            }
          />

          <DetailRow
            label="Updated"
            value={
              formatDateTime(
                rule.updatedAt
              )
            }
          />
        </div>

        <div className="rule-detail-section rule-state-section">
          <div className="rule-state-heading">
            <span className="rule-section-label">
              ALERT STATES
            </span>

            <strong>
              {statePagination.total}
            </strong>
          </div>

          <div className="rule-state-filters">
            <select
              value={
                stateFilters.status
              }
              onChange={(
                event
              ) =>
                onStateFilter(
                  "status",
                  event.target
                    .value
                )
              }
            >
              <option value="">
                All states
              </option>

              {ALERT_RULE_STATE_STATUSES.map(
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

            <input
              type="number"
              min="1"
              placeholder="Server ID"
              value={
                stateFilters.serverId
              }
              onChange={(
                event
              ) =>
                onStateFilter(
                  "serverId",
                  event.target
                    .value
                )
              }
            />
          </div>

          {statesLoading ? (
            <div className="state-loader">
              Loading states...
            </div>
          ) : states.length ? (
            <div className="rule-state-list">
              {states.map(
                (
                  state
                ) => (
                  <RuleStateCard
                    key={
                      state.id
                    }
                    state={
                      state
                    }
                    metricType={
                      rule.metricType
                    }
                  />
                )
              )}
            </div>
          ) : (
            <div className="rule-state-empty">
              No states match the
              selected filters.
            </div>
          )}

          <div className="state-pagination">
            <button
              type="button"
              disabled={
                statePagination.page <=
                1
              }
              onClick={() =>
                onStatePage(
                  statePagination.page -
                    1
                )
              }
            >
              Previous
            </button>

            <span>
              {statePagination.page}
              {" / "}
              {Math.max(
                statePagination.totalPages,
                1
              )}
            </span>

            <button
              type="button"
              disabled={
                statePagination.page >=
                Math.max(
                  statePagination.totalPages,
                  1
                )
              }
              onClick={() =>
                onStatePage(
                  statePagination.page +
                    1
                )
              }
            >
              Next
            </button>
          </div>
        </div>

        <div className="rule-drawer-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={() =>
              onEdit(
                rule
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
              onConfirm(
                Boolean(
                  rule.isEnabled
                )
                  ? "disable"
                  : "enable",
                rule
              )
            }
          >
            {Boolean(
              rule.isEnabled
            )
              ? <PauseIcon />
              : <PlayIcon />}

            {Boolean(
              rule.isEnabled
            )
              ? "Disable"
              : "Enable"}
          </button>

          <button
            type="button"
            className="secondary-action danger-action"
            onClick={() =>
              onConfirm(
                "delete",
                rule
              )
            }
          >
            <TrashIcon />

            Delete
          </button>
        </div>
      </aside>
    </div>
  );
}

function RuleStateCard({
  state,
  metricType,
}) {
  return (
    <article className="rule-state-card">
      <div className="rule-state-top">
        <div>
          <strong>
            {state.serverCode}
          </strong>

          <span>
            {state.serverName}
          </span>
        </div>

        <StateBadge
          status={
            state.currentStatus
          }
        />
      </div>

      <div className="rule-state-metrics">
        <div>
          <span>
            Last Value
          </span>

          <strong>
            {formatMetricValue(
              metricType,
              state.lastMetricValue
            )}
          </strong>
        </div>

        <div>
          <span>
            Breaches
          </span>

          <strong>
            {state.consecutiveBreaches}
          </strong>
        </div>

        <div>
          <span>
            Recoveries
          </span>

          <strong>
            {state.consecutiveRecoveries}
          </strong>
        </div>

        <div>
          <span>
            State Version
          </span>

          <strong>
            {state.stateVersion}
          </strong>
        </div>
      </div>

      <div className="rule-state-time">
        <span>
          Updated{" "}
          <strong>
            {formatDateTime(
              state.updatedAt
            )}
          </strong>
        </span>

        {state.activeAlertKey && (
          <code>
            {state.activeAlertKey}
          </code>
        )}
      </div>
    </article>
  );
}

function StateBadge({
  status,
}) {
  const normalized =
    String(
      status || "NORMAL"
    ).toUpperCase();

  return (
    <span
      className={`rule-state-badge state-${normalized.toLowerCase()}`}
    >
      <i />

      {normalized}
    </span>
  );
}

function DetailRow({
  label,
  value,
}) {
  return (
    <div className="rule-detail-row">
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

function RuleFormModal({
  mode,
  form,
  servers,
  submitting,
  onChange,
  onClose,
  onSubmit,
}) {
  const editing =
    mode === "edit";

  return (
    <div className="rule-modal-layer">
      <button
        type="button"
        className="rule-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close rule form"
      />

      <form
        className="rule-form-modal"
        onSubmit={
          onSubmit
        }
      >
        <div className="rule-drawer-header">
          <div>
            <span>
              {editing
                ? "EDIT ALERT RULE"
                : "NEW ALERT RULE"}
            </span>

            <h3>
              {editing
                ? "Update threshold policy"
                : "Create threshold policy"}
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

        <div className="rule-form-body">
          <div className="rule-form-grid">
            <RuleField
              label="Rule Code"
              required
            >
              <input
                required
                maxLength="80"
                disabled={
                  editing
                }
                value={
                  form.ruleCode
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "ruleCode",
                    event.target
                      .value
                  )
                }
                placeholder="CPU-HIGH-GLOBAL"
              />
            </RuleField>

            <RuleField
              label="Name"
              required
            >
              <input
                required
                maxLength="150"
                value={
                  form.name
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "name",
                    event.target
                      .value
                  )
                }
                placeholder="High CPU Usage"
              />
            </RuleField>

            <RuleField
              label="Scope"
              required
            >
              <select
                value={
                  form.scopeType
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "scopeType",
                    event.target
                      .value
                  )
                }
              >
                {ALERT_RULE_SCOPE_TYPES.map(
                  (
                    scope
                  ) => (
                    <option
                      key={
                        scope
                      }
                      value={
                        scope
                      }
                    >
                      {formatLabel(
                        scope
                      )}
                    </option>
                  )
                )}
              </select>
            </RuleField>

            <RuleField
              label="Server"
              required={
                form.scopeType ===
                "SERVER"
              }
            >
              <select
                required={
                  form.scopeType ===
                  "SERVER"
                }
                disabled={
                  form.scopeType !==
                  "SERVER"
                }
                value={
                  form.serverId
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "serverId",
                    event.target
                      .value
                  )
                }
              >
                <option value="">
                  {form.scopeType ===
                  "SERVER"
                    ? "Select server"
                    : "Not required"}
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
            </RuleField>

            <RuleField
              label="Metric"
              required
            >
              <select
                value={
                  form.metricType
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "metricType",
                    event.target
                      .value
                  )
                }
              >
                {ALERT_RULE_METRIC_TYPES.map(
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
              </select>
            </RuleField>

            <RuleField
              label="Operator"
              required
            >
              <select
                value={
                  form.comparisonOperator
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "comparisonOperator",
                    event.target
                      .value
                  )
                }
              >
                {ALERT_RULE_OPERATORS.map(
                  (
                    operator
                  ) => (
                    <option
                      key={
                        operator
                      }
                      value={
                        operator
                      }
                    >
                      {operator}
                      {" · "}
                      {operatorSymbol(
                        operator
                      )}
                    </option>
                  )
                )}
              </select>
            </RuleField>

            <RuleField
              label="Threshold"
              required
            >
              <input
                type="number"
                step="any"
                min="0"
                required
                value={
                  form.thresholdValue
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "thresholdValue",
                    event.target
                      .value
                  )
                }
              />
            </RuleField>

            <RuleField
              label="Recovery"
              required
            >
              <input
                type="number"
                step="any"
                min="0"
                required
                value={
                  form.recoveryValue
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "recoveryValue",
                    event.target
                      .value
                  )
                }
              />
            </RuleField>

            <RuleField
              label="Severity"
              required
            >
              <select
                value={
                  form.severity
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "severity",
                    event.target
                      .value
                  )
                }
              >
                {ALERT_RULE_SEVERITIES.map(
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
            </RuleField>

            <RuleField
              label="Consecutive Breaches"
              required
            >
              <input
                type="number"
                min="1"
                max="1000"
                required
                value={
                  form.consecutiveBreachesRequired
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "consecutiveBreachesRequired",
                    event.target
                      .value
                  )
                }
              />
            </RuleField>

            <RuleField
              label="Consecutive Recoveries"
              required
            >
              <input
                type="number"
                min="1"
                max="1000"
                required
                value={
                  form.consecutiveRecoveriesRequired
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "consecutiveRecoveriesRequired",
                    event.target
                      .value
                  )
                }
              />
            </RuleField>

            {!editing && (
              <label className="rule-enabled-input">
                <input
                  type="checkbox"
                  checked={
                    form.isEnabled
                  }
                  onChange={(
                    event
                  ) =>
                    onChange(
                      "isEnabled",
                      event.target
                        .checked
                    )
                  }
                />

                <span>
                  Enable immediately
                </span>
              </label>
            )}

            <RuleField
              label="Description"
              full
            >
              <textarea
                rows="4"
                maxLength="500"
                value={
                  form.description
                }
                onChange={(
                  event
                ) =>
                  onChange(
                    "description",
                    event.target
                      .value
                  )
                }
                placeholder="Explain what this rule protects and why..."
              />
            </RuleField>
          </div>

          <div className="rule-form-hint">
            <strong>
              Recovery direction:
            </strong>{" "}
            GT/GTE requires a lower
            recovery value. LT/LTE
            requires a higher recovery
            value.
          </div>
        </div>

        <div className="rule-form-footer">
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
                ? "Update Rule"
                : "Create Rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RuleField({
  label,
  required = false,
  full = false,
  children,
}) {
  return (
    <label
      className={`rule-form-field ${
        full
          ? "full"
          : ""
      }`}
    >
      <span>
        {label}

        {required && (
          <b>*</b>
        )}
      </span>

      {children}
    </label>
  );
}

function RuleConfirmModal({
  type,
  rule,
  submitting,
  onClose,
  onSubmit,
}) {
  const config =
    getConfirmConfig(
      type
    );

  return (
    <div className="rule-modal-layer compact">
      <button
        type="button"
        className="rule-modal-backdrop"
        onClick={
          onClose
        }
        aria-label="Close confirmation"
      />

      <div className="rule-confirm-modal">
        <div className="rule-drawer-header">
          <div>
            <span>
              RULE ACTION
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

        <div className="rule-confirm-body">
          <div className="confirm-rule-reference">
            <strong>
              {rule.ruleCode}
            </strong>

            <span>
              {rule.name}
            </span>
          </div>

          <p>
            {config.message}
          </p>

          <div className="confirm-version">
            Current version:{" "}
            <strong>
              {rule.version}
            </strong>
          </div>
        </div>

        <div className="rule-form-footer">
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
              type ===
              "delete"
                ? "secondary-action danger-action"
                : "primary-action"
            }
            onClick={
              onSubmit
            }
            disabled={
              submitting
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

function getConfirmConfig(
  type
) {
  if (
    type === "enable"
  ) {
    return {
      title:
        "Enable alert rule",
      submitLabel:
        "Enable Rule",
      message:
        "Enable this policy so future telemetry evaluations can trigger its threshold lifecycle.",
    };
  }

  if (
    type === "disable"
  ) {
    return {
      title:
        "Disable alert rule",
      submitLabel:
        "Disable Rule",
      message:
        "Disable this policy. The backend will reject the action if the rule currently owns an active alert.",
    };
  }

  return {
    title:
      "Delete alert rule",
    submitLabel:
      "Delete Rule",
    message:
      "Soft-delete this rule. The backend will reject deletion while the rule has an active alert.",
  };
}

function validateRuleForm(
  form
) {
  if (
    !String(
      form.ruleCode
    ).trim()
  ) {
    return "Rule code is required.";
  }

  if (
    !String(
      form.name
    ).trim()
  ) {
    return "Rule name is required.";
  }

  if (
    form.scopeType ===
      "SERVER" &&
    !Number(
      form.serverId
    )
  ) {
    return "Select a server for SERVER scope.";
  }

  const threshold =
    Number(
      form.thresholdValue
    );

  const recovery =
    Number(
      form.recoveryValue
    );

  if (
    !Number.isFinite(
      threshold
    ) ||
    !Number.isFinite(
      recovery
    )
  ) {
    return "Threshold and recovery values must be valid numbers.";
  }

  const percentageMetric =
    form.metricType !==
    "RESPONSE_TIME_MS";

  const maximum =
    percentageMetric
      ? 100
      : 86400000;

  if (
    threshold < 0 ||
    threshold >
      maximum ||
    recovery < 0 ||
    recovery >
      maximum
  ) {
    return percentageMetric
      ? "Percentage thresholds must be between 0 and 100."
      : "Response-time values must be between 0 and 86400000 ms.";
  }

  if (
    (
      form.comparisonOperator ===
        "GT" ||
      form.comparisonOperator ===
        "GTE"
    ) &&
    recovery >=
      threshold
  ) {
    return "For GT/GTE rules, recovery value must be lower than threshold value.";
  }

  if (
    (
      form.comparisonOperator ===
        "LT" ||
      form.comparisonOperator ===
        "LTE"
    ) &&
    recovery <=
      threshold
  ) {
    return "For LT/LTE rules, recovery value must be higher than threshold value.";
  }

  const breaches =
    Number(
      form.consecutiveBreachesRequired
    );

  const recoveries =
    Number(
      form.consecutiveRecoveriesRequired
    );

  if (
    !Number.isSafeInteger(
      breaches
    ) ||
    breaches < 1 ||
    breaches > 1000 ||
    !Number.isSafeInteger(
      recoveries
    ) ||
    recoveries < 1 ||
    recoveries > 1000
  ) {
    return "Consecutive breach/recovery counts must be integers between 1 and 1000.";
  }

  return "";
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

function recoveryPrefix(
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

function getInitials(
  name = ""
) {
  const pieces =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!pieces.length) {
    return "AD";
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

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m8 5 11 7-11 7Z" />
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