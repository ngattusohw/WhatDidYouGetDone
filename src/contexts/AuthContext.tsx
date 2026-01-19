import { createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";

interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

interface Session {
  user: User;
  expires: Date;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: sessionData, isPending } = useSession();
  const navigate = useNavigate();

  const session = sessionData?.session
    ? {
        user: sessionData.user,
        expires: new Date(sessionData.session.expiresAt),
      }
    : null;

  const user = sessionData?.user ?? null;

  const signOut = async () => {
    await authSignOut();
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ session, user, signOut, isLoading: isPending }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
