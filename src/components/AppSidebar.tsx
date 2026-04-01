import { useState } from "react";
import {
  LayoutDashboard, Building2, FileCheck, Bell, Settings, LogOut,
  Users, KeyRound, MailOpen, ChevronRight, Stethoscope,
  Banknote, CreditCard, ListChecks, Package, UserCheck, ClipboardList,
  CalendarDays, BarChart2, User,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { ModuleId } from "@/lib/modules";

function NavSection({
  icon: Icon,
  label,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <SidebarMenuButton className="hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground w-full">
          <Icon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-90")}
          />
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, isAdmin, isOwner, temModulo, displayName, user } = useAuth();
  const email = user?.email ?? "";
  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : email.slice(0, 2).toUpperCase();
  const role = isOwner ? "Proprietário" : isAdmin ? "Administrador" : "Colaborador";

  const monitoramentoItems = [
    { title: "Certidões",          url: "/certidoes",      icon: FileCheck,   moduleId: "certidoes"    as ModuleId },
    { title: "Caixas Postais",     url: "/caixas-postais", icon: MailOpen,    moduleId: "caixas"       as ModuleId },
    { title: "Diagnóstico Fiscal", icon: Stethoscope,      soon: true,        url: ""                              },
    { title: "Certificados",       url: "/certificados",   icon: KeyRound,    moduleId: "certificados" as ModuleId },
  ].filter(item => item.soon || temModulo(item.moduleId as ModuleId));

  const financeiroItems = temModulo("financeiro") ? [
    { title: "Visão Geral",    url: "/financeiro",   icon: Banknote   },
    { title: "Contas a Pagar", url: "/contas-pagar", icon: CreditCard },
    { title: "Conciliação",    url: "/conciliacao",  icon: ListChecks },
    { title: "Obrigações",     url: "/obrigacoes",   icon: ListChecks },
  ] : [];

  const rotinasItems = temModulo("rotinas") ? [
    { title: "Tarefas",    url: "/rotinas",            icon: ClipboardList },
    { title: "Calendário", url: "/rotinas/calendario", icon: CalendarDays  },
    { title: "Dashboard",  url: "/rotinas/dashboard",  icon: BarChart2     },
  ] : [];

  const configItems = [
    { title: "Empresas",        url: "/empresas",      icon: Building2,  adminOnly: false },
    { title: "Fornecedores",    url: "/fornecedores",  icon: UserCheck,  adminOnly: true  },
    { title: "Equipe",          url: "/usuarios",      icon: Users,      adminOnly: true  },
    { title: "Plano de Contas", url: "/plano-contas",  icon: ListChecks, adminOnly: true  },
  ].filter(item => !item.adminOnly || isAdmin);

  const showMonitoramento = monitoramentoItems.length > 0;
  const showModulo = showMonitoramento || financeiroItems.length > 0 || rotinasItems.length > 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6">
            {!collapsed ? (
              <img src="/logo-white.svg" alt="Diretriz Logo" className="h-8 w-auto object-contain" />
            ) : (
              <img src="/favicon.svg" alt="Diretriz" className="h-7 w-7 object-contain" />
            )}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>

              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/"
                    end
                    className="hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4 shrink-0" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Alertas */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/alertas"
                    className="hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
                    activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                  >
                    <Bell className="mr-2 h-4 w-4 shrink-0" />
                    {!collapsed && <span>Alertas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* ── Módulo ── */}
              {!collapsed && showModulo && (
                <SidebarMenuItem>
                  <NavSection icon={Package} label="Módulo" defaultOpen>
                    <div className="pl-2">

                      {/* Monitoramento */}
                      {showMonitoramento && (
                        <SidebarMenuItem>
                          <NavSection icon={FileCheck} label="Monitoramento" defaultOpen>
                            <SidebarMenuSub>
                              {monitoramentoItems.map((item) => (
                                <SidebarMenuSubItem key={item.title}>
                                  {item.soon ? (
                                    <SidebarMenuSubButton disabled className="opacity-50 cursor-default">
                                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="flex-1">{item.title}</span>
                                      <span className="ml-auto text-[10px] text-muted-foreground">Em breve</span>
                                    </SidebarMenuSubButton>
                                  ) : (
                                    <SidebarMenuSubButton asChild>
                                      <NavLink
                                        to={item.url!}
                                        className="hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                                        activeClassName="text-sidebar-foreground font-medium"
                                      >
                                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                                        <span>{item.title}</span>
                                      </NavLink>
                                    </SidebarMenuSubButton>
                                  )}
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </NavSection>
                        </SidebarMenuItem>
                      )}

                      {/* Financeiro */}
                      {financeiroItems.length > 0 && (
                        <SidebarMenuItem>
                          <NavSection icon={Banknote} label="Financeiro">
                            <SidebarMenuSub>
                              {financeiroItems.map((item) => (
                                <SidebarMenuSubItem key={item.title}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={item.url}
                                      className="hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                                      activeClassName="text-sidebar-foreground font-medium"
                                    >
                                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                                      <span>{item.title}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </NavSection>
                        </SidebarMenuItem>
                      )}

                      {/* Rotinas */}
                      {rotinasItems.length > 0 && (
                        <SidebarMenuItem>
                          <NavSection icon={ClipboardList} label="Rotinas">
                            <SidebarMenuSub>
                              {rotinasItems.map((item) => (
                                <SidebarMenuSubItem key={item.title}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={item.url}
                                      className="hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                                      activeClassName="text-sidebar-foreground font-medium"
                                    >
                                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                                      <span>{item.title}</span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </NavSection>
                        </SidebarMenuItem>
                      )}

                    </div>
                  </NavSection>
                </SidebarMenuItem>
              )}

              {/* ── Configuração ── */}
              {!collapsed && (
                <SidebarMenuItem>
                  <NavSection icon={Settings} label="Configuração">
                    <SidebarMenuSub>
                      {configItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild>
                            <NavLink
                              to={item.url}
                              className="hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                              activeClassName="text-sidebar-foreground font-medium"
                            >
                              <item.icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{item.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </NavSection>
                </SidebarMenuItem>
              )}

              {/* Collapsed: icon-only */}
              {collapsed && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Package className="h-4 w-4" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton>
                      <Settings className="h-4 w-4" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent px-2"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ED3237] text-white text-xs font-bold">
                {initials}
              </div>
              {!collapsed && (
                <div className="ml-2 flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium leading-tight truncate max-w-[140px]">{displayName}</span>
                  <span className="text-[10px] text-sidebar-foreground/50 truncate max-w-[140px]">{role}</span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
                <p className="text-xs text-muted-foreground">{role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/configuracoes" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Meu Perfil
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500 cursor-pointer"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
