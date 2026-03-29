import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ALL_MODULE_IDS, type ModuleId } from "@/lib/modules";

type UsuarioPerfil = Tables<"usuarios_perfil">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  podeIncluir: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  modulosPermitidos: ModuleId[];
  temModulo: (id: ModuleId) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  podeIncluir: true,
  podeEditar: true,
  podeExcluir: true,
  isOwner: true,
  isAdmin: true,
  modulosPermitidos: ALL_MODULE_IDS,
  temModulo: () => true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);

  const loadPerfil = async (userId: string) => {
    const { data } = await supabase
      .from("usuarios_perfil")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setPerfil(data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          setLoading(false);
          if (session?.user) {
            setTimeout(() => loadPerfil(session.user.id), 0);
          }
        }
        if (event === "SIGNED_OUT") {
          setLoading(false);
          setPerfil(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Owner = no perfil record → full access to everything
  const isOwner = perfil === null;
  const isAdmin = isOwner || perfil?.is_admin === true;

  const podeIncluir = isAdmin || perfil?.pode_incluir === true;
  const podeEditar  = isAdmin || perfil?.pode_editar  === true;
  const podeExcluir = isAdmin || perfil?.pode_excluir === true;

  // Modules: admin/owner gets all; regular member gets only what's in modulos[]
  const modulosPermitidos: ModuleId[] = isAdmin
    ? ALL_MODULE_IDS
    : ((perfil?.modulos ?? []) as ModuleId[]);

  const temModulo = (id: ModuleId) => modulosPermitidos.includes(id);

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      podeIncluir,
      podeEditar,
      podeExcluir,
      isOwner,
      isAdmin,
      modulosPermitidos,
      temModulo,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
