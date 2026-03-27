

## CND Monitor — SaaS de Monitoramento de Certidões Negativas

### 1. Design System
- Tema claro e profissional com tons de cinza e azul institucional
- Tipografia limpa, espaçamentos generosos
- Status coloridos: 🟢 Regular, 🟡 Próximo do vencimento, 🔴 Irregular, ⚫ Indisponível

### 2. Autenticação (Supabase)
- Página de Login/Cadastro com e-mail e senha
- Perfil do usuário (nome do escritório, responsável)
- Rotas protegidas — só acessa logado

### 3. Dashboard Principal
- **Cards de resumo**: Total de empresas, % Regular vs Irregular, certidões vencendo em breve
- **Gráficos**: Por tipo (Federal/Estadual/Municipal) e por status
- **Indicadores rápidos**: Empresas com risco, vencidas hoje, pendências detectadas
- **Lista de alertas recentes** com filtros (Não lidas, Críticas, Resolvidas)

### 4. Cadastro de Empresas
- Formulário: CNPJ (com validação), Razão Social, Município/UF, Regime tributário, Responsável
- Tabela listando empresas com busca e filtros
- Página de detalhes da empresa com todas as certidões e histórico

### 5. Monitoramento de Certidões
- Tabela de certidões por empresa com status visual (badges coloridos)
- Tipos: CND Federal (RFB), Dívida Ativa (PGFN), SEFAZ estadual, Prefeitura/ISS
- Data de emissão, validade, dias restantes
- Histórico de mudanças de status

### 6. Central de Alertas
- Lista de alertas com níveis: Crítico, Aviso, Info
- Filtros: Não lidas, Resolvidas, Críticas
- Marcar como lida/resolvida
- Detalhes do alerta com ação recomendada

### 7. Banco de Dados (Supabase)
- Tabelas: empresas, certidoes, alertas, profiles
- RLS por usuário (cada escritório vê apenas suas empresas)
- Dados iniciais de exemplo para demonstração

### 8. Páginas e Navegação
- Sidebar com: Dashboard, Empresas, Certidões, Alertas, Configurações
- Layout responsivo
- Breadcrumbs e navegação clara

