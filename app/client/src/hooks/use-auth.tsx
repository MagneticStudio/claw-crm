import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";

type AuthUser = { id: number; authenticated: boolean; needsSetup?: boolean };

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  needsSetup: boolean;
  loginMutation: UseMutationResult<AuthUser, Error, { pin: string }>;
  setupMutation: UseMutationResult<{ id: number; apiKey: string }, Error, { pin: string }>;
  logoutMutation: UseMutationResult<void, Error, void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    data: user,
    isLoading,
  } = useQuery<AuthUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await fetch("/api/user", { credentials: "include" });
      if (res.status === 401) {
        const body = await res.json();
        if (body.needsSetup) return { id: 0, authenticated: false, needsSetup: true } as AuthUser;
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    },
  });

  const needsSetup = !!(user && !user.authenticated && user.needsSetup);

  const loginMutation = useMutation<AuthUser, Error, { pin: string }>({
    mutationFn: async ({ pin }) => {
      const res = await apiRequest("POST", "/api/login", { pin });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], { ...data, authenticated: true });
    },
  });

  const setupMutation = useMutation<{ id: number; apiKey: string }, Error, { pin: string }>({
    mutationFn: async ({ pin }) => {
      const res = await apiRequest("POST", "/api/setup", { pin });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], { id: data.id, authenticated: true });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.invalidateQueries();
    },
  });

  return (
    <AuthContext.Provider value={{ user: user?.authenticated ? user : null, isLoading, needsSetup, loginMutation, setupMutation, logoutMutation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
