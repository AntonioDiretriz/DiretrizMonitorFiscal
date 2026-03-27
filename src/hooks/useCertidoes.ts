import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { TablesInsert } from "@/integrations/supabase/types";

export function useCertidoes(filterStatus?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["certidoes", user?.id, filterStatus],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("certidoes")
        .select("*, empresas(razao_social, cnpj)")
        .eq("user_id", user.id)
        .order("data_validade", { ascending: true });
      if (filterStatus && filterStatus !== "all") {
        query = query.eq("status", filterStatus as any);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useCreateCertidao() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Omit<TablesInsert<"certidoes">, "user_id">) => {
      const { error } = await supabase.from("certidoes").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certidoes", user?.id] }),
  });
}

export function useDeleteCertidao() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("certidoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certidoes", user?.id] }),
  });
}
