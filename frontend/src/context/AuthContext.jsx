import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  authApi,
} from "../api/apiClient.js";

const AuthContext =
  createContext(null);

const SESSION_MARKER =
  "pulseops_session";

export function AuthProvider({
  children,
}) {
  const [user, setUser] =
    useState(null);

  const [
    accessToken,
    setAccessToken,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const refreshPromiseRef =
    useRef(null);

  const authVersionRef =
    useRef(0);

  const clearLocalAuth =
    useCallback(() => {
      setAccessToken(null);

      setUser(null);

      localStorage.removeItem(
        SESSION_MARKER
      );
    }, []);

  const applyAuthentication =
    useCallback(
      (authentication) => {
        if (
          !authentication?.accessToken ||
          !authentication?.user
        ) {
          throw new Error(
            "Invalid authentication response."
          );
        }

        setAccessToken(
          authentication.accessToken
        );

        setUser(
          authentication.user
        );

        localStorage.setItem(
          SESSION_MARKER,
          "1"
        );

        return authentication.accessToken;
      },
      []
    );

  const login =
    useCallback(
      async ({
        email,
        password,
      }) => {
        authVersionRef.current += 1;

        const response =
          await authApi.login({
            email,
            password,
          });

        const authentication =
          response.data;

        applyAuthentication(
          authentication
        );

        return authentication.user;
      },
      [applyAuthentication]
    );

  const refreshAccessToken =
    useCallback(async () => {
      if (
        refreshPromiseRef.current
      ) {
        return refreshPromiseRef.current;
      }

      const authVersionAtStart =
        authVersionRef.current;

      const refreshPromise =
        (async () => {
          try {
            const response =
              await authApi.refresh();

            if (
              authVersionAtStart !==
              authVersionRef.current
            ) {
              const error =
                new Error(
                  "Authentication state changed."
                );

              error.status = 401;

              throw error;
            }

            const authentication =
              response.data;

            return applyAuthentication(
              authentication
            );
          } catch (error) {
            if (
              authVersionAtStart ===
              authVersionRef.current
            ) {
              clearLocalAuth();
            }

            throw error;
          } finally {
            if (
              refreshPromiseRef.current ===
              refreshPromise
            ) {
              refreshPromiseRef.current =
                null;
            }
          }
        })();

      refreshPromiseRef.current =
        refreshPromise;

      return refreshPromise;
    }, [
      applyAuthentication,
      clearLocalAuth,
    ]);

  const logout =
    useCallback(async () => {
      authVersionRef.current += 1;

      refreshPromiseRef.current =
        null;

      try {
        await authApi.logout();
      } catch {
        // Ignore logout API failure.
      } finally {
        clearLocalAuth();
      }
    }, [clearLocalAuth]);

  const restoreSession =
    useCallback(async () => {
      const hasSession =
        localStorage.getItem(
          SESSION_MARKER
        );

      if (!hasSession) {
        setLoading(false);

        return;
      }

      try {
        await refreshAccessToken();
      } catch {
        // Invalid session already cleared.
      } finally {
        setLoading(false);
      }
    }, [refreshAccessToken]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const value =
    useMemo(
      () => ({
        user,

        accessToken,

        loading,

        isAuthenticated:
          Boolean(
            user &&
            accessToken
          ),

        login,

        logout,

        refreshAccessToken,
      }),
      [
        user,
        accessToken,
        loading,
        login,
        logout,
        refreshAccessToken,
      ]
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}