import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getAuthStatus, login as apiLogin, logout as apiLogout, setup as apiSetup } from "@/api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  isInitialized: boolean;
  needsSetup: boolean;
  username: string;
  displayName: string;
  userId: string;
  role: string;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const status = await getAuthStatus();
        setIsInitialized(status.initialized);
        setIsAuthenticated(status.authenticated);
        setUsername(status.username);
        setDisplayName(status.displayName || "");
        setUserId(status.userId || "");
        setRole(status.role || "");
      } catch {
        setIsAuthenticated(false);
        setUsername("");
        setDisplayName("");
        setUserId("");
        setRole("");
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const result = await apiLogin(user, password);
    setIsAuthenticated(true);
    setUsername(result.username);
    setDisplayName(result.displayName || "");
    setUserId(result.userId || "");
    setRole(result.role || "");
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUsername("");
    setDisplayName("");
    setUserId("");
    setRole("");
  }, []);

  const setup = useCallback(async (user: string, password: string) => {
    const result = await apiSetup(user, password);
    setIsInitialized(true);
    setIsAuthenticated(true);
    setUsername(result.username);
    setDisplayName(result.displayName || "");
    setUserId(result.userId || "");
    setRole(result.role || "");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isInitialized,
        needsSetup: !isInitialized,
        username,
        displayName,
        userId,
        role,
        isLoading,
        login,
        logout,
        setup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}