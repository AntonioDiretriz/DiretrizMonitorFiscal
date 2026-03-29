import { FileCheck, KeyRound, MailOpen, type LucideIcon } from "lucide-react";

export type ModuleId = "certidoes" | "certificados" | "caixas";

export const MODULES: { id: ModuleId; label: string; url: string; icon: LucideIcon; description: string }[] = [
  {
    id: "certidoes",
    label: "Certidões",
    url: "/certidoes",
    icon: FileCheck,
    description: "Monitoramento de certidões fiscais",
  },
  {
    id: "certificados",
    label: "Certificados Digitais",
    url: "/certificados",
    icon: KeyRound,
    description: "Controle de certificados A1 e A3",
  },
  {
    id: "caixas",
    label: "Caixas Postais",
    url: "/caixas-postais",
    icon: MailOpen,
    description: "Gestão de contratos de caixas postais",
  },
];

export const ALL_MODULE_IDS: ModuleId[] = MODULES.map(m => m.id);
