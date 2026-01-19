import { createAuthClient } from "better-auth/react";
import { getApiUrl } from "./trpc";

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
});

// Export commonly used hooks and utilities
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

// Social auth helper
export async function signInWithGitHub() {
  return signIn.social({
    provider: "github",
    callbackURL: `${window.location.origin}/app/dashboard`,
  });
}
