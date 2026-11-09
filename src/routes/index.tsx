import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PainelSemana } from "@/components/PainelSemana";
import { useAuth } from "@/lib/useAuth";
import { hojeISO } from "@/lib/semana";

/**
 * A porta de entrada, que só encaminha.
 *
 * O endereço raiz é o que as pessoas têm salvo, então
 * ele precisa levar cada uma para a sua tela. Antes ele mostrava o painel de
 * metas semanais para todo mundo — quem entrava como admin caía numa tela de
 * vendedora, com faixa de comissão e "lançar venda de hoje", que não é a
 * função dela.
 *
 * Tirar o item do menu não bastava: o menu não controla o endereço raiz.
 */

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel Demonstração" },
      {
        name: "description",
        content: "Entrada do painel: cada pessoa é levada para a sua área.",
      },
      { property: "og:title", content: "Painel Demonstração" },
      { property: "og:description", content: "Entrada do painel: cada pessoa é levada para a sua área." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppLayout>
      <Conteudo />
    </AppLayout>
  );
}

function Conteudo() {
  const { perfil, papel, gestao, carregando } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (carregando) return;
    // Liderança entra pela saúde da operação, que é o que ela vem ver.
    if (gestao) void navigate({ to: "/dashboard", replace: true });
    // Suporte só tem uma tela, e é essa.
    else if (papel === "suporte") void navigate({ to: "/suporte", replace: true });
  }, [carregando, gestao, papel, navigate]);

  if (carregando || gestao || papel === "suporte") {
    return <p className="text-muted-foreground">Abrindo seu painel…</p>;
  }

  if (!perfil) return null;

  // `semTrava` é falso porque só vendedora chega aqui: a janela de lançamento
  // (hoje e ontem) vale para ela. A liderança edita pela tela da equipe.
  return (
    <PainelSemana vendedoraId={perfil.id} nome={perfil.nome} refISO={hojeISO()} semTrava={false} />
  );
}
