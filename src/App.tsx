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
import RegrasConciliacao from "./pages/RegrasConciliacao";
import Fornecedores from "./pages/Fornecedores";
import Obrigacoes from "./pages/Obrigacoes";
import Rotinas from "./pages/Rotinas";
import CalendarioRotinas from "./pages/CalendarioRotinas";
import DashboardRotinas from "./pages/DashboardRotinas";
import AutomacaoRotinas from "./pages/AutomacaoRotinas";
import DiagnosticoFiscal from "./pages/DiagnosticoFiscal";
import ConfiguracaoObrigacoes from "./pages/ConfiguracaoObrigacoes";
import NotFound from "./pages/NotFound";
import AuthBanco from "./pages/AuthBanco";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/banco" element={<AuthBanco />} />
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
              <Route path="/regras-conciliacao" element={<RegrasConciliacao />} />
              <Route path="/fornecedores" element={<Fornecedores />} />
              <Route path="/obrigacoes" element={<Obrigacoes />} />
              <Route path="/rotinas" element={<Rotinas />} />
              <Route path="/rotinas/calendario" element={<CalendarioRotinas />} />
              <Route path="/rotinas/dashboard" element={<DashboardRotinas />} />
              <Route path="/rotinas/automacao" element={<AutomacaoRotinas />} />
              <Route path="/diagnostico-fiscal" element={<DiagnosticoFiscal />} />
              <Route path="/configuracao/obrigacoes" element={<ConfiguracaoObrigacoes />} />
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
