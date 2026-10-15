import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type User = components["schemas"]["UserOut"];
export type Credentials = components["schemas"]["LoginIn"];
export type PasswordChange = components["schemas"]["PasswordChangeIn"];

/** Raised when the server rejects a sign-in attempt; `message` is safe to show the user. */
export class LoginError extends Error {
  override name = "LoginError";
}

/** Raised when the server refuses a password change; `message` is safe to show the user. */
export class PasswordChangeError extends Error {
  override name = "PasswordChangeError";
}

const RATE_LIMITED = 429;

/** The signed-in user, or `null`. Also makes Django set the CSRF cookie. */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<User | null> => {
    const { data, response } = await api.GET("/api/v1/auth/session");
    if (!response.ok) {
      throw new Error("Could not load your session.");
    }
    return data?.user ?? null;
  },
  staleTime: 5 * 60 * 1000,
});

/**
 * The signed-in user for route guards. Uses the cached session when there is one; signing in
 * and out update that cache directly.
 */
export function getSession(queryClient: QueryClient): Promise<User | null> {
  return queryClient.query({ ...sessionQuery, staleTime: "static" });
}

/** Sign in, then cache the user so protected pages render without another request. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: Credentials): Promise<User> => {
      const { data, error, response } = await api.POST("/api/v1/auth/login", {
        body: credentials,
      });
      if (response.status === RATE_LIMITED) {
        throw new LoginError("Too many attempts. Wait a minute and try again.");
      }
      if (error) {
        throw new LoginError("detail" in error ? error.detail : "Something went wrong. Try again.");
      }
      return data;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQuery.queryKey, user);
    },
  });
}

/** Sign out and drop every cached query, since all of it belonged to this user. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/api/v1/auth/logout");
    },
    onSettled: () => {
      queryClient.clear();
    },
  });
}

/** Change the signed-in user's password. The server keeps this session and ends all others. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (passwords: PasswordChange): Promise<void> => {
      const { error, response } = await api.POST("/api/v1/auth/password", { body: passwords });
      if (response.status === RATE_LIMITED) {
        throw new PasswordChangeError("Too many attempts. Wait a minute and try again.");
      }
      if (error) {
        throw new PasswordChangeError(
          "detail" in error ? error.detail : "Something went wrong. Try again.",
        );
      }
    },
  });
}
