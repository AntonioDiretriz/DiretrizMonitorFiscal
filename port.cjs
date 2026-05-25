const fs = require('fs');

// Dashboard
let code = fs.readFileSync('/tmp/diretrizanalisefolha/src/routes/app.dashboard.$id.tsx', 'utf-8');
code = code.replace(/export const Route[\s\S]*?(?=\bfunction DashboardPage)/, '');
code = code.replace('import { createFileRoute, Link } from "@tanstack/react-router";', 'import { Link, useParams } from "react-router-dom";');
code = code.replace('const { id } = Route.useParams();', 'const { id } = useParams<{ id: string }>();');
code = code.replace('import { useAuth } from "@/hooks/use-auth";', 'import { useAuth } from "@/contexts/AuthContext";');
code = code.replace(/to="\/app\/historico"/g, 'to="/comissao-esocial/historico"');
code = code.replace(/to="\/app"/g, 'to="/comissao-esocial"');
code = code.replace('function DashboardPage() {', 'export default function DashboardPage() {');
fs.writeFileSync('src/pages/ComissaoESocialDashboard.tsx', code);

// Index / Nova
let code2 = fs.readFileSync('/tmp/diretrizanalisefolha/src/routes/app.index.tsx', 'utf-8');
code2 = code2.replace(/export const Route[\s\S]*?(?=\bfunction NovaConferencia)/, '');
code2 = code2.replace('import { createFileRoute, useNavigate } from "@tanstack/react-router";', 'import { useNavigate } from "react-router-dom";');
code2 = code2.replace('import { useAuth } from "@/hooks/use-auth";', 'import { useAuth } from "@/contexts/AuthContext";');
code2 = code2.replace(/navigate\(\{ to: "\/app\/dashboard\/\$id", params: \{ id: conf\.id \} \}\);/g, 'navigate(`/comissao-esocial/dashboard/${conf.id}`);');
code2 = code2.replace('function NovaConferencia() {', 'export default function NovaConferencia() {');
fs.writeFileSync('src/pages/ComissaoESocial.tsx', code2);

console.log("Ported!");
