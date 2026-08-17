import "dotenv/config";

const port = Number(process.env.PORT) || 5000;
const baseUrl =
  process.env.API_BASE_URL ||
  `http://localhost:${port}`;

const serverId = Number(
  process.env.INCIDENT_TEST_SERVER_ID || 1
);

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

const fail = (message, details = null) => {
  const error = new Error(message);
  error.details = details;
  throw error;
};

if (
  !Number.isSafeInteger(serverId) ||
  serverId < 1
) {
  fail(
    "INCIDENT_TEST_SERVER_ID must be a positive integer."
  );
}

if (!email || !password) {
  fail(
    "ADMIN_EMAIL and ADMIN_PASSWORD are required in .env."
  );
}

const requestJson = async (
  path,
  {
    method = "GET",
    token = null,
    body = null,
  } = {}
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    fail(
      `${method} ${path} returned non-JSON data.`,
      { status: response.status, text }
    );
  }

  if (!response.ok) {
    fail(
      payload?.message ||
        `${method} ${path} failed.`,
      { status: response.status, payload }
    );
  }

  return payload;
};

const login = async () => {
  const payload = await requestJson(
    "/api/auth/login",
    {
      method: "POST",
      body: { email, password },
    }
  );

  const accessToken =
    payload?.data?.accessToken;

  if (!accessToken) {
    fail(
      "Login succeeded but no access token was returned.",
      payload
    );
  }

  return accessToken;
};

const sendHeartbeat = async (
  token,
  {
    checkKey,
    status,
    reportedAt,
  }
) => {
  const offline = status === "OFFLINE";

  return requestJson(
    `/api/servers/${serverId}/heartbeat`,
    {
      method: "POST",
      token,
      body: {
        checkKey,
        checkType: "HEARTBEAT",
        status,
        reportedAt,
        responseTimeMs: offline ? 0 : 40,
        errorCode: offline
          ? "CONNECTION_TIMEOUT"
          : null,
        message: offline
          ? "Automatic incident end-to-end test."
          : "Automatic incident recovery test.",
      },
    }
  );
};

const expectFreshAction = (
  label,
  payload,
  expectedActions
) => {
  const data = payload?.data;
  const action =
    data?.automaticIncident?.action;

  if (data?.stateChanged !== true) {
    fail(
      `${label} did not update monitoring state.`,
      payload
    );
  }

  if (!expectedActions.includes(action)) {
    fail(
      `${label} returned ${action || "no action"}; expected ${expectedActions.join(
        " or "
      )}.`,
      payload
    );
  }

  console.log(`${label}: ${action}`);
};

const run = async () => {
  const token = await login();
  const prefix = `incident-e2e-${Date.now()}`;
  const baseTime = Date.now();

  const steps = [
    {
      label: "Baseline ONLINE",
      checkKey: `${prefix}-baseline`,
      status: "ONLINE",
      reportedAt: new Date(baseTime).toISOString(),
      expectedActions: [
        "NO_ACTIVE_INCIDENT",
        "RESOLVED",
      ],
    },
    {
      label: "First OFFLINE",
      checkKey: `${prefix}-offline-1`,
      status: "OFFLINE",
      reportedAt: new Date(
        baseTime + 1000
      ).toISOString(),
      expectedActions: ["CREATED"],
    },
    {
      label: "Repeated OFFLINE",
      checkKey: `${prefix}-offline-2`,
      status: "OFFLINE",
      reportedAt: new Date(
        baseTime + 2000
      ).toISOString(),
      expectedActions: [
        "OCCURRENCE_RECORDED",
      ],
    },
    {
      label: "Recovery ONLINE",
      checkKey: `${prefix}-recovery`,
      status: "ONLINE",
      reportedAt: new Date(
        baseTime + 3000
      ).toISOString(),
      expectedActions: ["RESOLVED"],
    },
  ];

  for (const step of steps) {
    const payload = await sendHeartbeat(
      token,
      step
    );

    expectFreshAction(
      step.label,
      payload,
      step.expectedActions
    );
  }

  console.log(
    "Automatic incident flow passed: CREATED -> OCCURRENCE_RECORDED -> RESOLVED"
  );
};

run().catch((error) => {
  console.error(`Test failed: ${error.message}`);

  if (error.details) {
    console.error(
      JSON.stringify(error.details, null, 2)
    );
  }

  process.exitCode = 1;
});
