import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeletorPeriodo } from "@/components/SeletorPeriodo";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatDiaMes, formatHaQuantoTempo } from "@/lib/format";
import { periodosPadrao, rotuloPeriodo, useFinanceiro, type Periodo } from "@/lib/useFinanceiro";
import { movimentoPorEtapa, useDataCrazy } from "@/lib/useDataCrazy";
import { cn } from "@/lib/utils";

/**
 * O andamento do dia, do lado de quem vende.
 *
 * O Dashboard responde "a operação está saudável". Esta tela responde a
 * pergunta que vem antes: "o dia está andando". São coisas diferentes — dá
 * para ter margem boa no mês e o dia de hoje estar parado, e quem descobre no
 * fechamento já não tem o que fazer.
 *
 * O conteúdo é o que a gestão cobra todo dia no grupo, e nada além disso:
 * quanto vendeu, quem está esperando resposta, o que entrou na fila, quantos
 * leads chegaram e quais checkouts ficaram pelo caminho.
 *
 * É tela de liderança. A vendedora tem o painel dela.
 */

export const Route = createFileRoute("/vendedora")({
  head: () => ({
    meta: [
      { title: "Vendedora — Painel Demonstração" },
      {
        name: "description",
        content: "O andamento do dia: fila de atendimento, leads, vendas e checkouts pendentes.",
      },
      { property: "og:title", content: "Vendedora — Painel Demonstração" },
      { property: "og:description", content: "O andamento do dia: fila de atendimento, leads, vendas e checkouts pendentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Vendedora />
    </AppLayout>
  ),
});

function Vendedora() {
  const { gestao } = useAuth();
  const opcoes = useMemo(() => periodosPadrao(), []);
  const [periodo, setPeriodo] = useState<Periodo>(opcoes[0]!);

  const { data: fin, isLoading: carregandoFin } = useFinanceiro(periodo);
  const { data: crm, isLoading: carregandoCrm } = useDataCrazy(14);

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  const vendas = fin?.vendas ?? [];
  const aprovadas = vendas.filter((v) => v.status === "aprovada");
  const bruto = aprovadas.reduce((s, v) => s + v.valor_bruto, 0);
  const pedidos = new Set(aprovadas.map((v) => v.pedido_externo_id ?? v.id)).size;

  // Checkout começou e não terminou. É o campo mais trabalhoso do fechamento
  // dela — hoje conferido na mão, plataforma por plataforma, no fim do turno.
  const naoConcluidas = vendas.filter((v) => v.status === "pendente" || v.status === "nao_paga");
  const valorNaoConcluido = naoConcluidas.reduce((s, v) => s + v.valor_bruto, 0);

  const trafego = (fin?.gastos ?? []).reduce((s, g) => s + g.valor, 0);

  const ultimo = crm?.ultimo ?? null;
  const etapas = movimentoPorEtapa(ultimo, crm?.nomeDaEtapa ?? ((i) => i));

  // Custo por lead. Só sai com os dois lados: sem gasto, não há custo; sem
  // lead, a divisão não existe. Mostrar zero em qualquer um dos casos seria
  // inventar um número bom.
  const leads = ultimo?.leads_do_dia ?? null;
  const cpl = leads !== null && leads > 0 && trafego > 0 ? trafego / leads : null;

  const serie = (crm?.serie ?? []).map((s) => ({
    dia: formatDiaMes(s.colhido_dia),
    naoIniciados: s.conversas_unstarted,
    atrasados: s.atrasadas_24h,
    leads: s.leads_do_dia,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vendedora</h1>
        <p className="text-sm text-muted-foreground">
          O andamento do dia. O Dashboard diz se a operação está saudável; esta tela diz se hoje
          está andando — e dá para agir enquanto ainda dá.
        </p>
      </div>

      <SeletorPeriodo opcoes={opcoes} periodo={periodo} onMudar={setPeriodo} />

      {/* ---------- o que ela vendeu ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          titulo="Vendido"
          valor={formatBRL(bruto)}
          rodape={`${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"} em ${rotuloPeriodo(periodo)}`}
          ajuda="faturamentoBruto"
        />
        <Numero
          titulo="Ticket médio"
          valor={pedidos > 0 ? formatBRL(bruto / pedidos) : "—"}
          rodape="por pedido aprovado"
          ajuda="ticketMedio"
        />
        <Numero
          titulo="Leads hoje"
          valor={leads === null ? "—" : String(leads)}
          rodape={ultimo ? "chegaram no CRM" : "sem coleta ainda"}
        />
        <Numero
          titulo="Custo por lead"
          valor={cpl === null ? "—" : formatBRL(cpl)}
          rodape={
            cpl === null ? "precisa de lead e de gasto no dia" : `${formatBRL(trafego)} em anúncios`
          }
          ajuda="cpa"
        />
      </div>

      {/* ---------- o que está pegando fogo agora ---------- */}
      {ultimo && (
        <>
          {(ultimo.atrasadas_24h ?? 0) > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                <strong>
                  {ultimo.atrasadas_24h} {ultimo.atrasadas_24h === 1 ? "lead está" : "leads estão"}{" "}
                  esperando resposta
                </strong>{" "}
                há mais de 15 minutos e ainda dentro do dia — ainda dá para voltar neles. O prazo
                combinado é de 15 minutos depois que o lead escreve.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero
              titulo="Não iniciados"
              valor={txt(ultimo.conversas_unstarted)}
              rodape="chegaram e ninguém abriu"
              alerta={(ultimo.conversas_unstarted ?? 0) > 5}
            />
            <Numero
              titulo="Aguardando"
              valor={txt(ultimo.conversas_waiting)}
              rodape="na fila de atendimento"
            />
            <Numero
              titulo="Esperando resposta"
              valor={txt(ultimo.esperando_24h)}
              rodape="a bola está com a gente"
              alerta={(ultimo.atrasadas_24h ?? 0) > 0}
            />
            <Numero
              titulo="Abandonadas"
              valor={txt(
                ultimo.esperando_resposta === null || ultimo.esperando_24h === null
                  ? null
                  : ultimo.esperando_resposta - ultimo.esperando_24h,
              )}
              rodape="paradas há mais de um dia"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Fila do CRM coletada {formatHaQuantoTempo(ultimo.colhido_em)}.
            {ultimo.erro && (
              <span className="ml-1 text-destructive">A última coleta veio incompleta.</span>
            )}
          </p>
        </>
      )}

      {!carregandoCrm && !ultimo && (
        <Card>
          <CardContent className="flex items-start gap-3 py-5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma coleta do CRM ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A fila de atendimento, os leads do dia e o custo por lead vêm da coleta automática do
                CRM, que roda de 15 em 15 minutos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- o que entrou na fila ---------- */}
      {etapas.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Entrou na fila hoje</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Negócios que mudaram de etapa no dia. O total parado em cada etapa é outra coisa — são
              dezenas de milhares acumulados, e não dizem o que fazer hoje.
            </p>
            <div className="flex flex-wrap gap-2">
              {etapas.map((e) => (
                <Badge key={e.nome} variant="secondary" className="text-sm font-normal">
                  {e.nome} <strong className="ml-1.5">{e.quantos}</strong>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- a linha, que é o ponto da tela ---------- */}
      {serie.length > 1 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium">Últimos {serie.length} dias</p>
            <p className="mb-3 text-xs text-muted-foreground">
              É a série que os checklists no WhatsApp produziam todo dia e ninguém conseguia ler: uma
              piora lenta só aparece quando os dias ficam lado a lado.
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      fontSize: 12,
                    }}
                  />
                  {/* `connectNulls` fica desligado: dia sem coleta tem que
                      aparecer como buraco. Uma linha contínua sobre um dia que
                      não foi medido afirma um número que ninguém apurou. */}
                  <Line
                    type="monotone"
                    dataKey="naoIniciados"
                    name="Não iniciados"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="atrasados"
                    name="Atrasados"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="leads"
                    name="Leads"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- checkout que ficou pelo caminho ---------- */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Checkout iniciado e não concluído</p>
            <p className="tabular text-sm font-semibold">{formatBRL(valorNaoConcluido)}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pix e boleto gerados que ainda não foram pagos, e cobranças recusadas. É o que ela hoje
            confere na mão, plataforma por plataforma, no fim do turno.
          </p>

          {carregandoFin && <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>}

          {!carregandoFin && naoConcluidas.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Nada pendente em {rotuloPeriodo(periodo)}.
            </p>
          )}

          {naoConcluidas.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {naoConcluidas.slice(0, 12).map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-1.5 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1">
                    {v.cliente_nome ?? "Sem nome"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {v.produto_nome ?? "—"}
                    </span>
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {v.status === "pendente" ? "aguardando pagamento" : "não paga"}
                  </Badge>
                  <span className="tabular shrink-0 font-medium">{formatBRL(v.valor_bruto)}</span>
                </div>
              ))}
              {naoConcluidas.length > 12 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  e mais {naoConcluidas.length - 12}. A lista completa está em Vendas, filtrando por
                  status.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Nulo não é zero: "não medi" e "não tem" levam a decisões diferentes. */
const txt = (n: number | null) => (n === null ? "—" : String(n));

function Numero({
  titulo,
  valor,
  rodape,
  ajuda,
  alerta,
}: {
  titulo: string;
  valor: string;
  rodape: string;
  ajuda?: Parameters<typeof AjudaMetrica>[0]["metrica"];
  alerta?: boolean;
}) {
  return (
    <Card className={cn(alerta && "border-destructive/50")}>
      <CardContent className="py-4">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {titulo}
          {ajuda && <AjudaMetrica metrica={ajuda} />}
        </p>
        <p className={cn("tabular text-2xl font-semibold", alerta && "text-destructive")}>
          {valor}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>
      </CardContent>
    </Card>
  );
}
