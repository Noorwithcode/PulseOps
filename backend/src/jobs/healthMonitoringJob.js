import cron from "node-cron";

import {
  runMissedHeartbeatSweep,
} from "../services/missedHeartbeatService.js";

const DEFAULT_CRON_EXPRESSION =
  "*/30 * * * * *";

let monitoringTask = null;
let activeSweepPromise = null;

const readBoolean = (value, fallback) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
};

const executeSweep = () => {
  if (activeSweepPromise) {
    return activeSweepPromise;
  }

  activeSweepPromise = (async () => {
    try {
      const summary =
        await runMissedHeartbeatSweep();

      if (
        summary.markedOffline > 0 ||
        summary.failed > 0
      ) {
        console.log(
          [
            "[Health Monitor]",
            `scanned=${summary.scanned}`,
            `offline=${summary.markedOffline}`,
            `skipped=${summary.skipped}`,
            `failed=${summary.failed}`,
          ].join(" ")
        );
      }

      return summary;
    } catch (error) {
      console.error(
        "[Health Monitor] Sweep failed:",
        error.message
      );

      throw error;
    }
  })().finally(() => {
    activeSweepPromise = null;
  });

  return activeSweepPromise;
};

export const startHealthMonitoringJob = () => {
  const enabled = readBoolean(
    process.env.HEALTH_MONITOR_ENABLED,
    true
  );

  if (!enabled) {
    console.log(
      "Health monitoring scheduler is disabled."
    );

    return null;
  }

  if (monitoringTask) {
    return monitoringTask;
  }

  const configuredExpression = String(
    process.env.HEALTH_MONITOR_CRON ||
      DEFAULT_CRON_EXPRESSION
  ).trim();

  const cronExpression = cron.validate(
    configuredExpression
  )
    ? configuredExpression
    : DEFAULT_CRON_EXPRESSION;

  monitoringTask = cron.schedule(
    cronExpression,
    executeSweep,
    {
      name: "pulseops-health-monitor",
      timezone: "UTC",
      noOverlap: true,
    }
  );

  console.log(
    `Health monitoring scheduler started: ${cronExpression}`
  );

  const runOnStartup = readBoolean(
    process.env.HEALTH_MONITOR_RUN_ON_START,
    true
  );

  if (runOnStartup) {
    void executeSweep();
  }

  return monitoringTask;
};

export const stopHealthMonitoringJob =
  async () => {
    if (monitoringTask) {
      monitoringTask.stop();
    }

    if (activeSweepPromise) {
      try {
        await activeSweepPromise;
      } catch {
        // Error was already logged.
      }
    }

    if (monitoringTask) {
      monitoringTask.destroy();
      monitoringTask = null;
    }

    console.log(
      "Health monitoring scheduler stopped."
    );
  };

export const runHealthMonitoringJobNow =
  async () => executeSweep();