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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comissao_vendedora: {
        Row: {
          atualizado_em: string
          base: Database["public"]["Enums"]["base_comissao"]
          criado_em: string
          id: string
          observacao: string | null
          percentual_alta: number
          percentual_baixa: number
          vendedora_id: string
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          atualizado_em?: string
          base?: Database["public"]["Enums"]["base_comissao"]
          criado_em?: string
          id?: string
          observacao?: string | null
          percentual_alta: number
          percentual_baixa: number
          vendedora_id: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          atualizado_em?: string
          base?: Database["public"]["Enums"]["base_comissao"]
          criado_em?: string
          id?: string
          observacao?: string | null
          percentual_alta?: number
          percentual_baixa?: number
          vendedora_id?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissao_vendedora_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_financeiro: {
        Row: {
          atualizado_em: string
          id: boolean
          imposto_percentual: number
        }
        Insert: {
          atualizado_em?: string
          id?: boolean
          imposto_percentual?: number
        }
        Update: {
          atualizado_em?: string
          id?: boolean
          imposto_percentual?: number
        }
        Relationships: []
      }
      dc_etapas: {
        Row: {
          cor: string | null
          id: string
          indice: number | null
          nome: string
          papel: string | null
          pipeline_id: string
          pipeline_nome: string | null
          visto_em: string
        }
        Insert: {
          cor?: string | null
          id: string
          indice?: number | null
          nome: string
          papel?: string | null
          pipeline_id: string
          pipeline_nome?: string | null
          visto_em?: string
        }
        Update: {
          cor?: string | null
          id?: string
          indice?: number | null
          nome?: string
          papel?: string | null
          pipeline_id?: string
          pipeline_nome?: string | null
          visto_em?: string
        }
        Relationships: []
      }
      dc_snapshots: {
        Row: {
          atrasadas_24h: number | null
          colhido_dia: string
          colhido_em: string
          conversas_opened: number | null
          conversas_unstarted: number | null
          conversas_waiting: number | null
          erro: string | null
          espera_maxima_min: number | null
          esperando_24h: number | null
          esperando_atrasadas: number | null
          esperando_resposta: number | null
          id: string
          leads_7dias: number | null
          leads_do_dia: number | null
          leads_total: number | null
          negocios_movidos_hoje: Json
          negocios_por_etapa: Json
          negocios_total: number | null
        }
        Insert: {
          atrasadas_24h?: number | null
          colhido_dia: string
          colhido_em?: string
          conversas_opened?: number | null
          conversas_unstarted?: number | null
          conversas_waiting?: number | null
          erro?: string | null
          espera_maxima_min?: number | null
          esperando_24h?: number | null
          esperando_atrasadas?: number | null
          esperando_resposta?: number | null
          id?: string
          leads_7dias?: number | null
          leads_do_dia?: number | null
          leads_total?: number | null
          negocios_movidos_hoje?: Json
          negocios_por_etapa?: Json
          negocios_total?: number | null
        }
        Update: {
          atrasadas_24h?: number | null
          colhido_dia?: string
          colhido_em?: string
          conversas_opened?: number | null
          conversas_unstarted?: number | null
          conversas_waiting?: number | null
          erro?: string | null
          espera_maxima_min?: number | null
          esperando_24h?: number | null
          esperando_atrasadas?: number | null
          esperando_resposta?: number | null
          id?: string
          leads_7dias?: number | null
          leads_do_dia?: number | null
          leads_total?: number | null
          negocios_movidos_hoje?: Json
          negocios_por_etapa?: Json
          negocios_total?: number | null
        }
        Relationships: []
      }
      despesas: {
        Row: {
          atualizado_em: string
          categoria: Database["public"]["Enums"]["categoria_despesa"]
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string | null
          id: string
          recorrente: boolean
          valor: number
        }
        Insert: {
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["categoria_despesa"]
          criado_em?: string
          criado_por?: string | null
          data: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          valor: number
        }
        Update: {
          atualizado_em?: string
          categoria?: Database["public"]["Enums"]["categoria_despesa"]
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          valor?: number
        }
        Relationships: []
      }
      faturamento_mensal: {
        Row: {
          ads: number
          atualizado_em: string
          criado_em: string
          despesas: number
          faturamento_bruto: number
          folha: number
          impostos: number
          mes: string
          observacao: string | null
          retiradas: number
        }
        Insert: {
          ads?: number
          atualizado_em?: string
          criado_em?: string
          despesas?: number
          faturamento_bruto?: number
          folha?: number
          impostos?: number
          mes: string
          observacao?: string | null
          retiradas?: number
        }
        Update: {
          ads?: number
          atualizado_em?: string
          criado_em?: string
          despesas?: number
          faturamento_bruto?: number
          folha?: number
          impostos?: number
          mes?: string
          observacao?: string | null
          retiradas?: number
        }
        Relationships: []
      }
      gastos_trafego: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_trafego"]
          criado_em: string
          criado_por: string | null
          data: string
          id: string
          observacao: string | null
          valor: number
        }
        Insert: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_trafego"]
          criado_em?: string
          criado_por?: string | null
          data: string
          id?: string
          observacao?: string | null
          valor: number
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_trafego"]
          criado_em?: string
          criado_por?: string | null
          data?: string
          id?: string
          observacao?: string | null
          valor?: number
        }
        Relationships: []
      }
      gastos_trafego_contas: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_trafego"]
          conta_id: string
          conta_nome: string
          criado_em: string
          criado_por: string | null
          data: string
          fechado: boolean
          fonte: string
          id: string
          observacao: string | null
          valor: number
        }
        Insert: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_trafego"]
          conta_id: string
          conta_nome: string
          criado_em?: string
          criado_por?: string | null
          data: string
          fechado?: boolean
          fonte?: string
          id?: string
          observacao?: string | null
          valor: number
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_trafego"]
          conta_id?: string
          conta_nome?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          fechado?: boolean
          fonte?: string
          id?: string
          observacao?: string | null
          valor?: number
        }
        Relationships: []
      }
      log_alteracoes: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          data_venda: string | null
          id: string
          valor_anterior: number | null
          valor_novo: number | null
          venda_id: string | null
          vendedora_id: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          data_venda?: string | null
          id?: string
          valor_anterior?: number | null
          valor_novo?: number | null
          venda_id?: string | null
          vendedora_id?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          data_venda?: string | null
          id?: string
          valor_anterior?: number | null
          valor_novo?: number | null
          venda_id?: string | null
          vendedora_id?: string | null
        }
        Relationships: []
      }
      metas: {
        Row: {
          ano: number
          id: string
          mes: number
          meta_diaria: number
          vendedora_id: string
        }
        Insert: {
          ano: number
          id?: string
          mes: number
          meta_diaria?: number
          vendedora_id: string
        }
        Update: {
          ano?: number
          id?: string
          mes?: number
          meta_diaria?: number
          vendedora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_operacao: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          meta_faturamento: number | null
          meta_lucro: number | null
          periodo: Database["public"]["Enums"]["periodo_meta"]
          referencia: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          meta_faturamento?: number | null
          meta_lucro?: number | null
          periodo: Database["public"]["Enums"]["periodo_meta"]
          referencia: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          meta_faturamento?: number | null
          meta_lucro?: number | null
          periodo?: Database["public"]["Enums"]["periodo_meta"]
          referencia?: string
        }
        Relationships: []
      }
      metas_vendedora: {
        Row: {
          atualizado_em: string
          criado_em: string
          dia: string
          meta_alta: number
          meta_baixa: number
          vendedora_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dia: string
          meta_alta?: number
          meta_baixa?: number
          vendedora_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dia?: string
          meta_alta?: number
          meta_baixa?: number
          vendedora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendedora_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plataforma_taxas: {
        Row: {
          faixa_max: number | null
          faixa_min: number
          fixo_por_venda: number
          fixo_so_no_principal: boolean
          id: string
          observacao: string | null
          perc_juros_repassado: number
          percentual: number
          plataforma: Database["public"]["Enums"]["plataforma"]
          vigencia_inicio: string
        }
        Insert: {
          faixa_max?: number | null
          faixa_min?: number
          fixo_por_venda?: number
          fixo_so_no_principal?: boolean
          id?: string
          observacao?: string | null
          perc_juros_repassado?: number
          percentual: number
          plataforma: Database["public"]["Enums"]["plataforma"]
          vigencia_inicio?: string
        }
        Update: {
          faixa_max?: number | null
          faixa_min?: number
          fixo_por_venda?: number
          fixo_so_no_principal?: boolean
          id?: string
          observacao?: string | null
          perc_juros_repassado?: number
          percentual?: number
          plataforma?: Database["public"]["Enums"]["plataforma"]
          vigencia_inicio?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          criado_em: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      remuneracoes: {
        Row: {
          atualizado_em: string
          base: Database["public"]["Enums"]["base_remuneracao"]
          classe: Database["public"]["Enums"]["classe_remuneracao"]
          criado_em: string
          dia_pagamento: number
          id: string
          observacao: string | null
          percentual: number | null
          periodicidade: Database["public"]["Enums"]["periodicidade_pagamento"]
          pessoa_id: string
          valor_fixo: number | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          atualizado_em?: string
          base: Database["public"]["Enums"]["base_remuneracao"]
          classe?: Database["public"]["Enums"]["classe_remuneracao"]
          criado_em?: string
          dia_pagamento?: number
          id?: string
          observacao?: string | null
          percentual?: number | null
          periodicidade?: Database["public"]["Enums"]["periodicidade_pagamento"]
          pessoa_id: string
          valor_fixo?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Update: {
          atualizado_em?: string
          base?: Database["public"]["Enums"]["base_remuneracao"]
          classe?: Database["public"]["Enums"]["classe_remuneracao"]
          criado_em?: string
          dia_pagamento?: number
          id?: string
          observacao?: string | null
          percentual?: number | null
          periodicidade?: Database["public"]["Enums"]["periodicidade_pagamento"]
          pessoa_id?: string
          valor_fixo?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "remuneracoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_reembolso: {
        Row: {
          anotacao_suporte: string | null
          atendido_por: string | null
          atualizado_em: string
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          criado_em: string
          externo_id: string
          id: string
          motivo_cliente: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          produto_nome: string | null
          resposta_vendedor: string | null
          revertida_em: string | null
          solicitado_em: string
          status: Database["public"]["Enums"]["status_solicitacao"]
          valor: number | null
          venda_externo_id: string | null
        }
        Insert: {
          anotacao_suporte?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          criado_em?: string
          externo_id: string
          id?: string
          motivo_cliente?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          produto_nome?: string | null
          resposta_vendedor?: string | null
          revertida_em?: string | null
          solicitado_em: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          valor?: number | null
          venda_externo_id?: string | null
        }
        Update: {
          anotacao_suporte?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          criado_em?: string
          externo_id?: string
          id?: string
          motivo_cliente?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          produto_nome?: string | null
          resposta_vendedor?: string | null
          revertida_em?: string | null
          solicitado_em?: string
          status?: Database["public"]["Enums"]["status_solicitacao"]
          valor?: number | null
          venda_externo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_reembolso_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_email: string | null
          cliente_nome: string | null
          criado_em: string
          custo_produto: number
          evento_externo_id: string
          id: string
          juros_parcelamento: number
          liberado_em: string | null
          liquido_plataforma: number | null
          metodo_pagamento: string | null
          ocorrido_dia: string
          ocorrido_em: string
          parcelas: number
          payload: Json | null
          pedido_chave: string | null
          pedido_externo_id: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          produto_nome: string | null
          reembolsado_dia: string | null
          reembolsado_em: string | null
          status: Database["public"]["Enums"]["status_venda"]
          taxa_afiliado: number
          taxa_coprodutor: number
          tipo: Database["public"]["Enums"]["tipo_item"]
          valor_bruto: number
        }
        Insert: {
          cliente_email?: string | null
          cliente_nome?: string | null
          criado_em?: string
          custo_produto?: number
          evento_externo_id: string
          id?: string
          juros_parcelamento?: number
          liberado_em?: string | null
          liquido_plataforma?: number | null
          metodo_pagamento?: string | null
          ocorrido_dia: string
          ocorrido_em: string
          parcelas?: number
          payload?: Json | null
          pedido_chave?: string | null
          pedido_externo_id?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          produto_nome?: string | null
          reembolsado_dia?: string | null
          reembolsado_em?: string | null
          status?: Database["public"]["Enums"]["status_venda"]
          taxa_afiliado?: number
          taxa_coprodutor?: number
          tipo?: Database["public"]["Enums"]["tipo_item"]
          valor_bruto: number
        }
        Update: {
          cliente_email?: string | null
          cliente_nome?: string | null
          criado_em?: string
          custo_produto?: number
          evento_externo_id?: string
          id?: string
          juros_parcelamento?: number
          liberado_em?: string | null
          liquido_plataforma?: number | null
          metodo_pagamento?: string | null
          ocorrido_dia?: string
          ocorrido_em?: string
          parcelas?: number
          payload?: Json | null
          pedido_chave?: string | null
          pedido_externo_id?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          produto_nome?: string | null
          reembolsado_dia?: string | null
          reembolsado_em?: string | null
          status?: Database["public"]["Enums"]["status_venda"]
          taxa_afiliado?: number
          taxa_coprodutor?: number
          tipo?: Database["public"]["Enums"]["tipo_item"]
          valor_bruto?: number
        }
        Relationships: []
      }
      vendas_diarias: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          data: string
          id: string
          valor: number
          vendedora_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data: string
          id?: string
          valor: number
          vendedora_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data?: string
          id?: string
          valor?: number
          vendedora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_diarias_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_eventos: {
        Row: {
          erro: string | null
          evento_externo_id: string | null
          id: string
          payload: Json
          plataforma: string
          processado: boolean
          recebido_em: string
          tipo_evento: string | null
        }
        Insert: {
          erro?: string | null
          evento_externo_id?: string | null
          id?: string
          payload: Json
          plataforma: string
          processado?: boolean
          recebido_em?: string
          tipo_evento?: string | null
        }
        Update: {
          erro?: string | null
          evento_externo_id?: string | null
          id?: string
          payload?: Json
          plataforma?: string
          processado?: boolean
          recebido_em?: string
          tipo_evento?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atende_suporte: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gestao: { Args: { _user_id: string }; Returns: boolean }
      suporte_resumo_mes: { Args: { p_mes: string }; Returns: Json }
    }
    Enums: {
      app_role: "vendedora" | "gestora" | "admin" | "suporte"
      base_comissao: "bruto" | "liquido"
      base_remuneracao: "fixo" | "percentual_lucro" | "percentual_faturamento"
      canal_trafego: "meta" | "google" | "tiktok" | "outro"
      categoria_despesa: "ferramenta" | "equipe" | "estrutura" | "outro"
      classe_remuneracao: "colaborador" | "socia"
      periodicidade_pagamento: "mensal" | "semestral"
      periodo_meta: "mensal" | "semanal"
      plataforma: "plataforma_a" | "plataforma_b"
      status_solicitacao:
        | "aberta"
        | "em_contato"
        | "revertida"
        | "perdida"
        | "recusada"
      status_venda:
        | "aprovada"
        | "reembolsada"
        | "chargeback"
        | "pendente"
        | "nao_paga"
      tipo_item: "principal" | "bump" | "upsell"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["vendedora", "gestora", "admin", "suporte"],
      base_comissao: ["bruto", "liquido"],
      base_remuneracao: ["fixo", "percentual_lucro", "percentual_faturamento"],
      canal_trafego: ["meta", "google", "tiktok", "outro"],
      categoria_despesa: ["ferramenta", "equipe", "estrutura", "outro"],
      classe_remuneracao: ["colaborador", "socia"],
      periodicidade_pagamento: ["mensal", "semestral"],
      periodo_meta: ["mensal", "semanal"],
      plataforma: ["plataforma_a", "plataforma_b"],
      status_solicitacao: [
        "aberta",
        "em_contato",
        "revertida",
        "perdida",
        "recusada",
      ],
      status_venda: [
        "aprovada",
        "reembolsada",
        "chargeback",
        "pendente",
        "nao_paga",
      ],
      tipo_item: ["principal", "bump", "upsell"],
    },
  },
} as const
