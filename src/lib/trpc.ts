import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

export function getApiUrl() {
  // In development, use localhost
  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }
  // In production, use the API URL from env or same origin
  return import.meta.env.VITE_API_URL || "";
}

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        // Include credentials for session cookies
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
