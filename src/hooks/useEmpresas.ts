import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Empresa = Tables<"empresas">;
type EmpresaInsert = TablesInsert<"empresas">;
type EmpresaUpdate = TablesUpdate<"empresas">;

export function useEmpresas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["empresas", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .eq("user_id", user.id)
        .order("razao_social");
      if (error) throw error;
      return data as Empresa[];
    },
    enabled: !!user,
  });
}

export function useCreateEmpresa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Omit<EmpresaInsert, "user_id">) => {
      const { error } = await supabase.from("empresas").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empresas", user?.id] }),
  });
}

export function useUpdateEmpresa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...payload }: EmpresaUpdate & { id: string }) => {
      const { error } = await supabase.from("empresas").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empresas", user?.id] }),
  });
}

export function useDeleteEmpresa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empresas", user?.id] }),
  });
}
