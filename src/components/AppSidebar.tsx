import { useState } from "react";
import {
  LayoutDashboard, Building2, FileCheck, Bell, Settings, LogOut,
  Users, KeyRound, MailOpen, ChevronRight, Stethoscope,
  Banknote, CreditCard, ListChecks, Package, UserCheck,
} from "lucide-react";
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
  const { signOut, isAdmin, temModulo } = useAuth();

  const monitoramentoItems: {
    title: string; url?: string; icon: React.ElementType; moduleId?: ModuleId; soon?: boolean;
  }[] = [
    { title: "Certidões",          url: "/certidoes",      icon: FileCheck,   moduleId: "certidoes"    },
    { title: "Caixas Postais",     url: "/caixas-postais", icon: MailOpen,    moduleId: "caixas"       },
    { title: "Diagnóstico Fiscal", icon: Stethoscope,      soon: true                                  },
    { title: "Certificados",       url: "/certificados",   icon: KeyRound,    moduleId: "certificados" },
  ].filter(item => item.soon || !item.moduleId || temModulo(item.moduleId));

  const financeiroItems: { title: string; url: string; icon: React.ElementType; soon?: boolean }[] = [
    { title: "Visão Geral",    url: "/financeiro",   icon: Banknote   },
    { title: "Contas a Pagar", url: "/contas-pagar", icon: CreditCard },
    { title: "Conciliação",    url: "/conciliacao",  icon: ListChecks },
    { title: "Obrigações",     url: "#",             icon: ListChecks, soon: true },
  ];

  const configItems = [
    { title: "Empresas",       url: "/empresas",      icon: Building2  },
    { title: "Fornecedores",   url: "/fornecedores",  icon: UserCheck  },
    { title: "Equipe",         url: "/usuarios",      icon: Users,     adminOnly: true },
    { title: "Plano de Contas",url: "/plano-contas",  icon: ListChecks },
  ].filter(item => !("adminOnly" in item && item.adminOnly) || isAdmin);

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
              {!collapsed && (
                <SidebarMenuItem>
                  <NavSection icon={Package} label="Módulo" defaultOpen>
                    <div className="pl-2">
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

                      <SidebarMenuItem>
                        <NavSection icon={Banknote} label="Financeiro">
                          <SidebarMenuSub>
                            {financeiroItems.map((item) => (
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
                                      to={item.url}
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

      <SidebarFooter className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/60 hover:text-red-400 hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
