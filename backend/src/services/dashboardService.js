import pool from "../config/db.js";

import {
  findAlertSummary,
  findEnabledRuleSummary,
  findIncidentSeverityDistribution,
  findIncidentSummary,
  findIncidentTypeDistribution,
  findLatestServerHealth,
  findRecentIncidents,
  findServerSummary,
} from "../repositories/dashboardRepository.js";

const toNumber = (value) =>
  Number(value || 0);

const normalizeServerSummary = (
  summary = {}
) => ({
  totalServers:
    toNumber(summary.totalServers),

  onlineServers:
    toNumber(summary.onlineServers),

  degradedServers:
    toNumber(summary.degradedServers),

  offlineServers:
    toNumber(summary.offlineServers),

  unknownServers:
    toNumber(summary.unknownServers),
});

const normalizeIncidentSummary = (
  summary = {}
) => ({
  totalIncidents:
    toNumber(summary.totalIncidents),

  openIncidents:
    toNumber(summary.openIncidents),

  acknowledgedIncidents:
    toNumber(
      summary.acknowledgedIncidents
    ),

  resolvedIncidents:
    toNumber(summary.resolvedIncidents),

  closedIncidents:
    toNumber(summary.closedIncidents),

  activeIncidents:
    toNumber(summary.activeIncidents),

  activeCriticalIncidents:
    toNumber(
      summary.activeCriticalIncidents
    ),

  activeHighIncidents:
    toNumber(
      summary.activeHighIncidents
    ),
});

const normalizeAlertSummary = (
  summary = {}
) => ({
  totalStates:
    toNumber(summary.totalStates),

  normalStates:
    toNumber(summary.normalStates),

  breachingStates:
    toNumber(summary.breachingStates),

  alertingStates:
    toNumber(summary.alertingStates),

  recoveringStates:
    toNumber(summary.recoveringStates),

  activeAlerts:
    toNumber(summary.activeAlerts),
});

const normalizeRuleSummary = (
  summary = {}
) => ({
  totalRules:
    toNumber(summary.totalRules),

  enabledRules:
    toNumber(summary.enabledRules),

  disabledRules:
    toNumber(summary.disabledRules),
});

const normalizeDistribution = (
  rows,
  key
) =>
  rows.map((row) => ({
    [key]: row[key],
    count: toNumber(row.count),
  }));

export const getDashboardOverview =
  async ({
    recentIncidentLimit = 10,
    serverHealthLimit = 10,
  } = {}) => {
    const connection =
      await pool.getConnection();

    try {
      /*
       * Dashboard is read-only.
       * A transaction is not required because
       * no shared state is modified here.
       */
      const [
        serverSummary,
        incidentSummary,
        alertSummary,
        ruleSummary,
        recentIncidents,
        latestServerHealth,
        severityDistribution,
        typeDistribution,
      ] = await Promise.all([
        findServerSummary(connection),

        findIncidentSummary(connection),

        findAlertSummary(connection),

        findEnabledRuleSummary(
          connection
        ),

        findRecentIncidents(
          connection,
          recentIncidentLimit
        ),

        findLatestServerHealth(
          connection,
          serverHealthLimit
        ),

        findIncidentSeverityDistribution(
          connection
        ),

        findIncidentTypeDistribution(
          connection
        ),
      ]);

      const normalizedServers =
        normalizeServerSummary(
          serverSummary
        );

      const normalizedIncidents =
        normalizeIncidentSummary(
          incidentSummary
        );

      const normalizedAlerts =
        normalizeAlertSummary(
          alertSummary
        );

      const normalizedRules =
        normalizeRuleSummary(
          ruleSummary
        );

      return {
        generatedAt:
          new Date().toISOString(),

        summary: {
          servers: normalizedServers,
          incidents:
            normalizedIncidents,
          alerts: normalizedAlerts,
          rules: normalizedRules,
        },

        attentionRequired: {
          offlineServers:
            normalizedServers
              .offlineServers,

          degradedServers:
            normalizedServers
              .degradedServers,

          activeIncidents:
            normalizedIncidents
              .activeIncidents,

          criticalIncidents:
            normalizedIncidents
              .activeCriticalIncidents,

          highIncidents:
            normalizedIncidents
              .activeHighIncidents,

          activeAlerts:
            normalizedAlerts
              .activeAlerts,

          breachingAlerts:
            normalizedAlerts
              .breachingStates,
        },

        distributions: {
          incidentSeverity:
            normalizeDistribution(
              severityDistribution,
              "severity"
            ),

          incidentType:
            normalizeDistribution(
              typeDistribution,
              "incidentType"
            ),
        },

        recentIncidents,
        latestServerHealth,
      };
    } finally {
      connection.release();
    }
  };