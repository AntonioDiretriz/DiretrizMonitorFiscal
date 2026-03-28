export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          acao_recomendada: string | null
          certidao_id: string | null
          created_at: string
          empresa_id: string | null
          id: string
          lida: boolean
          mensagem: string
          nivel: Database["public"]["Enums"]["alerta_nivel"]
          resolvida: boolean
          titulo: string
          user_id: string
        }
        Insert: {
          acao_recomendada?: string | null
          certidao_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          nivel?: Database["public"]["Enums"]["alerta_nivel"]
          resolvida?: boolean
          titulo: string
          user_id: string
        }
        Update: {
          acao_recomendada?: string | null
          certidao_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          nivel?: Database["public"]["Enums"]["alerta_nivel"]
          resolvida?: boolean
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_certidao_id_fkey"
            columns: ["certidao_id"]
            isOneToOne: false
            referencedRelation: "certidoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas_postais: {
        Row: {
          cnpj: string
          contrato_status: "ativo" | "rescindido"
          gratuidade: boolean
          created_at: string
          data_inicio: string
          data_rescisao: string | null
          data_vencimento: string
          email_responsavel: string | null
          empresa: string
          empresa_id: string | null
          id: string
          nome_responsavel: string
          numero: number
          telefone: string | null
          updated_at: string
          user_id: string
          valor_atual: number | null
        }
        Insert: {
          cnpj: string
          contrato_status?: "ativo" | "rescindido"
          created_at?: string
          data_inicio: string
          gratuidade?: boolean
          data_rescisao?: string | null
          data_vencimento: string
          email_responsavel?: string | null
          empresa: string
          empresa_id?: string | null
          id?: string
          nome_responsavel: string
          numero: number
          telefone?: string | null
          updated_at?: string
          user_id: string
          valor_atual?: number | null
        }
        Update: {
          cnpj?: string
          contrato_status?: "ativo" | "rescindido"
          created_at?: string
          data_inicio?: string
          gratuidade?: boolean
          data_rescisao?: string | null
          data_vencimento?: string
          email_responsavel?: string | null
          empresa?: string
          empresa_id?: string | null
          id?: string
          nome_responsavel?: string
          numero?: number
          telefone?: string | null
          updated_at?: string
          user_id?: string
          valor_atual?: number | null
        }
        Relationships: []
      }
      caixas_postais_historico: {
        Row: {
          caixa_postal_id: string
          created_at: string
          data_renovacao: string
          id: string
          observacao: string | null
          user_id: string
          valor_pago: number | null
        }
        Insert: {
          caixa_postal_id: string
          created_at?: string
          data_renovacao: string
          id?: string
          observacao?: string | null
          user_id: string
          valor_pago?: number | null
        }
        Update: {
          caixa_postal_id?: string
          created_at?: string
          data_renovacao?: string
          id?: string
          observacao?: string | null
          user_id?: string
          valor_pago?: number | null
        }
        Relationships: []
      }
      certificados: {
        Row: {
          created_at: string
          data_vencimento: string
          email_cliente: string | null
          empresa: string
          empresa_id: string | null
          id: string
          tipo: "A1" | "A3"
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_vencimento: string
          email_cliente?: string | null
          empresa: string
          empresa_id?: string | null
          id?: string
          tipo: "A1" | "A3"
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_vencimento?: string
          email_cliente?: string | null
          empresa?: string
          empresa_id?: string | null
          id?: string
          tipo?: "A1" | "A3"
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      certidoes_historico: {
        Row: {
          alterado_em: string
          certidao_id: string
          id: string
          observacao: string | null
          status_anterior: Database["public"]["Enums"]["certidao_status"] | null
          status_novo: Database["public"]["Enums"]["certidao_status"]
          user_id: string
        }
        Insert: {
          alterado_em?: string
          certidao_id: string
          id?: string
          observacao?: string | null
          status_anterior?: Database["public"]["Enums"]["certidao_status"] | null
          status_novo: Database["public"]["Enums"]["certidao_status"]
          user_id: string
        }
        Update: {
          alterado_em?: string
          certidao_id?: string
          id?: string
          observacao?: string | null
          status_anterior?: Database["public"]["Enums"]["certidao_status"] | null
          status_novo?: Database["public"]["Enums"]["certidao_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certidoes_historico_certidao_id_fkey"
            columns: ["certidao_id"]
            isOneToOne: false
            referencedRelation: "certidoes"
            referencedColumns: ["id"]
          },
        ]
      }
      certidoes: {
        Row: {
          auto_consultar: boolean
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          empresa_id: string
          id: string
          observacao: string | null
          status: Database["public"]["Enums"]["certidao_status"]
          tipo: Database["public"]["Enums"]["certidao_tipo"]
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_consultar?: boolean
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          empresa_id: string
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["certidao_status"]
          tipo: Database["public"]["Enums"]["certidao_tipo"]
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_consultar?: boolean
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          empresa_id?: string
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["certidao_status"]
          tipo?: Database["public"]["Enums"]["certidao_tipo"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certidoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativa: boolean
          cnpj: string
          created_at: string
          email_responsavel: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          municipio: string | null
          razao_social: string
          regime_tributario: string | null
          responsavel: string | null
          uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cnpj: string
          created_at?: string
          email_responsavel?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          municipio?: string | null
          razao_social: string
          regime_tributario?: string | null
          responsavel?: string | null
          uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          cnpj?: string
          created_at?: string
          email_responsavel?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          municipio?: string | null
          razao_social?: string
          regime_tributario?: string | null
          responsavel?: string | null
          uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome_escritorio: string | null
          responsavel: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome_escritorio?: string | null
          responsavel?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome_escritorio?: string | null
          responsavel?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usuarios_perfil: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          escritorio_owner_id: string
          id: string
          is_admin: boolean
          nome: string
          pode_editar: boolean
          pode_excluir: boolean
          pode_incluir: boolean
          user_id: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          escritorio_owner_id: string
          id?: string
          is_admin?: boolean
          nome: string
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_incluir?: boolean
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          escritorio_owner_id?: string
          id?: string
          is_admin?: boolean
          nome?: string
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_incluir?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alerta_nivel: "critico" | "aviso" | "info"
      certidao_status: "regular" | "vencendo" | "irregular" | "indisponivel"
      certidao_tipo:
        | "federal_rfb"
        | "federal_pgfn"
        | "situacao_fiscal_rfb"
        | "estadual_sefaz"
        | "municipal_iss"
        | "municipal_recife"
        | "cnd_municipal_recife"
        | "cnd_fgts"
        | "cnd_trabalhista"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alerta_nivel: ["critico", "aviso", "info"],
      certidao_status: ["regular", "vencendo", "irregular", "indisponivel"],
      certidao_tipo: [
        "federal_rfb",
        "federal_pgfn",
        "situacao_fiscal_rfb",
        "estadual_sefaz",
        "municipal_iss",
        "municipal_recife",
        "cnd_municipal_recife",
        "cnd_fgts",
        "cnd_trabalhista",
      ],
    },
  },
} as const
