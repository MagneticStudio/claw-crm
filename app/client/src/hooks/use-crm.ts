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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
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

  const createFollowup = useMutation({
    mutationFn: async (data: { contactId: number; content: string; dueDate: string }) => {
      const res = await apiRequest("POST", "/api/followups", data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }),
  });

  const completeFollowup = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/followups/${id}/complete`);
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
    createFollowup,
    completeFollowup,
  };
}
