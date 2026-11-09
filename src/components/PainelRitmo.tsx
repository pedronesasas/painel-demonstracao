import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatDiaMes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diasDaSemana, hojeISO } from "@/lib/semana";
import {
  apurar,
  formatPercent,
  linhasDoDia,
  type Despesa,
  type GastoTrafego,
  type Taxa,
  type Venda,
} from "@/lib/financeiro";
import { lerRitmo, linearidade, serieLinearidade, type MetaOperacao } from "@/lib/linearidade";
import { diasDoIntervalo, fimMes, inicioMes } from "@/lib/useFinanceiro";

/**
 * Indicador de linearidade do Grove: estamos no ritmo de bater a meta?
 *
 * Mês e semana lado a lado porque respondem a coisas diferentes. O mês é o
 * compromisso; a semana é a alavanca que permite corrigi-lo enquanto ainda dá
 * tempo — bater a meta do mês é consequência de semanas no ritmo, e descobrir
 * o atraso no dia 28 não serve para nada.
 */

type Props = {
  vendas: Venda[];
  taxas: Taxa[];
  gastos: GastoTrafego[];
  despesas: Despesa[];
  impostoPercentual: number;
  mensal: MetaOperacao | null;
  semanal: MetaOperacao | null;
};

/** Valor apurado dia a dia, para acumular contra a reta da meta. */
function porDia(
  dias: string[],
  vendas: Venda[],
  taxas: Taxa[],
  gastos: GastoTrafego[],
  despesas: Despesa[],
  imposto: number,
  campo: "faturamento" | "lucro",
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const dia of dias) {
    const a = apurar(
      linhasDoDia(vendas, dia),
      taxas,
      gastos.filter((g) => g.data === dia),
      despesas.filter((d) => d.data === dia),
      imposto,
      vendas,
      { inicio: dia, fim: dia },
    );
    mapa.set(dia, campo === "faturamento" ? a.faturamentoBruto : a.lucro);
  }
  return mapa;
}

export function PainelRitmo({
  vendas,
  taxas,
  gastos,
  despesas,
  impostoPercentual,
  mensal,
  semanal,
}: Props) {
  const hoje = hojeISO();

  const calc = useMemo(() => {
    const diasMes = diasDoIntervalo(inicioMes(hoje), fimMes(hoje));
    const diasSemana = diasDaSemana(hoje);

    // Faturamento é a meta padrão do gráfico: é o número que move a decisão do
    // dia (escalar ou segurar tráfego). O lucro aparece ao lado como par.
    const usaLucro = mensal?.meta_faturamento == null && mensal?.meta_lucro != null;
    const campo = usaLucro ? ("lucro" as const) : ("faturamento" as const);
    const metaMes = (usaLucro ? mensal?.meta_lucro : mensal?.meta_faturamento) ?? 0;

    const valoresMes = porDia(diasMes, vendas, taxas, gastos, despesas, impostoPercentual, campo);
    const realizadoMes = diasMes
      .filter((d) => d <= hoje)
      .reduce((s, d) => s + (valoresMes.get(d) ?? 0), 0);

    const decorridosMes = diasMes.filter((d) => d <= hoje).length;

    const metaSemana =
      (usaLucro ? semanal?.meta_lucro : semanal?.meta_faturamento) ??
      semanal?.meta_faturamento ??
      semanal?.meta_lucro ??
      0;
    const realizadoSemana = diasSemana
      .filter((d) => d <= hoje)
      .reduce((s, d) => s + (valoresMes.get(d) ?? 0), 0);
    const decorridosSemana = diasSemana.filter((d) => d <= hoje).length;

    return {
      campo,
      mes: metaMes > 0 ? linearidade(metaMes, realizadoMes, decorridosMes, diasMes.length) : null,
      semana:
        metaSemana > 0
          ? linearidade(metaSemana, realizadoSemana, decorridosSemana, diasSemana.length)
          : null,
      serie: metaMes > 0 ? serieLinearidade(diasMes, valoresMes, metaMes, hoje) : [],
    };
  }, [vendas, taxas, gastos, despesas, impostoPercentual, mensal, semanal, hoje]);

  if (!calc.mes && !calc.semana) {
    return (
      <Card>
        <CardContent className="py-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Sem meta definida</p>
          <p className="mt-1">
            Cadastre a meta do mês e da semana em Administração para acompanhar se a operação está
            no ritmo de bater — em vez de descobrir no fechamento.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rotulo = calc.campo === "lucro" ? "de lucro" : "de faturamento";

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Ritmo {rotulo}</p>
          <p className="text-xs text-muted-foreground">
            {calc.mes ? `${calc.mes.diasRestantes} dias restantes no mês` : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {calc.mes && <Ritmo titulo="Mês" l={calc.mes} rotulo="do mês" />}
          {calc.semana && <Ritmo titulo="Semana" l={calc.semana} rotulo="da semana" />}
        </div>

        {calc.serie.length > 0 && (
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calc.serie}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="data"
                  tickFormatter={formatDiaMes}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(v: number, n: string) => [formatBRL(v), n]}
                  labelFormatter={(l: string) => formatDiaMes(l)}
                />
                {/* A reta do Grove: onde o acumulado deveria estar a cada dia. */}
                <Line
                  type="linear"
                  dataKey="ideal"
                  name="No ritmo"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="realizado"
                  name="Realizado"
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Ritmo({
  titulo,
  l,
  rotulo,
}: {
  titulo: string;
  l: ReturnType<typeof linearidade>;
  rotulo: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p
          className={cn(
            "tabular text-xs font-medium",
            l.noRitmo ? "text-positivo" : "text-negativo",
          )}
        >
          {formatPercent(l.ritmo)} do ritmo
        </p>
      </div>
      <p className="tabular text-lg font-semibold">
        {formatBRL(l.realizado)}
        <span className="text-sm font-normal text-muted-foreground"> / {formatBRL(l.meta)}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{lerRitmo(l, rotulo)}</p>
      {/* Projeção é o que o Grove chama de olhar pela janela da caixa preta:
          onde o período termina se o ritmo de hoje continuar. */}
      <p className="mt-1 text-xs text-muted-foreground">
        Projeção: <span className="tabular">{formatBRL(l.projecao)}</span>
      </p>
    </div>
  );
}
