import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PainelSemana } from "@/components/PainelSemana";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDiaMes } from "@/lib/format";
import { addDias, hojeISO, inicioSemana } from "@/lib/semana";

export const Route = createFileRoute("/equipe/$id")({
  head: () => ({
    meta: [
      { title: "Vendedora — Painel Demonstração" },
      {
        name: "description",
        content:
          "Semana detalhada de uma vendedora, com edição de lançamentos em qualquer data pela gestora.",
      },
      { property: "og:title", content: "Vendedora — Painel Demonstração" },
      {
        property: "og:description",
        content: "Semana detalhada e edição de lançamentos da vendedora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Detalhe />
    </AppLayout>
  ),
});

function Detalhe() {
  const { id } = useParams({ from: "/equipe/$id" });
  const { gestao } = useAuth();
  const [semana, setSemana] = useState(inicioSemana(hojeISO()));

  const { data: perfil } = useQuery({
    queryKey: ["perfil", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  if (!gestao) return <p className="text-muted-foreground">Acesso restrito à gestão.</p>;
  if (!perfil) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <Link to="/equipe" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar para a equipe
      </Link>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setSemana(addDias(semana, -7))}>
          Semana anterior
        </Button>
        <span className="text-sm font-medium">
          {formatDiaMes(semana)} a {formatDiaMes(addDias(semana, 6))}
        </span>
        <Button variant="outline" size="sm" onClick={() => setSemana(addDias(semana, 7))}>
          Próxima
        </Button>
      </div>

      <PainelSemana
        vendedoraId={perfil.id}
        nome={perfil.nome}
        refISO={semana}
        semTrava
      />
    </div>
  );
}
