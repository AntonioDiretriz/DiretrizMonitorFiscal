import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Certificado = Tables<"certificados">;
type CertificadoInsert = Omit<TablesInsert<"certificados">, "user_id">;
type CertificadoUpdate = TablesUpdate<"certificados"> & { id: string };

export function useCertificados() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["certificados", user?.id],
    queryFn: async () => {
      if (!user) return [] as Certificado[];
      const { data, error } = await supabase
        .from("certificados")
        .select("*")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data as Certificado[];
    },
    enabled: !!user,
  });
}

export function useCreateCertificado() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: CertificadoInsert) => {
      const { error } = await supabase.from("certificados").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificados", user?.id] }),
  });
}

export function useUpdateCertificado() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...payload }: CertificadoUpdate) => {
      const { error } = await supabase.from("certificados").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificados", user?.id] }),
  });
}

export function useDeleteCertificado() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("certificados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificados", user?.id] }),
  });
}
