import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Copy, MessageCircle, Phone } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { BonificacaoSuporte } from "@/components/BonificacaoSuporte";
import { HistoricoSuporte } from "@/components/HistoricoSuporte";
import { linkWhatsApp } from "@/lib/contato";
import type { ChaveMetrica } from "@/lib/glossario";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDataHora, formatHaQuantoTempo } from "@/lib/format";
import { PLATAFORMA_LABEL, type Plataforma } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

/**
 * Kanban das solicitações de reembolso.
 *
 * A janela em que o suporte trabalha é estreita e conhecida: na Plataforma B, um
 * `refund_request.created` não derruba a venda — a fatura continua paga até a
 * solicitação ser aceita. É entre esses dois eventos que dá para ligar para o
 * cliente e reverter. Na Plataforma A, o card nasce da reclamação (`claimCreated`)
 * e fecha como perdido quando o estorno da venda chega.
 *
 * Por isso a tela é organizada em torno de três coisas, nesta ordem: quanto
 * está em jogo, há quanto tempo o pedido está parado, e o motivo escrito pelo
 * cliente. As duas primeiras dizem quem ligar primeiro; a terceira é o que a
 * pessoa lê antes de discar.
 */

type Status = "aberta" | "em_contato" | "revertida" | "perdida" | "recusada";

type Solicitacao = {
  id: string;
  plataforma: string;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  produto_nome: string | null;
  valor: number | null;
  motivo_cliente: string | null;
  status: Status;
  anotacao_suporte: string | null;
  solicitado_em: string;
};

type Coluna = {
  status: Status;
  titulo: string;
  dica: string;
  /** Faixa de cor no topo da coluna, para separar as quatro de relance. */
  faixa: string;
  vazio: string;
};

const COLUNAS: Coluna[] = [
  {
    status: "aberta",
    titulo: "Abertas",
    dica: "chegaram e ninguém pegou",
    faixa: "bg-destructive",
    vazio: "Nenhum pedido esperando.",
  },
  {
    status: "em_contato",
    titulo: "Em contato",
    dica: "tentando reverter",
    faixa: "bg-amber-500",
    vazio: "Nenhuma conversa em andamento.",
  },
  {
    status: "revertida",
    titulo: "Revertidas",
    dica: "cliente desistiu",
    faixa: "bg-positivo",
    vazio: "Ainda nenhuma reversão.",
  },
  {
    status: "perdida",
    titulo: "Perdidas",
    dica: "virou estorno",
    faixa: "bg-muted-foreground",
    vazio: "Nenhuma perda registrada.",
  },
];

/** Depois disto, um pedido ainda aberto vira urgência visível. */
const HORAS_PARA_ALERTA = 12;

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte — Painel Demonstração" },
      {
        name: "description",
        content: "Solicitações de reembolso e o acompanhamento das tentativas de reversão.",
      },
      { property: "og:title", content: "Suporte — Painel Demonstração" },
      {
        property: "og:description",
        content: "Solicitações de reembolso e acompanhamento das tentativas de reversão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout larga>
      <Suporte />
    </AppLayout>
  ),
});

function Suporte() {
  const { suporte } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Solicitacao[]>({
    queryKey: ["solicitacoes-reembolso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_reembolso")
        .select(
          "id, plataforma, cliente_nome, cliente_email, cliente_telefone, produto_nome, valor, motivo_cliente, status, anotacao_suporte, solicitado_em",
        )
        .order("solicitado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        valor: s.valor === null ? null : Number(s.valor),
      })) as Solicitacao[];
    },
    enabled: suporte,
  });

  const mover = useMutation({
    mutationFn: async (v: { id: string; status: Status; anotacao?: string | undefined }) => {
      // Quem mexeu no caso fica registrado: é a prova de que houve
      // atendimento, e a regra só paga a reversão que foi trabalho do
      // suporte. Reversão que a plataforma marcou sozinha — o
      // cliente cancelou por conta própria — não tem esse registro.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("solicitacoes_reembolso")
        .update({
          status: v.status,
          ...(v.anotacao !== undefined ? { anotacao_suporte: v.anotacao } : {}),
          ...(user ? { atendido_por: user.id } : {}),
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["solicitacoes-reembolso"] });
      void qc.invalidateQueries({ queryKey: ["suporte-resumo-mes"] });
    },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });

  if (!suporte) {
    return <p className="text-muted-foreground">Esta tela é da equipe de suporte.</p>;
  }

  const porStatus = (s: Status) => (data ?? []).filter((x) => x.status === s);
  const soma = (l: Solicitacao[]) => l.reduce((s, x) => s + (x.valor ?? 0), 0);

  const abertas = porStatus("aberta");
  const emContato = porStatus("em_contato");
  const revertidas = porStatus("revertida");
  const perdidas = porStatus("perdida");

  const emJogo = soma([...abertas, ...emContato]);
  const salvo = soma(revertidas);
  const perdido = soma(perdidas);

  // Quanto do que já foi decidido acabou revertido. É a medida do trabalho do
  // suporte, e não existia em lugar nenhum antes deste painel. Só aparece
  // quando há caso decidido: 0 de 0 seria 0%, e leria como fracasso.
  const decididos = revertidas.length + perdidas.length;
  const aproveitamento = decididos > 0 ? revertidas.length / decididos : null;

  const parados = abertas.filter(
    (s) => Date.now() - new Date(s.solicitado_em).getTime() > HORAS_PARA_ALERTA * 3_600_000,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
        <p className="text-sm text-muted-foreground">
          Quem pediu reembolso e ainda dá para reverter. O pedido não cancela a venda até ser aceito
          — é essa a janela.
        </p>
      </div>

      <Tabs defaultValue="hoje" className="space-y-5">
        <TabsList>
          <TabsTrigger value="hoje">Pedidos e comissão</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="historico" className="mt-0">
          <HistoricoSuporte solicitacoes={data ?? []} carregando={isLoading} />
        </TabsContent>

        <TabsContent value="hoje" className="mt-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Resumo
              titulo="Em jogo agora"
              valor={formatBRL(emJogo)}
              rodape={`${abertas.length + emContato.length} em aberto`}
              destaque
            />
            <Resumo
              titulo="Revertido"
              valor={formatBRL(salvo)}
              rodape={`${revertidas.length} ${revertidas.length === 1 ? "cliente desistiu" : "clientes desistiram"}`}
              tom="positivo"
            />
            <Resumo
              titulo="Perdido"
              valor={formatBRL(perdido)}
              rodape={`${perdidas.length} ${perdidas.length === 1 ? "virou estorno" : "viraram estorno"}`}
            />
            <Resumo
              titulo="Aproveitamento"
              ajuda="aproveitamento"
              valor={aproveitamento === null ? "—" : `${Math.round(aproveitamento * 100)}%`}
              rodape={
                aproveitamento === null
                  ? "nenhum caso decidido ainda"
                  : `${revertidas.length} de ${decididos} decididos`
              }
              {...(aproveitamento !== null && aproveitamento >= 0.5
                ? { tom: "positivo" as const }
                : {})}
            />
          </div>

          <BonificacaoSuporte />

          {parados.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                <strong>
                  {parados.length} {parados.length === 1 ? "pedido está" : "pedidos estão"} parados
                </strong>{" "}
                há mais de {HORAS_PARA_ALERTA} horas, somando {formatBRL(soma(parados))}. A janela de
                reversão fecha quando a plataforma aceita o pedido.
              </p>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {!isLoading && (data ?? []).length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="font-medium">Nenhuma solicitação de reembolso</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elas aparecem aqui sozinhas quando um cliente abre o pedido na plataforma.
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoading && (data ?? []).length > 0 && (
            <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {COLUNAS.map((col) => {
                const casos = porStatus(col.status);
                return (
                  <section key={col.status} className="rounded-xl border bg-card/40">
                    <div className={cn("h-1 rounded-t-xl", col.faixa)} />
                    <div className="flex items-baseline justify-between gap-2 px-3 pb-2 pt-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {col.titulo}{" "}
                          <span className="font-normal text-muted-foreground">({casos.length})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{col.dica}</p>
                      </div>
                      {casos.length > 0 && (
                        <p className="tabular shrink-0 text-sm font-medium">{formatBRL(soma(casos))}</p>
                      )}
                    </div>

                    <div className="space-y-2 px-2 pb-2">
                      {casos.length === 0 ? (
                        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                          {col.vazio}
                        </p>
                      ) : (
                        casos.map((s) => (
                          <Caso
                            key={s.id}
                            s={s}
                            onMover={(status, anotacao) => mover.mutate({ id: s.id, status, anotacao })}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Copia o e-mail em vez de abrir o programa de e-mail.
 *
 * O suporte responde pelo Gmail de suporte, no navegador. O `mailto:` abria
 * o que estivesse configurado no computador — em geral nada, ou a conta
 * pessoal.
 */
async function copiarEmail(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    toast.success("E-mail copiado", { description: email });
  } catch {
    // Área de transferência bloqueada (navegador antigo, página sem foco):
    // mostra o endereço para copiar na mão em vez de falhar calado.
    toast.message("Copie o e-mail", { description: email, duration: 10_000 });
  }
}

function Caso({
  s,
  onMover,
}: {
  s: Solicitacao;
  onMover: (status: Status, anotacao?: string | undefined) => void;
}) {
  const [anotacao, setAnotacao] = useState(s.anotacao_suporte ?? "");
  const [aberto, setAberto] = useState(false);

  const horas = (Date.now() - new Date(s.solicitado_em).getTime()) / 3_600_000;
  const atrasado = s.status === "aberta" && horas > HORAS_PARA_ALERTA;
  const whatsapp = linkWhatsApp(s.cliente_telefone);

  return (
    <Card className={cn("text-sm shadow-none", atrasado && "border-destructive/50")}>
      <CardContent className="space-y-2.5 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 font-semibold leading-snug">
            {s.cliente_nome ?? "Sem nome"}
          </p>
          <p className="tabular shrink-0 text-base font-semibold">
            {s.valor === null ? "—" : formatBRL(s.valor)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
              atrasado ? "bg-destructive/15 font-medium text-destructive" : "bg-secondary",
            )}
            title={formatDataHora(s.solicitado_em)}
          >
            <Clock className="size-3" />
            {formatHaQuantoTempo(s.solicitado_em)}
          </span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5">
            {PLATAFORMA_LABEL[s.plataforma as Plataforma] ?? s.plataforma}
          </span>
        </div>

        {s.produto_nome && <p className="text-xs text-muted-foreground">{s.produto_nome}</p>}

        {s.motivo_cliente && (
          // O motivo em destaque: é o que ela lê antes de ligar.
          <p className="rounded-md border-l-2 border-muted-foreground/30 bg-secondary/60 px-2 py-1.5 text-xs italic leading-relaxed">
            “{s.motivo_cliente}”
          </p>
        )}

        {/* Quanto mais caminhos de contato, mais chance de reverter.
            WhatsApp primeiro, que é onde o cliente responde. */}
        <div className="flex flex-wrap gap-1.5">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-positivo/40 px-2 py-1 text-xs text-positivo transition-colors hover:bg-positivo/10"
            >
              <MessageCircle className="size-3" /> WhatsApp
            </a>
          )}
          {s.cliente_telefone && (
            <a
              href={`tel:${s.cliente_telefone}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
            >
              <Phone className="size-3" /> Ligar
            </a>
          )}
          {s.cliente_email && (
            <button
              type="button"
              onClick={() => void copiarEmail(s.cliente_email!)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
              title={s.cliente_email}
            >
              <Copy className="size-3" /> Copiar e-mail
            </button>
          )}
        </div>

        {aberto ? (
          <div className="space-y-2 border-t pt-2">
            <Textarea
              rows={2}
              placeholder="O que foi feito? Ex.: liguei, cliente vai testar mais uma semana."
              className="text-xs"
              value={anotacao}
              onChange={(e) => setAnotacao(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["em_contato", "Em contato"],
                  ["revertida", "Reverti"],
                  ["perdida", "Perdi"],
                ] as [Status, string][]
              ).map(([st, rot]) => (
                <Button
                  key={st}
                  size="sm"
                  variant={st === "revertida" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => {
                    onMover(st, anotacao);
                    setAberto(false);
                  }}
                >
                  {rot}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setAnotacao(s.anotacao_suporte ?? "");
                  setAberto(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 border-t pt-2">
            {s.anotacao_suporte ? (
              <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                {s.anotacao_suporte}
              </p>
            ) : (
              <span className="flex-1 text-xs text-muted-foreground/60">Sem anotação</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              onClick={() => setAberto(true)}
            >
              Atualizar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({
  titulo,
  valor,
  rodape,
  tom,
  destaque,
  ajuda,
}: {
  titulo: string;
  valor: string;
  rodape: string;
  tom?: "positivo" | undefined;
  destaque?: boolean;
  ajuda?: ChaveMetrica;
}) {
  return (
    <Card className={cn(destaque && "border-foreground/20")}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          {ajuda && <AjudaMetrica metrica={ajuda} />}
        </div>
        <p className={cn("tabular text-2xl font-semibold", tom === "positivo" && "text-positivo")}>
          {valor}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>
      </CardContent>
    </Card>
  );
}
