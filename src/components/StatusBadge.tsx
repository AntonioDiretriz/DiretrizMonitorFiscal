import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig = {
  regular: { label: "Regular", className: "bg-[hsl(142,71%,45%)] text-white border-transparent" },
  vencendo: { label: "Vencendo", className: "bg-[hsl(38,92%,50%)] text-white border-transparent" },
  irregular: { label: "Irregular", className: "bg-destructive text-destructive-foreground border-transparent" },
  indisponivel: { label: "Indisponível", className: "bg-muted-foreground text-white border-transparent" },
};

const nivelConfig = {
  critico: { label: "Crítico", className: "bg-destructive text-destructive-foreground border-transparent" },
  aviso: { label: "Aviso", className: "bg-[hsl(38,92%,50%)] text-white border-transparent" },
  info: { label: "Info", className: "bg-primary text-primary-foreground border-transparent" },
};

export function StatusBadge({ status }: { status: keyof typeof statusConfig }) {
  const config = statusConfig[status];
  return <Badge className={cn(config.className)}>{config.label}</Badge>;
}

export function NivelBadge({ nivel }: { nivel: keyof typeof nivelConfig }) {
  const config = nivelConfig[nivel];
  return <Badge className={cn(config.className)}>{config.label}</Badge>;
}

// Grupos para formulário e organização da tabela
export const tipoGrupos: { grupo: string; cor: string; tipos: string[] }[] = [
  {
    grupo: "Municipal",
    cor: "bg-orange-50 text-orange-800 border-orange-200",
    tipos: ["municipal_recife", "cnd_municipal_recife"],
  },
  {
    grupo: "Estadual",
    cor: "bg-purple-50 text-purple-800 border-purple-200",
    tipos: ["estadual_sefaz"],
  },
  {
    grupo: "Federal",
    cor: "bg-blue-50 text-blue-800 border-blue-200",
    tipos: ["federal_rfb", "federal_pgfn", "situacao_fiscal_rfb"],
  },
  {
    grupo: "Trabalhista",
    cor: "bg-green-50 text-green-800 border-green-200",
    tipos: ["cnd_fgts", "cnd_trabalhista"],
  },
];

// Mapa rápido tipo → grupo
export const tipoParaGrupo: Record<string, string> = Object.fromEntries(
  tipoGrupos.flatMap(({ grupo, tipos }) => tipos.map(t => [t, grupo]))
);

export const tipoLabels: Record<string, string> = {
  // Federal
  federal_rfb: "CND Federal (RFB)",
  federal_pgfn: "Dívida Ativa (PGFN)",
  situacao_fiscal_rfb: "Certidão Situação Fiscal (RFB)",
  cnd_fgts: "CND FGTS",
  cnd_trabalhista: "CND Trabalhista",
  // Estadual
  estadual_sefaz: "SEFAZ Estadual",
  // Municipal
  municipal_iss: "Prefeitura / ISS",
  municipal_recife: "Extrato Débito Recife",
  cnd_municipal_recife: "CND Prefeitura Recife",
};

export const certidoesComConsultaOnline: Record<string, { url: string; param: string }> = {
  // Federal
  federal_rfb: { url: "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/EmitirCertidao2", param: "cnpj" },
  federal_pgfn: { url: "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/EmitirCertidao2", param: "cnpj" },
  situacao_fiscal_rfb: { url: "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/EmitirCertidao", param: "cnpj" },
  cnd_fgts: { url: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf", param: "none" },
  cnd_trabalhista: { url: "https://cndt-certidao.tst.jus.br/", param: "none" },
  // Municipal
  municipal_recife: { url: "https://portalfinancas.recife.pe.gov.br/extratoDebitos/2", param: "none" },
  cnd_municipal_recife: { url: "https://recifeemdia.recife.pe.gov.br/emissaoCertidao/4", param: "none" },
};
