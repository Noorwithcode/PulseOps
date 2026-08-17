import assert from "node:assert/strict";
import test from "node:test";

import {
  insertHealthCheck,
} from "../src/repositories/heartbeatRepository.js";

test(
  "insertHealthCheck persists received_at in UTC",
  async () => {
    const expectedValues = [
      1,
      "heartbeat-test-1",
      "HEARTBEAT",
      "OFFLINE",
      "2026-08-05 13:00:00.000",
      0,
      null,
      null,
      null,
      null,
      "CONNECTION_TIMEOUT",
      "No response.",
    ];

    const connection = {
      execute: async (sql, values) => {
        assert.match(sql, /received_at/i);
        assert.match(
          sql,
          /UTC_TIMESTAMP\(3\)/
        );
        assert.deepEqual(
          values,
          expectedValues
        );

        return [{ insertId: 41 }];
      },
    };

    const id = await insertHealthCheck(
      connection,
      {
        serverId: expectedValues[0],
        checkKey: expectedValues[1],
        checkType: expectedValues[2],
        status: expectedValues[3],
        reportedAt: expectedValues[4],
        responseTimeMs: expectedValues[5],
        cpuUsagePercent: expectedValues[6],
        memoryUsagePercent: expectedValues[7],
        diskUsagePercent: expectedValues[8],
        uptimeSeconds: expectedValues[9],
        errorCode: expectedValues[10],
        message: expectedValues[11],
      }
    );

    assert.equal(id, 41);
  }
);
