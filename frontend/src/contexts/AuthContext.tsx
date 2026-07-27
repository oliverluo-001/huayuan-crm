import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getAuthStatus, login as apiLogin, logout as apiLogout, setup as apiSetup } from "@/api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  isInitialized: boolean;
  needsSetup: boolean;
  username: string;
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const status = await getAuthStatus();
        setIsInitialized(status.initialized);
        setIsAuthenticated(status.authenticated);
        setUsername(status.username);
      } catch {
        setIsAuthenticated(false);
        setUsername("");
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
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUsername("");
  }, []);

  const setup = useCallback(async (user: string, password: string) => {
    const result = await apiSetup(user, password);
    setIsInitialized(true);
    setIsAuthenticated(true);
    setUsername(result.username);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isInitialized,
        needsSetup: !isInitialized,
        username,
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