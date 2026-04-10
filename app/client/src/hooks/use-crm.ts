import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ContactWithRelations } from "@shared/schema";

export function useCrm() {
  const contactsQuery = useQuery<ContactWithRelations[]>({
    queryKey: ["/api/contacts"],
    staleTime: 30_000,
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Record<string, unknown>) => {
      const res = await apiRequest("PUT", `/api/contacts/${id}`, data);
      return res.json();
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/contacts"] });
      const previous = queryClient.getQueryData<ContactWithRelations[]>(["/api/contacts"]);
      if (previous) {
        queryClient.setQueryData<ContactWithRelations[]>(
          ["/api/contacts"],
          previous.map((c) => (c.id === id ? { ...c, ...data } as ContactWithRelations : c)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/contacts"], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const createContact = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/contacts", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const addInteraction = useMutation({
    mutationFn: async (data: { contactId: number; content: string; date: string; type?: string }) => {
      const res = await apiRequest("POST", "/api/interactions", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const updateInteraction = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; content?: string; type?: string }) => {
      const res = await apiRequest("PUT", `/api/interactions/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const deleteInteraction = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/interactions/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const createFollowup = useMutation({
    mutationFn: async (data: { contactId: number; content: string; dueDate: string; type?: string; time?: string; location?: string }) => {
      const res = await apiRequest("POST", "/api/followups", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const updateFollowup = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; content?: string; dueDate?: string }) => {
      const res = await apiRequest("PUT", `/api/followups/${id}`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const deleteFollowup = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/followups/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const completeFollowup = useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome?: string }) => {
      const res = await apiRequest("POST", `/api/followups/${id}/complete`,
        outcome ? { outcome } : undefined);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  return {
    contacts: contactsQuery.data ?? [],
    isLoading: contactsQuery.isLoading,
    error: contactsQuery.error,
    updateContact,
    createContact,
    deleteContact,
    addInteraction,
    updateInteraction,
    deleteInteraction,
    createFollowup,
    updateFollowup,
    deleteFollowup,
    completeFollowup,
  };
}
