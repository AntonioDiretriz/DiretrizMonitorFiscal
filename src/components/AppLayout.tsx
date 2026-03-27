import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4">
            <SidebarTrigger className="mr-4" />
            <h2 className="text-sm font-medium text-muted-foreground">
              Monitoramento de Certidões Negativas
            </h2>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
          <footer className="border-t bg-card px-6 py-2 text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} <span className="font-semibold text-foreground">Diretriz Contabilidade</span> — Todos os direitos reservados
            </p>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
