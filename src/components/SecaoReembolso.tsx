import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { addDias, hojeISO } from "@/lib/semana";
import { fimMes, inicioMes } from "@/lib/useFinanceiro";
import { useReembolsoMensal } from "@/lib/useReembolso";
import { PLATAFORMAS, PLATAFORMA_LABEL } from "@/lib/financeiro";
import type { Recorte } from "@/lib/recorte";
import {
  FAIXAS,
  contarPedidos,
  eventosDoMes,
  progressoBonus,
  serieAcumulada,
  taxaContrato,
  type LinhaReembolso,
} from "@/lib/reembolso";

/** Abaixo disto a taxa acumulada ainda pula muito de um dia para o outro. */
const POUCAS_VENDAS = 30;

function nomeMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return new Date(ano!, mes! - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
}

function formatTaxa(t: number | null): string {
  if (t === null) return "—";
  return `${t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPontos(p: number): string {
  const abs = Math.abs(p).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${abs} ${Math.abs(p) === 1 ? "ponto" : "pontos"}`;
}

/**
 * Taxa de reembolso pela régua de bônus do suporte.
 *
 * Sempre do mês inteiro — é o mês que a regra apura —, o mês em que termina
 * o período escolhido na dashboard. As faixas do bônus aparecem só na visão
 * da operação inteira, porque é sobre ela que o bônus é calculado.
 */
export function SecaoReembolso({ fimPeriodo, recorte }: { fimPeriodo: string; recorte: Recorte }) {
  const mesInicio = inicioMes(fimPeriodo);
  const { data: linhas, isLoading } = useReembolsoMensal(mesInicio);

  if (isLoading || !linhas) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Carregando reembolsos…
        </CardContent>
      </Card>
    );
  }
  return <Conteudo linhas={linhas} mesInicio={mesInicio} recorte={recorte} />;
}

function Conteudo({
  linhas,
  mesInicio,
  recorte,
}: {
  linhas: LinhaReembolso[];
  mesInicio: string;
  recorte: Recorte;
}) {
  const hoje = hojeISO();
  const mesFim = fimMes(mesInicio);
  const anteriorInicio = inicioMes(addDias(mesInicio, -1));
  const anteriorFim = fimMes(anteriorInicio);
  // No mês corrente, só até hoje; mês fechado vai até o último dia.
  const ateDia =
    mesInicio === inicioMes(hoje) ? Number(hoje.slice(8, 10)) : Number(mesFim.slice(8, 10));

  const calc = useMemo(() => {
    const doMes = (p: Recorte, ini: string, fim: string) => eventosDoMes(linhas, ini, fim, p);

    const resumo = (p: Recorte) => {
      const { vendidos, reembolsados } = doMes(p, mesInicio, mesFim);
      const vendas = contarPedidos(vendidos);
      const reembolsos = contarPedidos(reembolsados);
      return { vendas, reembolsos, taxa: taxaContrato(reembolsos, vendas) };
    };

    const atual = doMes(recorte, mesInicio, mesFim);
    const anterior = doMes(recorte, anteriorInicio, anteriorFim);
    const serieAtual = serieAcumulada(mesInicio, ateDia, atual.vendidos, atual.reembolsados);
    const serieAnterior = serieAcumulada(
      anteriorInicio,
      31,
      anterior.vendidos,
      anterior.reembolsados,
    );

    const dados = Array.from(
      { length: Math.max(serieAtual.length, serieAnterior.length) },
      (_, i) => ({
        dia: i + 1,
        atual: serieAtual[i]?.taxa ?? null,
        anterior: serieAnterior[i]?.taxa ?? null,
      }),
    );

    // Mesmo dia do mês nos dois lados: comparar o mês pela metade com o mês
    // anterior inteiro faria qualquer começo de mês parecer bom.
    const hojeAtual = serieAtual[serieAtual.length - 1]?.taxa ?? null;
    const mesmoDiaAntes = serieAnterior[Math.min(ateDia, serieAnterior.length) - 1]?.taxa ?? null;
    const diferenca =
      hojeAtual !== null && mesmoDiaAntes !== null ? hojeAtual - mesmoDiaAntes : null;

    const total = resumo("todas");
    return {
      total,
      porPlataforma: PLATAFORMAS.map((p) => ({ p, ...resumo(p) })),
      dados,
      diferenca,
      vendasNoRecorte: contarPedidos(atual.vendidos),
      bonus: progressoBonus(total.vendas, total.reembolsos),
      maxTaxa: Math.max(6, ...dados.flatMap((d) => [d.atual ?? 0, d.anterior ?? 0])),
    };
  }, [linhas, mesInicio, mesFim, anteriorInicio, anteriorFim, ateDia, recorte]);

  const { total, porPlataforma, dados, diferenca, vendasNoRecorte, bonus, maxTaxa } = calc;
  const mes = nomeMes(mesInicio);
  const mesAntes = nomeMes(anteriorInicio);
  const operacao = recorte === "todas";

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <p className="text-sm font-medium">Reembolso — {mes}</p>
          <p className="text-xs text-muted-foreground">
            Pela régua de bônus do suporte: reembolsos concluídos no mês ÷ vendas aprovadas no
            mês, contando pedidos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Taxa
            titulo="Operação"
            taxa={total.taxa}
            rodape={`${total.reembolsos} de ${total.vendas} vendas`}
            destaque={operacao}
          />
          {porPlataforma.map((r) => (
            <Taxa
              key={r.p}
              titulo={PLATAFORMA_LABEL[r.p]}
              taxa={r.taxa}
              rodape={`${r.reembolsos} de ${r.vendas} vendas`}
              destaque={recorte === r.p}
            />
          ))}
        </div>

        {diferenca !== null && (
          <p className="text-sm">
            {operacao ? "A operação está" : `${PLATAFORMA_LABEL[recorte]} está`}{" "}
            {Math.abs(diferenca) < 0.005 ? (
              <strong>igual a {mesAntes}</strong>
            ) : (
              // Reembolso subir é ruim: vermelho, mesmo sendo "para cima".
              <strong className={diferenca > 0 ? "text-negativo" : "text-positivo"}>
                {diferenca > 0 ? "▲" : "▼"} {formatPontos(diferenca)}{" "}
                {diferenca > 0 ? "acima" : "abaixo"} de {mesAntes}
              </strong>
            )}{" "}
            no mesmo dia do mês.
          </p>
        )}

        {operacao && total.vendas > 0 && <Bonus bonus={bonus} />}

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, Math.ceil(maxTaxa)]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number, n: string) => [formatTaxa(v), n]}
                labelFormatter={(d: number) => `Dia ${d}`}
              />
              {/* As faixas do bônus: onde o mês precisa ficar para pagar. */}
              {operacao &&
                FAIXAS.filter((f) => f.teto !== null).map((f) => (
                  <ReferenceLine
                    key={f.bonus}
                    y={f.teto!}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="2 4"
                    strokeOpacity={0.5}
                    label={{
                      value: formatBRL(f.bonus),
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                ))}
              <Line
                type="monotone"
                dataKey="anterior"
                name={mesAntes}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="atual"
                name={mes}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">
          Linha cheia: {mes}, acumulado até cada dia. Tracejada: {mesAntes}.
          {vendasNoRecorte < POUCAS_VENDAS &&
            " Com poucas vendas no mês, a taxa ainda pula bastante de um dia para o outro."}
        </p>
      </CardContent>
    </Card>
  );
}

function Taxa({
  titulo,
  taxa,
  rodape,
  destaque,
}: {
  titulo: string;
  taxa: number | null;
  rodape: string;
  destaque: boolean;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", destaque && "border-foreground/30")}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="tabular text-lg font-semibold">{formatTaxa(taxa)}</p>
      <p className="text-xs text-muted-foreground">{rodape}</p>
    </div>
  );
}

function Bonus({ bonus }: { bonus: ReturnType<typeof progressoBonus> }) {
  return (
    <div className="rounded-lg border bg-secondary/40 px-3 py-2.5 text-sm">
      <p>
        Bônus do suporte se o mês fechasse hoje:{" "}
        <strong>{bonus.faixa ? formatBRL(bonus.faixa.bonus) : "—"}</strong>
        {bonus.faixa && <span className="text-muted-foreground"> ({bonus.faixa.rotulo})</span>}
      </p>
      {bonus.proxima && bonus.cabemNaProxima !== null && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Para {formatBRL(bonus.proxima.bonus)}: com as vendas de hoje cabem até{" "}
          {bonus.cabemNaProxima} reembolsos no mês (hoje são {bonus.reembolsos})
          {bonus.vendasParaProxima !== null &&
            bonus.vendasParaProxima > 0 &&
            `, ou mais ${bonus.vendasParaProxima} vendas sem reembolso novo`}
          .
        </p>
      )}
      {bonus.abaixoDoPiso && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Abaixo de 250 vendas no mês o bônus não é apurado — faltam {bonus.faltamParaPiso}.
        </p>
      )}
    </div>
  );
}
