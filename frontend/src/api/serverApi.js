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

export const serverApi = {
  list: (
    token,
    {
      page = 1,
      limit = 10,
      environment,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = {}
  ) =>
    request(
      `/servers${buildQueryString({
        page,
        limit,
        environment,
        status,
        search,
        sortBy,
        sortOrder,
      })}`,
      {
        token,
      }
    ),

  getById: (
    token,
    serverId
  ) =>
    request(
      `/servers/${serverId}`,
      {
        token,
      }
    ),

  create: (
    token,
    input
  ) =>
    request(
      "/servers",
      {
        method: "POST",
        token,
        body: input,
      }
    ),

  update: (
    token,
    serverId,
    input
  ) =>
    request(
      `/servers/${serverId}`,
      {
        method: "PATCH",
        token,
        body: input,
      }
    ),

  updateStatus: (
    token,
    serverId,
    {
      status,
      version,
    }
  ) =>
    request(
      `/servers/${serverId}/status`,
      {
        method: "PATCH",
        token,
        body: {
          status,
          version,
        },
      }
    ),

  remove: (
    token,
    serverId,
    version
  ) =>
    request(
      `/servers/${serverId}`,
      {
        method: "DELETE",
        token,
        body: {
          version,
        },
      }
    ),

  restore: (
    token,
    serverId,
    version
  ) =>
    request(
      `/servers/${serverId}/restore`,
      {
        method: "PATCH",
        token,
        body: {
          version,
        },
      }
    ),
};