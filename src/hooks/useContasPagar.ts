import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ContaPagarStatus = "pendente" | "aprovado" | "pago" | "vencido" | "cancelado";
export type ContaPagarOrigem = "manual" | "nfe" | "recorrente";

export interface ContaPagar {
  id: string;
  user_id: string;
  empresa_id: string | null;
  fornecedor_id: string | null;
  fornecedor: string;
  cnpj_fornecedor: string | null;
  valor: number;
  data_emissao: string | null;
  data_vencimento: string;
  data_pagamento: string | null;
  categoria: string | null;
  plano_conta_id: string | null;
  centro_custo: string | null;
  forma_pagamento: string | null;
  status: ContaPagarStatus;
  origem: ContaPagarOrigem;
  descricao: string | null;
  observacao: string | null;
  comprovante_url: string | null;
  created_at: string;
  updated_at: string;
  empresas?: { razao_social: string } | null;
}

export interface ContaPagarInsert {
  empresa_id?: string | null;
  fornecedor_id?: string | null;
  fornecedor: string;
  cnpj_fornecedor?: string | null;
  valor: number;
  data_emissao?: string | null;
  data_vencimento: string;
  categoria?: string | null;
  plano_conta_id?: string | null;
  centro_custo?: string | null;
  forma_pagamento?: string | null;
  descricao?: string | null;
  observacao?: string | null;
}

export function useContasPagar() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contas_pagar", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("contas_pagar")
        .select("*, empresas(razao_social)")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContaPagar[];
    },
    enabled: !!user,
  });
}

export function useCreateContaPagar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: ContaPagarInsert) => {
      const { error } = await supabase.from("contas_pagar").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contas_pagar", user?.id] }),
  });
}

export function useUpdateContaPagar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<ContaPagar> & { id: string }) => {
      const { error } = await supabase.from("contas_pagar").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contas_pagar", user?.id] }),
  });
}

export function useDeleteContaPagar() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contas_pagar").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contas_pagar", user?.id] }),
  });
}
