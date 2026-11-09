import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { cn } from "@/lib/utils";
import { DIAS_SEMANA, formatBRL, formatDiaMes } from "@/lib/format";
import { formatPercent } from "@/lib/financeiro";
import { fromISO } from "@/lib/semana";
import { diasDoIntervalo, fimMes, inicioMes } from "@/lib/useFinanceiro";
import { useGastoPorConta } from "@/lib/useGastoPorConta";
import {
  apurarPorConta,
  eixoReais,
  fimDoPeriodo,
  marcasDoEixo,
  seriesDoGrafico,
  valorDaSerie,
  type ApuracaoPorConta,
  type DiaPorConta,
  type SerieConta,
} from "@/lib/gastoPorConta";
import type { ChaveMetrica } from "@/lib/glossario";

/**
 * Cores das contas, na ordem em que são distribuídas.
 *
 * São as cinco do tema, reordenadas. Na ordem natural, a 4 e a 5 — dois
 * amarelos — ficariam vizinhas na pilha, e quem tem daltonismo não separa as
 * duas. Nesta ordem, cores vizinhas continuam distinguíveis também em
 * protanopia e deuteranopia (conferido por simulação), inclusive contra o
 * cinza do "Sem conta identificada", que vai no topo da pilha.
 */
const CORES = [
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-5)",
] as const;

/** O gasto que ninguém explica: cinza, para não disputar atenção com as contas. */
const CINZA = { cor: "var(--muted-foreground)", opacidade: 0.5 };

type SerieComCor = SerieConta & { cor: string };

/**
 * A aba "Por conta" de Custos: de qual conta de anúncios veio o gasto da Meta.
 *
 * Só lê. O gasto por conta entra por integração, puxado da UTMify; o gasto
 * lançado continua sendo o da aba Anúncios, e continua sendo o oficial. Esta
 * tela mostra quanto dele cada conta explica — e onde não explica.
 */
export function GastoPorConta({ mesRef, hoje }: { mesRef: string; hoje: string }) {
  const inicio = inicioMes(mesRef);
  const fim = fimDoPeriodo(fimMes(mesRef), hoje);
  const { data, error, isLoading, isPlaceholderData } = useGastoPorConta(inicio, fim);

  const apuracao = useMemo(
    () =>
      data
        ? apurarPorConta(data.lancados, data.contas, diasDoIntervalo(data.inicio, data.fim))
        : null,
    [data],
  );

  if (error) {
    // Tabela que não existe no banco (PGRST205 no PostgREST, 42P01 no
    // Postgres): o app foi publicado antes de a migration ser aplicada. É o
    // erro mais provável aqui, e o texto em inglês não diz o que fazer.
    const codigo = (error as { code?: string }).code ?? "";
    const semTabela = codigo === "PGRST205" || codigo === "42P01";
    return (
      <Card className="border-negativo/40">
        <CardContent className="py-6 text-sm">
          <p className="font-medium">Não carregou o gasto por conta.</p>
          {semTabela && (
            <p className="mt-1">
              A tabela do gasto por conta ainda não foi criada no banco. Avise quem cuida do painel.
            </p>
          )}
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !apuracao) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className={cn("space-y-4 transition-opacity", isPlaceholderData && "opacity-60")}>
      {apuracao.contas.length === 0 ? (
        <Vazio totalLancado={apuracao.totalLancado} />
      ) : (
        <Conteudo apuracao={apuracao} />
      )}
      <p className="text-xs text-muted-foreground">
        Só Meta Ads. Fonte: UTMify, que enxerga apenas as contas de anúncio habilitadas nela — o
        gasto das outras aparece como “Sem conta identificada”. Valores sem a taxa de 12% da Meta,
        como o gasto lançado.
      </p>
    </div>
  );
}

function Vazio({ totalLancado }: { totalLancado: number }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="font-medium">Nenhum gasto por conta neste mês</p>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {totalLancado > 0
            ? `O gasto lançado em Meta Ads soma ${formatBRL(totalLancado)}, e ainda não há gasto por conta para detalhá-lo.`
            : "Também não há gasto com Meta Ads lançado neste mês."}{" "}
          O gasto por conta é carregado a partir da UTMify; esta aba só mostra.
        </p>
      </CardContent>
    </Card>
  );
}

function Conteudo({ apuracao }: { apuracao: ApuracaoPorConta }) {
  const { totalLancado, totalIdentificado, semConta, contas, diasSemConta } = apuracao;

  const series = useMemo<SerieComCor[]>(
    () => seriesDoGrafico(contas, CORES.length).map((s, i) => ({ ...s, cor: CORES[i]! })),
    [contas],
  );
  // Conta juntada em "Outras contas" usa a cor da série que a juntou.
  const corDaConta = useMemo(
    () => new Map(series.flatMap((s) => s.contaIds.map((id) => [id, s.cor] as const))),
    [series],
  );

  const fatia = (v: number) => (totalLancado > 0 ? formatPercent(v / totalLancado) : "—");
  const parciais = contas.filter((c) => c.parcial).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao
          titulo="Gasto lançado"
          ajuda="gastoLancado"
          valor={formatBRL(totalLancado)}
          rodape="Meta Ads, o total oficial"
        />
        <Cartao
          titulo="Identificado por conta"
          ajuda="gastoIdentificado"
          valor={formatBRL(totalIdentificado)}
          rodape={totalLancado > 0 ? `${fatia(totalIdentificado)} do lançado` : "sem gasto lançado"}
        />
        <Cartao
          titulo="Sem conta identificada"
          ajuda="semContaIdentificada"
          valor={formatBRL(semConta)}
          rodape={
            semConta > 0
              ? `${fatia(semConta)} do lançado · ${diasSemConta} ${diasSemConta === 1 ? "dia" : "dias"}`
              : totalLancado > 0
                ? "todo o lançado tem conta"
                : "sem gasto lançado"
          }
        />
        <Cartao
          titulo="Contas com gasto"
          valor={String(contas.length)}
          rodape={parciais > 0 ? `${parciais} com dia ainda parcial` : "nenhum dia parcial"}
        />
      </div>

      {apuracao.diasComExcedente.length > 0 && <AvisoExcedente apuracao={apuracao} />}

      <TabelaContas apuracao={apuracao} corDaConta={corDaConta} />

      <GraficoDiario apuracao={apuracao} series={series} />
    </>
  );
}

function Cartao({
  titulo,
  valor,
  rodape,
  ajuda,
}: {
  titulo: string;
  valor: string;
  rodape: string;
  ajuda?: ChaveMetrica | undefined;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {titulo}
          {ajuda && <AjudaMetrica metrica={ajuda} />}
        </p>
        <p className="text-xl font-semibold tabular">{valor}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Dias em que as contas somam MAIS que o gasto lançado.
 *
 * Não é defeito da conta: acontece quando o gasto de uma conta entrou no total
 * do dia só depois, ou ainda não entrou. Mas é o caso que mais importa
 * conferir — o lucro do painel usa o lançado, e gasto que falta nele deixa o
 * lucro maior do que foi.
 *
 * O dia parcial fica na lista, mas marcado: o de hoje cai aqui quando o gasto
 * por conta é puxado depois do lançado, ou antes de lançar, e isso se resolve
 * na reconferência do dia fechado.
 */
function AvisoExcedente({ apuracao }: { apuracao: ApuracaoPorConta }) {
  const { diasComExcedente, excedente } = apuracao;
  const n = diasComExcedente.length;
  const algumParcial = diasComExcedente.some((d) => d.parcial);

  return (
    <Card className="border-abaixo/40 bg-abaixo-soft">
      <CardContent className="flex gap-3 py-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-abaixo" />
        <div className="space-y-2 text-sm">
          <div>
            <p className="font-medium">Contas acima do gasto lançado</p>
            <p className="text-muted-foreground">
              Em {n === 1 ? "um dia" : `${n} dias`} as contas somam mais que o gasto lançado.
              Acontece quando o gasto de uma conta entrou no total do dia só depois — ou ainda não
              entrou. Vale conferir na aba Anúncios: se faltar gasto no lançado, o lucro do painel
              fica maior do que foi.
            </p>
          </div>
          <ul className="space-y-0.5">
            {diasComExcedente.map((d) => (
              <li key={d.data} className="tabular">
                <span className="font-medium">{formatDiaMes(d.data)}</span>
                {d.parcial && (
                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                    parcial
                  </Badge>
                )}{" "}
                — contas {formatBRL(d.identificado)}, lançado {formatBRL(d.lancado)}:{" "}
                <span className="font-medium text-negativo">{formatBRL(d.excedente)} a mais</span>
              </li>
            ))}
          </ul>
          {algumParcial && (
            <p className="text-xs text-muted-foreground">
              Dia parcial ainda vai ser reconferido depois de fechar, e a diferença dele pode sumir.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Por isso, identificado por conta mais sem conta passa do gasto lançado em{" "}
            {formatBRL(excedente)}.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function TabelaContas({
  apuracao,
  corDaConta,
}: {
  apuracao: ApuracaoPorConta;
  corDaConta: Map<string, string>;
}) {
  const { contas, totalLancado, semConta, diasSemConta, diasComLancado } = apuracao;
  const fatia = (v: number) => (totalLancado > 0 ? formatPercent(v / totalLancado) : "—");

  return (
    <Card>
      <CardContent className="overflow-x-auto py-4">
        <p className="mb-3 text-sm font-medium">Por conta</p>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Conta</th>
              <th className="px-2 py-2 text-right font-medium">Gasto no mês</th>
              <th className="px-2 py-2 text-right font-medium">% do lançado</th>
              <th className="px-2 py-2 text-right font-medium">Dias com gasto</th>
              <th className="px-2 py-2 text-left font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.contaId} className="border-b">
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <Amostra cor={corDaConta.get(c.contaId) ?? CINZA.cor} />
                    <span
                      className="block max-w-[10rem] truncate sm:max-w-[16rem] lg:max-w-[24rem]"
                      title={`${c.nome} (${c.contaId})`}
                    >
                      {c.nome}
                    </span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular font-medium">{formatBRL(c.valor)}</td>
                <td className="px-2 py-1.5 text-right tabular">
                  {c.participacao === null ? "—" : formatPercent(c.participacao)}
                </td>
                <td className="px-2 py-1.5 text-right tabular">{c.diasComGasto}</td>
                <td className="px-2 py-1.5">
                  {c.parcial ? (
                    <Badge variant="outline" className="text-[10px]">
                      parcial
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">fechado</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="text-muted-foreground">
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <Amostra cor={CINZA.cor} opacidade={CINZA.opacidade} />
                  Sem conta identificada
                </span>
              </td>
              <td className="px-2 py-1.5 text-right tabular">{formatBRL(semConta)}</td>
              <td className="px-2 py-1.5 text-right tabular">{fatia(semConta)}</td>
              <td className="px-2 py-1.5 text-right tabular">{diasSemConta}</td>
              <td className="px-2 py-1.5" />
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-2 py-2">Gasto lançado</td>
              <td className="px-2 py-2 text-right tabular">{formatBRL(totalLancado)}</td>
              <td className="px-2 py-2 text-right tabular">{fatia(totalLancado)}</td>
              <td className="px-2 py-2 text-right tabular">{diasComLancado}</td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function GraficoDiario({
  apuracao,
  series,
}: {
  apuracao: ApuracaoPorConta;
  series: SerieComCor[];
}) {
  const linhas = useMemo(
    () =>
      apuracao.dias.map((d) => {
        const linha: Record<string, string | number> = { data: d.data, semConta: d.semConta };
        for (const s of series) linha[s.chave] = valorDaSerie(d, s);
        return linha;
      }),
    [apuracao.dias, series],
  );
  const porDia = useMemo(
    () => new Map(apuracao.dias.map((d) => [d.data, d] as const)),
    [apuracao.dias],
  );
  // A pilha de cada dia é o maior entre o lançado e a soma das contas.
  const marcas = useMemo(
    () => marcasDoEixo(Math.max(0, ...apuracao.dias.map((d) => d.identificado + d.semConta))),
    [apuracao.dias],
  );

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="text-sm font-medium">Dia a dia</p>
          <p className="text-xs text-muted-foreground">
            Uma cor por conta. Em cinza, o gasto lançado que nenhuma conta explica.
          </p>
        </div>

        <div className="h-64" role="img" aria-label="Gasto em anúncio por conta, dia a dia">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={linhas}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="data"
                tickFormatter={formatDiaMes}
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={56}
                ticks={marcas}
                domain={[0, marcas[marcas.length - 1] ?? 0]}
                interval={0}
                tickFormatter={eixoReais}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, label }) => {
                  const dia = porDia.get(String(label));
                  return active && dia ? <DetalheDoDia dia={dia} series={series} /> : null;
                }}
              />
              {/* A primeira série fica na base da pilha. A borda da cor do cartão
                  é o respiro de 2px entre um pedaço e outro. */}
              {series.map((s) => (
                <Bar
                  key={s.chave}
                  dataKey={s.chave}
                  name={s.nome}
                  stackId="gasto"
                  fill={s.cor}
                  stroke="var(--card)"
                  strokeWidth={2}
                  maxBarSize={24}
                />
              ))}
              <Bar
                dataKey="semConta"
                name="Sem conta identificada"
                stackId="gasto"
                fill={CINZA.cor}
                fillOpacity={CINZA.opacidade}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.chave} className="flex min-w-0 items-center gap-1.5">
              <Amostra cor={s.cor} />
              <span className="max-w-[14rem] truncate" title={s.nome}>
                {s.nome}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <Amostra cor={CINZA.cor} opacidade={CINZA.opacidade} />
            Sem conta identificada
          </li>
        </ul>

        <TabelaDiaria dias={apuracao.dias} series={series} />
      </CardContent>
    </Card>
  );
}

/** O que o gráfico mostra ao passar o mouse, de cima para baixo como a pilha. */
function DetalheDoDia({ dia, series }: { dia: DiaPorConta; series: SerieComCor[] }) {
  const dow = (fromISO(dia.data).getDay() + 6) % 7; // 0 = segunda
  const partes = [...series]
    .reverse()
    .map((s) => ({ s, valor: valorDaSerie(dia, s) }))
    .filter((p) => p.valor > 0);

  return (
    <div className="max-w-xs space-y-1.5 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">
        {formatDiaMes(dia.data)} <span className="text-muted-foreground">{DIAS_SEMANA[dow]}</span>
        {dia.parcial && <span className="text-muted-foreground"> · parcial</span>}
      </p>
      <ul className="space-y-0.5">
        {dia.semConta > 0 && (
          <LinhaDetalhe
            cor={CINZA.cor}
            opacidade={CINZA.opacidade}
            valor={dia.semConta}
            rotulo="Sem conta identificada"
          />
        )}
        {partes.map(({ s, valor }) => (
          <LinhaDetalhe key={s.chave} cor={s.cor} valor={valor} rotulo={s.nome} />
        ))}
      </ul>
      <p className="border-t pt-1.5 text-muted-foreground">
        Lançado: <strong className="tabular text-foreground">{formatBRL(dia.lancado)}</strong>
      </p>
      {dia.excedente > 0 && (
        <p className="text-negativo">Contas passam do lançado em {formatBRL(dia.excedente)}</p>
      )}
    </div>
  );
}

function LinhaDetalhe({
  cor,
  opacidade,
  valor,
  rotulo,
}: {
  cor: string;
  opacidade?: number | undefined;
  valor: number;
  rotulo: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-0.5 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: cor, opacity: opacidade }}
      />
      <strong className="tabular">{formatBRL(valor)}</strong>
      <span className="min-w-0 truncate text-muted-foreground">{rotulo}</span>
    </li>
  );
}

/**
 * Os mesmos números do gráfico, em tabela. Recolhida de propósito: é para
 * conferir um dia ou ler sem depender de cor e de mouse, não para olhar sempre.
 */
function TabelaDiaria({ dias, series }: { dias: DiaPorConta[]; series: SerieComCor[] }) {
  return (
    <details>
      <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
        Ver os números dia a dia
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Dia</th>
              {series.map((s) => (
                <th key={s.chave} className="px-2 py-2 text-right font-medium">
                  <span className="ml-auto flex max-w-[9rem] items-center justify-end gap-1.5">
                    <Amostra cor={s.cor} />
                    <span className="truncate" title={s.nome}>
                      {s.nome}
                    </span>
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Sem conta</th>
              <th className="px-2 py-2 text-right font-medium">Lançado</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr
                key={d.data}
                className={cn("border-b last:border-0", d.excedente > 0 && "bg-abaixo-soft")}
              >
                <td className="whitespace-nowrap px-2 py-1.5">
                  {formatDiaMes(d.data)}
                  {d.parcial && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      parcial
                    </Badge>
                  )}
                </td>
                {series.map((s) => {
                  const v = valorDaSerie(d, s);
                  return (
                    <td key={s.chave} className="px-2 py-1.5 text-right tabular">
                      {v > 0 ? formatBRL(v) : "—"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right tabular text-muted-foreground">
                  {d.semConta > 0 ? formatBRL(d.semConta) : "—"}
                </td>
                <td
                  className={cn(
                    "px-2 py-1.5 text-right tabular font-medium",
                    d.excedente > 0 && "text-negativo",
                  )}
                  title={
                    d.excedente > 0
                      ? `As contas passam do lançado em ${formatBRL(d.excedente)}`
                      : undefined
                  }
                >
                  {/* Com excedente, o zero é a informação: mostra o valor. */}
                  {d.lancado > 0 || d.excedente > 0 ? formatBRL(d.lancado) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Amostra({ cor, opacidade }: { cor: string; opacidade?: number | undefined }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-sm"
      style={{ backgroundColor: cor, opacity: opacidade }}
    />
  );
}
