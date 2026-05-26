import { FileCheck, KeyRound, MailOpen, Banknote, ClipboardList, FileBarChart, type LucideIcon } from "lucide-react";

export type ModuleId = string;

export interface SubModuleDef {
  id: string;
  label: string;
}

export const MODULES: { id: ModuleId; label: string; url: string; icon: LucideIcon; description: string; subModules?: SubModuleDef[] }[] = [
  {
    id: "certidoes",
    label: "Certidões",
    url: "/certidoes",
    icon: FileCheck,
    description: "Monitoramento de certidões fiscais",
    subModules: [
      { id: "certidoes:dashboard", label: "Dashboard" },
      { id: "certidoes:empresas", label: "Empresas" },
      { id: "certidoes:logs", label: "Logs" },
      { id: "certidoes:confronto-xml", label: "Confronto XML" }
    ]
  },
  {
    id: "certificados",
    label: "Certificados Digitais",
    url: "/certificados",
    icon: KeyRound,
    description: "Controle de certificados A1 e A3",
    subModules: [
      { id: "certificados:ativos", label: "Ativos" },
      { id: "certificados:vencidos", label: "Vencidos" },
      { id: "certificados:arquivados", label: "Arquivados" }
    ]
  },
  {
    id: "caixas",
    label: "Caixas Postais",
    url: "/caixas-postais",
    icon: MailOpen,
    description: "Gestão de contratos de caixas postais",
    subModules: [
      { id: "caixas:dashboard", label: "Dashboard" },
      { id: "caixas:mensagens", label: "Mensagens" }
    ]
  },
  {
    id: "financeiro",
    label: "Financeiro",
    url: "/financeiro",
    icon: Banknote,
    description: "Gestão financeira, contas a pagar e conciliação",
    subModules: [
      { id: "financeiro:visao", label: "Visão Geral" },
      { id: "financeiro:comissao", label: "Comissão x eSocial" },
      { id: "financeiro:insight", label: "Finance Insight" },
      { id: "financeiro:contas-pagar", label: "Contas a Pagar" },
      { id: "financeiro:conciliacao", label: "Conciliação" },
      { id: "financeiro:regras", label: "Regras" },
      { id: "financeiro:obrigacoes", label: "Obrigações" }
    ]
  },
  {
    id: "rotinas",
    label: "Rotinas",
    url: "/rotinas",
    icon: ClipboardList,
    description: "Gestão de rotinas e obrigações do escritório",
    subModules: [
      { id: "rotinas:tarefas", label: "Tarefas" },
      { id: "rotinas:calendario", label: "Calendário" },
      { id: "rotinas:dashboard", label: "Dashboard" },
      { id: "rotinas:automacao", label: "Automação" }
    ]
  },
  {
    id: "relatorios",
    label: "Relatórios",
    url: "/relatorios",
    icon: FileBarChart,
    description: "Análise gerencial de despesas, receitas e DRE",
    subModules: [
      { id: "relatorios:analise", label: "Análise Gerencial" }
    ]
  },
];

export const ALL_MODULE_IDS: ModuleId[] = MODULES.flatMap(m => 
  [m.id, ...(m.subModules?.map(s => s.id) || [])]
);
