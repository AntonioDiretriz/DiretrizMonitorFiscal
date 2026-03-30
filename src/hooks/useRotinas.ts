import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RotinaEtapa = "preparar" | "revisar" | "enviar" | "concluido";
export type RotinaStatus =
  | "pendente" | "em_preparacao" | "em_revisao" | "devolvida"
  | "pronta_envio" | "concluida" | "em_risco" | "atrasada" | "nao_aplicavel";

export interface Rotina {
  id: string;
  user_id: string;
  empresa_id: string | null;
  catalogo_id: string | null;
  titulo: string;
  tipo: string;
  competencia: string | null;
  data_vencimento: string;
  data_vencimento_interno: string | null;
  responsavel_id: string | null;
  revisor_id: string | null;
  etapa: RotinaEtapa;
  status: RotinaStatus;
  valor: number | null;
  observacao: string | null;
  contas_pagar_id: string | null;
  origem: string;
  created_at: string;
  updated_at: string;
  // joins
  empresas?: { razao_social: string } | null;
  responsavel?: { nome: string; email: string } | null;
  revisor?: { nome: string; email: string } | null;
}

export interface RotinaInsert {
  empresa_id?: string | null;
  catalogo_id?: string | null;
  titulo: string;
  tipo: string;
  competencia?: string | null;
  data_vencimento: string;
  data_vencimento_interno?: string | null;
  responsavel_id?: string | null;
  revisor_id?: string | null;
  valor?: number | null;
  observacao?: string | null;
}

export interface CatalogoObrigacao {
  id: string;
  user_id: string | null;
  nome: string;
  tipo: string;
  descricao: string | null;
  esfera: string;
  regimes: string[];
  periodicidade: string;
  dia_vencimento: number | null;
  meses_offset: number | null;
  margem_seguranca: number;
  sistema: boolean;
  ativo: boolean;
}

export interface RotinaEvidencia {
  id: string;
  rotina_id: string;
  user_id: string;
  tipo: string;
  numero_protocolo: string | null;
  arquivo_url: string | null;
  observacao: string | null;
  created_at: string;
}

export interface RotinaComentario {
  id: string;
  rotina_id: string;
  user_id: string;
  mensagem: string;
  tipo: string;
  created_at: string;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useRotinas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rotinas", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("rotinas")
        .select(`
          *,
          empresas(razao_social),
          responsavel:responsavel_id(nome, email),
          revisor:revisor_id(nome, email)
        `)
        .eq("user_id", user.id)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rotina[];
    },
    enabled: !!user,
  });
}

export function useCatalogoObrigacoes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["catalogo_obrigacoes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("catalogo_obrigacoes")
        .select("*")
        .eq("ativo", true)
        .or("user_id.is.null,user_id.eq." + user.id)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CatalogoObrigacao[];
    },
    enabled: !!user,
  });
}

export function useRotinaEvidencias(rotinaId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rotinas_evidencias", rotinaId],
    queryFn: async () => {
      if (!rotinaId || !user) return [];
      const { data, error } = await supabase
        .from("rotinas_evidencias")
        .select("*")
        .eq("rotina_id", rotinaId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as RotinaEvidencia[];
    },
    enabled: !!rotinaId && !!user,
  });
}

export function useRotinaComentarios(rotinaId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rotinas_comentarios", rotinaId],
    queryFn: async () => {
      if (!rotinaId || !user) return [];
      const { data, error } = await supabase
        .from("rotinas_comentarios")
        .select("*")
        .eq("rotina_id", rotinaId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as RotinaComentario[];
    },
    enabled: !!rotinaId && !!user,
  });
}

export function useCreateRotina() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: RotinaInsert) => {
      const { error } = await supabase.from("rotinas").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rotinas"] }),
  });
}

export function useUpdateRotina() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Rotina> & { id: string }) => {
      const { error } = await supabase.from("rotinas").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rotinas"] });
    },
  });
}

export function useDeleteRotina() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rotinas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rotinas"] }),
  });
}

export function useCreateEvidencia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      rotina_id: string;
      tipo: string;
      numero_protocolo?: string;
      arquivo_url?: string;
      observacao?: string;
    }) => {
      const { error } = await supabase.from("rotinas_evidencias").insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rotinas_evidencias", variables.rotina_id] });
    },
  });
}

export function useCreateComentario() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: { rotina_id: string; mensagem: string; tipo?: string }) => {
      const { error } = await supabase.from("rotinas_comentarios").insert({
        rotina_id: payload.rotina_id,
        mensagem: payload.mensagem,
        tipo: payload.tipo ?? "comentario",
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rotinas_comentarios", variables.rotina_id] });
    },
  });
}
