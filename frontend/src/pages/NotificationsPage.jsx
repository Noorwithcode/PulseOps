import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  notificationApi,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
} from "../api/notificationApi.js";
import "./DashboardPage.css";
import "./NotificationsPage.css";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    user,
    accessToken,
    logout,
    refreshAccessToken,
  } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    unreadOnly: false,
    notificationType: "",
    severity: "",
  });
  const [loading, setLoading] = useState(true);
  const [countLoading, setCountLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [now, setNow] = useState(new Date());
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

  const runAuthorizedRequest = useCallback(
    async (operation) => {
      try {
        return await operation(accessToken);
      } catch (requestError) {
        if (requestError?.status !== 401) throw requestError;
        const token = await refreshAccessToken();
        return operation(token);
      }
    },
    [accessToken, refreshAccessToken]
  );

  const loadUnreadCount = useCallback(
    async ({ silent = false } = {}) => {
      if (!accessToken) {
        setCountLoading(false);
        return;
      }
      if (!silent) setCountLoading(true);
      try {
        const response = await runAuthorizedRequest((token) =>
          notificationApi.unreadCount(token)
        );
        setUnreadCount(Number(response?.data?.unreadCount) || 0);
      } catch (requestError) {
        setFeedback({
          type: "error",
          message:
            requestError?.message ||
            "Unread notification count could not be loaded.",
        });
      } finally {
        setCountLoading(false);
      }
    },
    [accessToken, runAuthorizedRequest]
  );

  const loadNotifications = useCallback(
    async ({ silent = false } = {}) => {
      if (!accessToken || requestRunningRef.current) return;
      requestRunningRef.current = true;
      if (!silent) setLoading(true);

      try {
        const response = await runAuthorizedRequest((token) =>
          notificationApi.list(token, {
            ...filters,
            unreadOnly: filters.unreadOnly || undefined,
            notificationType: filters.notificationType || undefined,
            severity: filters.severity || undefined,
          })
        );

        const data = response?.data || {};
        setNotifications(
          Array.isArray(data.notifications) ? data.notifications : []
        );
        setPagination({
          page: Number(data.pagination?.page) || 1,
          limit: Number(data.pagination?.limit) || 20,
          total: Number(data.pagination?.total) || 0,
          totalPages: Math.max(Number(data.pagination?.totalPages) || 1, 1),
        });

        if (data.unreadCount !== undefined) {
          setUnreadCount(Number(data.unreadCount) || 0);
        }
        setError("");
      } catch (requestError) {
        setError(
          requestError?.message || "Notifications could not be loaded."
        );
      } finally {
        requestRunningRef.current = false;
        setLoading(false);
      }
    },
    [accessToken, filters, runAuthorizedRequest]
  );

  useEffect(() => {
    if (!accessToken) return;
    loadNotifications();
    loadUnreadCount();

    const timer = setInterval(() => {
      loadNotifications({ silent: true });
      loadUnreadCount({ silent: true });
    }, 30000);

    return () => clearInterval(timer);
  }, [accessToken, loadNotifications, loadUnreadCount]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      page: 1,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 20,
      unreadOnly: false,
      notificationType: "",
      severity: "",
    });
  };

  const refreshAll = async () => {
    setFeedback(null);
    await Promise.all([loadNotifications(), loadUnreadCount()]);
    if (detailsOpen && selectedNotification) {
      await openDetails(selectedNotification, { preserveDrawer: true });
    }
  };

  const openDetails = async (
    notification,
    { preserveDrawer = false } = {}
  ) => {
    if (!preserveDrawer) setDetailsOpen(true);
    setSelectedNotification(notification);
    setDetailsLoading(true);
    setFeedback(null);

    try {
      const response = await runAuthorizedRequest((token) =>
        notificationApi.getById(token, notification.id)
      );
      setSelectedNotification(
        response?.data?.notification || notification
      );
    } catch (requestError) {
      setFeedback({
        type: "error",
        message:
          requestError?.message ||
          "Notification details could not be loaded.",
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const markRead = async (notification) => {
    if (!notification || notification.isRead) return;

    setActionId(notification.id);
    setFeedback(null);

    try {
      const response = await runAuthorizedRequest((token) =>
        notificationApi.markAsRead(
          token,
          notification.id,
          notification.version
        )
      );

      const updated = response?.data?.notification;
      if (updated) {
        setNotifications((current) =>
          current.map((item) => (item.id === updated.id ? updated : item))
        );
        if (selectedNotification?.id === updated.id) {
          setSelectedNotification(updated);
        }
      }

      setUnreadCount((current) => Math.max(current - 1, 0));
      setFeedback({
        type: "success",
        message: "Notification marked as read.",
      });
    } catch (requestError) {
      if (requestError?.status === 409) {
        await Promise.all([loadNotifications(), loadUnreadCount()]);
        if (selectedNotification?.id === notification.id) {
          await openDetails(notification, { preserveDrawer: true });
        }
      }

      setFeedback({
        type: "error",
        message:
          requestError?.message ||
          "Notification could not be marked as read.",
      });
    } finally {
      setActionId(null);
    }
  };

  const markAllRead = async () => {
    if (unreadCount <= 0 || markingAll) return;

    setMarkingAll(true);
    setFeedback(null);

    try {
      const response = await runAuthorizedRequest((token) =>
        notificationApi.markAllAsRead(token)
      );

      const updatedCount = Number(response?.data?.updatedCount) || 0;
      setUnreadCount(0);
      setFeedback({
        type: "success",
        message: `${updatedCount} notification${
          updatedCount === 1 ? "" : "s"
        } marked as read.`,
      });

      await loadNotifications({ silent: true });

      if (detailsOpen && selectedNotification) {
        await openDetails(selectedNotification, { preserveDrawer: true });
      }
    } catch (requestError) {
      setFeedback({
        type: "error",
        message:
          requestError?.message ||
          "Notifications could not be marked as read.",
      });
    } finally {
      setMarkingAll(false);
    }
  };

  const removeNotification = async (notification) => {
    if (!notification) return;

    const confirmed = window.confirm(
      `Delete notification "${notification.title}"?`
    );
    if (!confirmed) return;

    setActionId(notification.id);
    setFeedback(null);

    try {
      await runAuthorizedRequest((token) =>
        notificationApi.remove(
          token,
          notification.id,
          notification.version
        )
      );

      if (selectedNotification?.id === notification.id) {
        setDetailsOpen(false);
        setSelectedNotification(null);
      }

      setFeedback({
        type: "success",
        message: "Notification deleted.",
      });

      await Promise.all([
        loadNotifications({ silent: true }),
        loadUnreadCount({ silent: true }),
      ]);
    } catch (requestError) {
      if (requestError?.status === 409) {
        await Promise.all([loadNotifications(), loadUnreadCount()]);
      }

      setFeedback({
        type: "error",
        message:
          requestError?.message ||
          "Notification could not be deleted.",
      });
    } finally {
      setActionId(null);
    }
  };

  const pageStats = useMemo(
    () => ({
      unread: notifications.filter((item) => !item.isRead).length,
      critical: notifications.filter(
        (item) => String(item.severity).toUpperCase() === "CRITICAL"
      ).length,
      incident: notifications.filter((item) => item.incidentId).length,
    }),
    [notifications]
  );

  return (
    <main className="ops-shell notifications-shell">
      <div className="ops-bg-grid" aria-hidden="true" />

      <aside className={`ops-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark"><HeartbeatIcon /></div>
          <div>
            <div className="brand-name">PULSE<span>OPS</span></div>
            <div className="brand-subtitle">OPERATIONS CONTROL</div>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          <SidebarItem icon={<DashboardIcon />} label="Overview" onClick={() => navigate("/")} />
          <SidebarItem icon={<ServerIcon />} label="Servers" onClick={() => navigate("/servers")} />
          <SidebarItem icon={<IncidentIcon />} label="Incidents" onClick={() => navigate("/incidents")} />
          <SidebarItem icon={<AlertIcon />} label="Alerts" onClick={() => navigate("/alerts")} />
          <SidebarItem icon={<RuleIcon />} label="Alert Rules" onClick={() => navigate("/alert-rules")} />
          <SidebarItem active icon={<NotificationIcon />} label="Notifications" badge={unreadCount} />
        </nav>

        <div className="sidebar-footer">
          <div className="system-pill">
            <span className="live-dot" />
            <div><small>DELIVERY STREAM</small><strong>LIVE</strong></div>
          </div>

          <div className="operator-card">
            <div className="operator-avatar">{getInitials(user?.fullName)}</div>
            <div className="operator-copy">
              <strong>{user?.fullName || "Operator"}</strong>
              <span>{user?.role?.code || "USER"}</span>
            </div>
            <button type="button" className="sidebar-logout" onClick={handleLogout} aria-label="Sign out">
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
              <div className="breadcrumb">PULSEOPS / NOTIFICATIONS</div>
              <h1>Notification Center</h1>
            </div>
          </div>

          <div className="header-end">
            <div className="session-chip">
              <span className="live-dot" />
              <div>
                <small>UNREAD</small>
                <strong>{countLoading ? "…" : unreadCount}</strong>
              </div>
            </div>

            <div className="utc-block">
              <small>UTC</small>
              <strong>{utcTime}</strong>
              <span>{utcDate}</span>
            </div>

            <button type="button" className="header-icon-button notifications-header-bell" aria-label="Notifications">
              <NotificationIcon />
              {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>

            <button type="button" className="mobile-logout" onClick={handleLogout} aria-label="Sign out">
              <LogoutIcon />
            </button>
          </div>
        </header>

        <div className="ops-content notifications-content">
          {error && (
            <div className="dashboard-error-banner">
              <div>
                <strong>NOTIFICATION LINK ERROR</strong>
                <span>{error}</span>
              </div>
              <button type="button" onClick={refreshAll}>RETRY</button>
            </div>
          )}

          {feedback && (
            <div className={`notifications-feedback ${feedback.type}`}>
              {feedback.type === "success" ? <CheckIcon /> : <AlertIcon />}
              <strong>{feedback.message}</strong>
              <button type="button" onClick={() => setFeedback(null)}>×</button>
            </div>
          )}

          <section className="notifications-hero">
            <div>
              <div className="eyebrow">OPERATOR INBOX</div>
              <h2>Signals that need your attention.</h2>
              <p>
                Review operational events from incidents, servers and alert
                rules, with version-safe read and delete actions.
              </p>
            </div>

            <div className="notifications-hero-actions">
              <button type="button" className="notifications-secondary-action" onClick={refreshAll} disabled={loading}>
                <RefreshIcon /> Refresh
              </button>

              <button
                type="button"
                className="notifications-primary-action"
                onClick={markAllRead}
                disabled={unreadCount <= 0 || markingAll}
              >
                <CheckDoubleIcon />
                {markingAll ? "Marking..." : "Mark all read"}
              </button>
            </div>
          </section>

          <section className="notification-summary-grid">
            <NotificationSummaryCard label="All Notifications" value={pagination.total} helper="Current result" tone="neutral" />
            <NotificationSummaryCard label="Unread" value={countLoading ? "…" : unreadCount} helper="Needs review" tone="cyan" />
            <NotificationSummaryCard label="Critical on Page" value={pageStats.critical} helper="Highest severity" tone="danger" />
            <NotificationSummaryCard label="Incident Linked" value={pageStats.incident} helper="Current page" tone="warning" />
          </section>

          <section className="surface notifications-browser">
            <div className="notifications-toolbar">
              <div className="notifications-filter-grid">
                <NotificationFilter
                  label="Notification Type"
                  value={filters.notificationType}
                  onChange={(value) => updateFilter("notificationType", value)}
                >
                  <option value="">All types</option>
                  {NOTIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>{formatLabel(type)}</option>
                  ))}
                </NotificationFilter>

                <NotificationFilter
                  label="Severity"
                  value={filters.severity}
                  onChange={(value) => updateFilter("severity", value)}
                >
                  <option value="">All severities</option>
                  {NOTIFICATION_SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>{formatLabel(severity)}</option>
                  ))}
                </NotificationFilter>

                <label className="notifications-unread-toggle">
                  <input
                    type="checkbox"
                    checked={filters.unreadOnly}
                    onChange={(event) => updateFilter("unreadOnly", event.target.checked)}
                  />
                  <span>Unread only</span>
                </label>

                <button type="button" className="notifications-clear-filter" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            </div>

            <div className="notifications-browser-meta">
              <div>Showing <strong>{notifications.length}</strong> of <strong>{pagination.total}</strong></div>
              <div>
                <span>Unread on page <strong>{pageStats.unread}</strong></span>
                <span>Page <strong>{pagination.page}</strong></span>
              </div>
            </div>

            {loading ? (
              <NotificationsLoader />
            ) : notifications.length ? (
              <>
                <div className="notifications-list">
                  {notifications.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      actionId={actionId}
                      onOpen={openDetails}
                      onRead={markRead}
                      onDelete={removeNotification}
                    />
                  ))}
                </div>

                <NotificationsPagination
                  pagination={pagination}
                  onPage={(page) =>
                    setFilters((current) => ({ ...current, page }))
                  }
                />
              </>
            ) : (
              <NotificationsEmpty />
            )}
          </section>
        </div>
      </section>

      <nav className="mobile-bottom-nav">
        <button type="button" onClick={() => navigate("/")}>
          <DashboardIcon /><span>Home</span>
        </button>
        <button type="button" onClick={() => navigate("/servers")}>
          <ServerIcon /><span>Servers</span>
        </button>
        <button type="button" onClick={() => navigate("/incidents")}>
          <IncidentIcon /><span>Incidents</span>
        </button>
        <button type="button" className="active">
          <NotificationIcon /><span>Inbox</span>
          {unreadCount > 0 && <i>{unreadCount > 9 ? "9+" : unreadCount}</i>}
        </button>
      </nav>

      {detailsOpen && (
        <NotificationDetailsDrawer
          notification={selectedNotification}
          loading={detailsLoading}
          actionId={actionId}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedNotification(null);
          }}
          onRefresh={() =>
            openDetails(selectedNotification, { preserveDrawer: true })
          }
          onRead={markRead}
          onDelete={removeNotification}
          onNavigateSource={(notification) =>
            navigateToSource(notification, navigate)
          }
        />
      )}
    </main>
  );
}

function SidebarItem({ icon, label, active = false, badge, onClick }) {
  return (
    <button
      type="button"
      className={`sidebar-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="sidebar-item-icon">{icon}</span>
      <span className="sidebar-item-label">{label}</span>
      {badge !== undefined && badge !== null && Number(badge) > 0 && (
        <span className="sidebar-item-badge">
          {Number(badge) > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function NotificationSummaryCard({ label, value, helper, tone }) {
  return (
    <article className={`notification-summary-card ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
      <i />
    </article>
  );
}

function NotificationFilter({ label, value, onChange, children }) {
  return (
    <label className="notification-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function NotificationRow({
  notification,
  actionId,
  onOpen,
  onRead,
  onDelete,
}) {
  const busy = actionId === notification.id;

  return (
    <article className={`notification-row ${notification.isRead ? "is-read" : "is-unread"}`}>
      <button type="button" className="notification-main" onClick={() => onOpen(notification)}>
        <div className={`notification-type-icon type-${String(notification.notificationType || "SYSTEM").toLowerCase()}`}>
          {notificationIcon(notification.notificationType)}
        </div>

        <div className="notification-copy">
          <div className="notification-copy-top">
            <div>
              {!notification.isRead && <span className="unread-dot" />}
              <NotificationSeverityBadge severity={notification.severity} />
              <span className="notification-type-text">{formatLabel(notification.notificationType)}</span>
            </div>
            <time>{formatRelativeTime(notification.createdAt)}</time>
          </div>

          <h3>{notification.title}</h3>
          <p>{notification.message || "No message supplied."}</p>

          <div className="notification-context">
            {notification.serverCode && <span><ServerIcon />{notification.serverCode}</span>}
            {notification.incidentNumber && <span><IncidentIcon />{notification.incidentNumber}</span>}
            {notification.alertRuleCode && <span><RuleIcon />{notification.alertRuleCode}</span>}
            <span>v{notification.version}</span>
          </div>
        </div>
      </button>

      <div className="notification-row-actions">
        {!notification.isRead && (
          <button type="button" className="notification-read-button" disabled={busy} onClick={() => onRead(notification)}>
            <CheckIcon /> Mark read
          </button>
        )}

        <button
          type="button"
          className="notification-delete-button"
          disabled={busy}
          onClick={() => onDelete(notification)}
          aria-label="Delete notification"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

function NotificationSeverityBadge({ severity }) {
  const normalized = String(severity || "INFO").toUpperCase();
  return (
    <span className={`notification-severity-badge severity-${normalized.toLowerCase()}`}>
      {normalized}
    </span>
  );
}

function NotificationsPagination({ pagination, onPage }) {
  const page = Number(pagination.page) || 1;
  const totalPages = Math.max(Number(pagination.totalPages) || 1, 1);

  return (
    <div className="notifications-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeftIcon /> Previous
      </button>
      <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next <ChevronRightIcon />
      </button>
    </div>
  );
}

function NotificationsLoader() {
  return (
    <div className="notifications-loader">
      <span />
      <strong>Loading notifications</strong>
    </div>
  );
}

function NotificationsEmpty() {
  return (
    <div className="notifications-empty">
      <div><NotificationIcon /></div>
      <strong>Inbox is clear</strong>
      <p>No notification matches the current filter.</p>
    </div>
  );
}

function NotificationDetailsDrawer({
  notification,
  loading,
  actionId,
  onClose,
  onRefresh,
  onRead,
  onDelete,
  onNavigateSource,
}) {
  if (loading) {
    return (
      <div className="notification-drawer-layer">
        <button type="button" className="notification-drawer-backdrop" onClick={onClose} aria-label="Close notification details" />
        <aside className="notification-details-drawer">
          <NotificationsLoader />
        </aside>
      </div>
    );
  }

  if (!notification) return null;

  const busy = actionId === notification.id;
  const hasSourceNavigation = Boolean(
    notification.incidentId ||
      notification.serverId ||
      notification.alertRuleId
  );

  return (
    <div className="notification-drawer-layer">
      <button type="button" className="notification-drawer-backdrop" onClick={onClose} aria-label="Close notification details" />
      <aside className="notification-details-drawer">
        <div className="notification-drawer-header">
          <div>
            <span>NOTIFICATION</span>
            <h3>#{notification.id}</h3>
          </div>
          <button type="button" className="notification-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="notification-drawer-badges">
          <NotificationSeverityBadge severity={notification.severity} />
          <span className={`notification-read-state ${notification.isRead ? "read" : "unread"}`}>
            {notification.isRead ? "READ" : "UNREAD"}
          </span>
          <span className="notification-source-badge">{formatLabel(notification.sourceType)}</span>
        </div>

        <div className="notification-drawer-title">
          <span>{formatLabel(notification.notificationType)}</span>
          <h4>{notification.title}</h4>
          <p>{notification.message || "No notification message supplied."}</p>
        </div>

        <div className="notification-drawer-actions">
          {!notification.isRead && (
            <button type="button" className="notification-drawer-primary" disabled={busy} onClick={() => onRead(notification)}>
              <CheckIcon /> Mark as read
            </button>
          )}

          {hasSourceNavigation && (
            <button type="button" className="notification-drawer-secondary" onClick={() => onNavigateSource(notification)}>
              <ExternalIcon /> Open source
            </button>
          )}

          <button type="button" className="notification-drawer-refresh" onClick={onRefresh}>
            <RefreshIcon /> Refresh
          </button>

          <button type="button" className="notification-drawer-danger" disabled={busy} onClick={() => onDelete(notification)}>
            <TrashIcon /> Delete
          </button>
        </div>

        <section className="notification-detail-section">
          <span className="notification-section-label">CONTEXT</span>
          <NotificationDetailRow label="Source Type" value={formatLabel(notification.sourceType)} />
          <NotificationDetailRow label="Source ID" value={notification.sourceId ?? "--"} />
          <NotificationDetailRow
            label="Server"
            value={
              notification.serverCode
                ? `${notification.serverName || ""} (${notification.serverCode})`
                : "--"
            }
          />
          <NotificationDetailRow label="Incident" value={notification.incidentNumber || "--"} />
          <NotificationDetailRow label="Alert Rule" value={notification.alertRuleCode || "--"} />
        </section>

        <section className="notification-detail-section">
          <span className="notification-section-label">DELIVERY STATE</span>
          <NotificationDetailRow label="Recipient" value={notification.recipientName || "--"} />
          <NotificationDetailRow label="Recipient Email" value={notification.recipientEmail || "--"} />
          <NotificationDetailRow label="Read" value={notification.isRead ? "Yes" : "No"} />
          <NotificationDetailRow label="Read At" value={formatDateTime(notification.readAt)} />
          <NotificationDetailRow label="Version" value={notification.version} />
          <NotificationDetailRow label="Created" value={formatDateTime(notification.createdAt)} />
          <NotificationDetailRow label="Updated" value={formatDateTime(notification.updatedAt)} />
        </section>

        <section className="notification-detail-section">
          <span className="notification-section-label">METADATA</span>
          <MetadataView metadata={notification.metadata} />
        </section>

        <section className="notification-detail-section">
          <span className="notification-section-label">IDEMPOTENCY</span>
          <NotificationDetailRow label="Dedup Key" value={notification.dedupKey || "--"} />
        </section>
      </aside>
    </div>
  );
}

function NotificationDetailRow({ label, value }) {
  return (
    <div className="notification-detail-row">
      <span>{label}</span>
      <strong>{String(value ?? "--")}</strong>
    </div>
  );
}

function MetadataView({ metadata }) {
  if (metadata === null || metadata === undefined || metadata === "") {
    return <div className="notification-metadata-empty">No metadata attached.</div>;
  }

  return (
    <pre className="notification-metadata">
      {typeof metadata === "object"
        ? JSON.stringify(metadata, null, 2)
        : String(metadata)}
    </pre>
  );
}

function navigateToSource(notification, navigate) {
  if (notification.incidentId) return navigate("/incidents");
  if (notification.alertRuleId) return navigate("/alert-rules");
  if (notification.serverId) return navigate("/servers");
}

function notificationIcon(notificationType) {
  const type = String(notificationType || "SYSTEM").toUpperCase();
  if (type.startsWith("INCIDENT")) return <IncidentIcon />;
  if (type.startsWith("ALERT")) return <AlertIcon />;
  if (type.startsWith("SERVER")) return <ServerIcon />;
  return <NotificationIcon />;
}

function formatRelativeTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const minutes = Math.floor(Math.abs(diffMs) / 60000);

  if (minutes < 1) return future ? "soon" : "just now";
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;

  return formatDateTime(value);
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_, prefix, letter) =>
      `${prefix ? " " : ""}${letter.toUpperCase()}`
    );
}

function getInitials(name = "") {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  if (!pieces.length) return "OP";
  if (pieces.length === 1) return pieces[0].slice(0, 2).toUpperCase();
  return `${pieces[0][0]}${pieces[pieces.length - 1][0]}`.toUpperCase();
}

function HeartbeatIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2 17H8L11 11L15 23L19 6L23 19L26 14H30" /></svg>;
}
function DashboardIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
function ServerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></svg>;
}
function IncidentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3Z" /><path d="M12 9v5M12 17h.01" /></svg>;
}
function AlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8C6 16 3 17 3 17H21C21 17 18 16 18 8Z" /><path d="M10 21h4" /></svg>;
}
function RuleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></svg>;
}
function NotificationIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8V14L4 17H20L18 14Z" /><path d="M10 20h4" /></svg>;
}
function LogoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></svg>;
}
function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}
function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M7 7a7 7 0 0 1 11 2M17 17a7 7 0 0 1-11-2" /></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}
function CheckDoubleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 12 4 4L17 6" /><path d="m11 16 2 2 8-10" /></svg>;
}
function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
}
function ExternalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" /><path d="M19 13v6H5V5h6" /></svg>;
}
function ChevronLeftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
}
function ChevronRightIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
}
