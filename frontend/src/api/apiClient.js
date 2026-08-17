const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "/api"
    : `http://${window.location.hostname}:5000/api`);

const request = async (
  endpoint,
  {
    method = "GET",
    body,
    token,
    headers = {},
  } = {}
) => {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      method,

      credentials: "include",

      headers: {
        "Content-Type":
          "application/json",

        ...(token
          ? {
              Authorization:
                `Bearer ${token}`,
            }
          : {}),

        ...headers,
      },

      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        "Request failed."
    );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
};

export const authApi = {
  login: (credentials) =>
    request(
      "/auth/login",
      {
        method: "POST",
        body: credentials,
      }
    ),

  refresh: () =>
    request(
      "/auth/refresh",
      {
        method: "POST",
      }
    ),

  logout: () =>
    request(
      "/auth/logout",
      {
        method: "POST",
      }
    ),

  me: (token) =>
    request(
      "/auth/me",
      {
        token,
      }
    ),
};

export {
  API_BASE_URL,
  request,
};
