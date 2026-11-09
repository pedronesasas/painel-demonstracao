import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "vendedora" | "gestora" | "admin" | "suporte";

export type Perfil = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
};

type AuthState = {
  session: Session | null;
  perfil: Perfil | null;
  papel: Papel | null;
  carregando: boolean;
  /** Liderança: vê saúde financeira, custos, margem e lucro. */
  gestao: boolean;
  /** Suporte: vê as solicitações de reembolso, e nada de financeiro. */
  suporte: boolean;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarPerfil(userId: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, nome, email, ativo").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    setPerfil((p as Perfil) ?? null);
    setPapel((r?.role as Papel) ?? null);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          void carregarPerfil(s.user.id).finally(() => setCarregando(false));
        }, 0);
      } else {
        setPerfil(null);
        setPapel(null);
        setCarregando(false);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await carregarPerfil(data.session.user.id);
      setCarregando(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    perfil,
    papel,
    carregando,
    gestao: papel === "gestora" || papel === "admin",
    // Liderança também atende suporte; o contrário não vale.
    suporte: papel === "suporte" || papel === "gestora" || papel === "admin",
    recarregar: async () => {
      if (session?.user) await carregarPerfil(session.user.id);
    },
    sair: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
