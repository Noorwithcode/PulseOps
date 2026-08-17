import {
  request,
} from "./apiClient.js";

export const dashboardApi = {
  getOverview: (
    token,
    {
      recentIncidentLimit = 5,
      serverHealthLimit = 5,
    } = {}
  ) => {
    const params =
      new URLSearchParams({
        recentIncidentLimit:
          String(
            recentIncidentLimit
          ),

        serverHealthLimit:
          String(
            serverHealthLimit
          ),
      });

    return request(
      `/dashboard/overview?${params.toString()}`,
      {
        token,
      }
    );
  },
};