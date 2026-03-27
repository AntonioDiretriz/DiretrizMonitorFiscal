import { LayoutDashboard, Building2, FileCheck, Bell, Settings, LogOut, Users, KeyRound, MailOpen } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard",      url: "/",               icon: LayoutDashboard },
  { title: "Empresas",       url: "/empresas",        icon: Building2 },
  { title: "Certificados",   url: "/certificados",    icon: KeyRound },
  { title: "Caixas Postais", url: "/caixas-postais",  icon: MailOpen },
  { title: "Certidões",      url: "/certidoes",       icon: FileCheck },
  { title: "Alertas",        url: "/alertas",         icon: Bell },
  { title: "Equipe",         url: "/usuarios",        icon: Users },
  { title: "Configurações",  url: "/configuracoes",   icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6">
            {!collapsed ? (
              <div className="flex items-center gap-3">
                <img src="/logo-white.svg" alt="Diretriz Logo" className="h-8 w-auto object-contain" />
              </div>
            ) : (
              <img src="/favicon.svg" alt="Diretriz" className="h-7 w-7 object-contain" />
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
