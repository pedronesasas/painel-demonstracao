import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  Home,
  Megaphone,
  Receipt,
  LifeBuoy,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: typeof Home;
  /** Telas de detalhe da seção, recuadas sob ela no menu lateral. */
  filhos?: { to: string; label: string }[];
};

export function AppLayout({ children, larga = false }: { children: ReactNode; larga?: boolean }) {
  const { perfil, papel, gestao, suporte, carregando, session } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!carregando && !session) void navigate({ to: "/auth" });
  }, [carregando, session, navigate]);

  if (carregando || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const itens: Item[] = gestao
    ? [
        {
          to: "/dashboard",
          label: "Dashboard",
          icon: Wallet,
          // A lista de vendas é o detalhe por trás dos números do Dashboard,
          // e não uma seção irmã: fica recuada sob ele.
          filhos: [
            { to: "/vendedora", label: "Vendedora" },
            { to: "/vendas", label: "Vendas" },
            { to: "/produtos", label: "Produtos" },
          ],
        },
        { to: "/suporte", label: "Suporte", icon: LifeBuoy },
        { to: "/custos", label: "Custos", icon: Megaphone },
        { to: "/equipe", label: "Equipe", icon: Users },
      ]
    : suporte
      ? // Suporte só enxerga a própria área. Saúde financeira, custos e
        // margem não aparecem aqui nem por URL — a RLS recusa o dado.
        [{ to: "/suporte", label: "Suporte", icon: LifeBuoy }]
      : [
          { to: "/", label: "Semana", icon: Home },
          { to: "/historico", label: "Histórico", icon: CalendarDays },
        ];

  // A barra de baixo do celular não comporta hierarquia: achata tudo e mostra
  // os cinco primeiros. O resto continua acessível pela lateral no desktop.
  // Com Produtos sob o Dashboard, quatro empurravam o Suporte para fora.
  const itensMobile = itens
    .flatMap((i) => [i, ...(i.filhos ?? []).map((f) => ({ ...f, icon: Receipt }))])
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-60 shrink-0 border-r bg-card px-4 py-6 md:block">
        <div className="flex items-center gap-2 px-2">
          <BarChart3 className="size-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">Painel Demonstração</span>
        </div>
        <nav className="mt-8 space-y-1">
          {itens.map((i) => (
            <div key={i.to}>
              <Link
                to={i.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  pathname === i.to && "bg-secondary text-foreground",
                )}
              >
                <i.icon className="size-4" />
                {i.label}
              </Link>
              {i.filhos?.map((f) => (
                <Link
                  key={f.to}
                  to={f.to}
                  className={cn(
                    "ml-7 flex items-center rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    pathname === f.to && "bg-secondary text-foreground",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-8 border-t pt-4">
          <p className="px-3 text-sm font-medium">{perfil?.nome}</p>
          <p className="px-3 text-xs text-muted-foreground">Administrador</p>
          <p className="mt-3 px-3 text-[11px] leading-snug text-muted-foreground">
            Demonstração com dados fictícios, gerados no navegador.
          </p>
        </div>
      </aside>

      <div className="flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <span className="flex items-center gap-2 font-semibold">
            <BarChart3 className="size-4 text-primary" /> Painel Demonstração
          </span>
        </header>
        {/* O kanban do suporte precisa de quatro colunas lado a lado; em 5xl
            elas ficam estreitas a ponto de o nome do cliente quebrar em três
            linhas. `larga` abre a caixa só para quem precisa. */}
        <main
          className={cn(
            "mx-auto w-full px-4 py-5 md:px-8 md:py-8",
            larga ? "max-w-[1600px]" : "max-w-5xl",
          )}
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card md:hidden">
        {itensMobile.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground",
              pathname === i.to && "text-primary",
            )}
          >
            <i.icon className="size-5" />
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
