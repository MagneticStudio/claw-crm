import type { QueryFunction } from "@tanstack/react-query";
import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

/** apiRequest throws `Error("<status>: <body>")` — pull a human message out of the body. */
function parseApiError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong";
  const match = err.message.match(/^\d{3}:\s*(.*)$/s);
  const body = match ? match[1] : err.message;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return body.slice(0, 200) || "Something went wrong";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: unknown | undefined): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  // Global failure surface (#85): optimistic updates roll back silently, so a
  // failed write was previously invisible — fatal for trust when agents and
  // humans share the same data. Per-mutation onError handlers still run for
  // rollback; this only owns the user-facing message.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // Mutations with their own inline error surface (login, setup) opt out.
      if (mutation.meta?.suppressErrorToast) return;
      toast({
        variant: "destructive",
        title: "Couldn't save",
        description: parseApiError(error),
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
