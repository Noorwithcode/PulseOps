import {
  request,
} from "./apiClient.js";

const buildQueryString = (
  params = {}
) => {
  const searchParams =
    new URLSearchParams();

  Object.entries(params)
    .forEach(
      ([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          value === ""
        ) {
          return;
        }

        searchParams.set(
          key,
          String(value)
        );
      }
    );

  const query =
    searchParams.toString();

  return query
    ? `?${query}`
    : "";
};

/*
 * Manual incident creation requires an
 * Idempotency-Key header.
 *
 * Generate the key ONCE per user submission
 * and reuse the same key if that exact
 * submission is retried.
 */
export const createIncidentIdempotencyKey =
  () => {
    const uuid =
      globalThis.crypto
        ?.randomUUID?.();

    if (uuid) {
      return `incident:${uuid}`;
    }

    /*
     * Browser fallback.
     * Allowed characters:
     * letters, numbers, dot, underscore,
     * colon and hyphen.
     */
    return [
      "incident",
      Date.now(),
      Math.random()
        .toString(36)
        .slice(2),
    ].join(":");
  };

export const incidentApi = {
  list: (
    token,
    {
      page = 1,
      limit = 20,
      status,
      severity,
      source,
      incidentType,
      serverId,
      assignedTo,
      activeOnly,
      unassignedOnly,
      search,
    } = {}
  ) =>
    request(
      `/incidents${buildQueryString({
        page,
        limit,
        status,
        severity,
        source,
        incidentType,
        serverId,
        assignedTo,
        activeOnly,
        unassignedOnly,
        search,
      })}`,
      {
        token,
      }
    ),

  getById: (
    token,
    incidentId
  ) =>
    request(
      `/incidents/${incidentId}`,
      {
        token,
      }
    ),

  getTimeline: (
    token,
    incidentId
  ) =>
    request(
      `/incidents/${incidentId}/timeline`,
      {
        token,
      }
    ),

  create: (
    token,
    input,
    idempotencyKey
  ) =>
    request(
      "/incidents",
      {
        method: "POST",
        token,
        headers: {
          "Idempotency-Key":
            idempotencyKey,
        },
        body: {
          serverId:
            input.serverId,

          incidentType:
            input.incidentType ??
            "MANUAL",

          title:
            input.title,

          description:
            input.description ??
            null,

          severity:
            input.severity ??
            "MEDIUM",

          assignedTo:
            input.assignedTo ??
            null,
        },
      }
    ),

  acknowledge: (
    token,
    incidentId,
    version
  ) =>
    request(
      `/incidents/${incidentId}/acknowledge`,
      {
        method: "PATCH",
        token,
        body: {
          version,
        },
      }
    ),

  assign: (
    token,
    incidentId,
    {
      assignedTo,
      version,
    }
  ) =>
    request(
      `/incidents/${incidentId}/assign`,
      {
        method: "PATCH",
        token,
        body: {
          assignedTo,
          version,
        },
      }
    ),

  unassign: (
    token,
    incidentId,
    version
  ) =>
    request(
      `/incidents/${incidentId}/unassign`,
      {
        method: "PATCH",
        token,
        body: {
          version,
        },
      }
    ),

  changeSeverity: (
    token,
    incidentId,
    {
      severity,
      version,
    }
  ) =>
    request(
      `/incidents/${incidentId}/severity`,
      {
        method: "PATCH",
        token,
        body: {
          severity,
          version,
        },
      }
    ),

  resolve: (
    token,
    incidentId,
    {
      resolutionNotes,
      version,
    }
  ) =>
    request(
      `/incidents/${incidentId}/resolve`,
      {
        method: "PATCH",
        token,
        body: {
          resolutionNotes,
          version,
        },
      }
    ),

  close: (
    token,
    incidentId,
    version
  ) =>
    request(
      `/incidents/${incidentId}/close`,
      {
        method: "PATCH",
        token,
        body: {
          version,
        },
      }
    ),

  reopen: (
    token,
    incidentId,
    {
      reason,
      version,
    }
  ) =>
    request(
      `/incidents/${incidentId}/reopen`,
      {
        method: "PATCH",
        token,
        body: {
          reason,
          version,
        },
      }
    ),

  addComment: (
    token,
    incidentId,
    {
      comment,
      version,
    }
  ) =>
    request(
      `/incidents/${incidentId}/comments`,
      {
        method: "POST",
        token,
        body: {
          comment,
          version,
        },
      }
    ),
};