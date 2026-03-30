import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Empresas from "./pages/Empresas";
import Certidoes from "./pages/Certidoes";
import Certificados from "./pages/Certificados";
import Alertas from "./pages/Alertas";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import CaixasPostais from "./pages/CaixasPostais";
import Financeiro from "./pages/Financeiro";
import ContasPagar from "./pages/ContasPagar";
import PlanoContas from "./pages/PlanoContas";
import Conciliacao from "./pages/Conciliacao";
import Fornecedores from "./pages/Fornecedores";
import Obrigacoes from "./pages/Obrigacoes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
              <Route path="/empresas" element={<Empresas />} />
              <Route path="/certidoes" element={<Certidoes />} />
              <Route path="/certificados" element={<Certificados />} />
              <Route path="/alertas" element={<Alertas />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/caixas-postais" element={<CaixasPostais />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/contas-pagar" element={<ContasPagar />} />
              <Route path="/plano-contas" element={<PlanoContas />} />
              <Route path="/conciliacao" element={<Conciliacao />} />
              <Route path="/fornecedores" element={<Fornecedores />} />
              <Route path="/obrigacoes" element={<Obrigacoes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
