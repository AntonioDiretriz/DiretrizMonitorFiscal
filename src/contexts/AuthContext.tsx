import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type UsuarioPerfil = Tables<"usuarios_perfil">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  podeIncluir: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  isOwner: boolean;
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
            // Defer to avoid Supabase auth deadlock
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

  // If the user has a perfil record (team member), use its permissions.
  // If no record found, the user is the escritório owner → full permissions.
  const isOwner = perfil === null;
  const podeIncluir = isOwner || perfil?.pode_incluir === true;
  const podeEditar = isOwner || perfil?.pode_editar === true;
  const podeExcluir = isOwner || perfil?.pode_excluir === true;

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      podeIncluir,
      podeEditar,
      podeExcluir,
      isOwner,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
