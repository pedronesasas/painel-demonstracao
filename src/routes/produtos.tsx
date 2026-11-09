import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AjudaMetrica } from "@/components/AjudaMetrica";
import { Card, CardContent } from "@/components/ui/card";
import { SeletorPeriodo } from "@/components/SeletorPeriodo";
import { useAuth } from "@/lib/useAuth";
import { MESES, formatBRL } from "@/lib/format";
import { PLATAFORMA_LABEL, formatPercent } from "@/lib/financeiro";
import { hojeISO } from "@/lib/semana";
import { periodosPadrao, rotuloPeriodo, useFinanceiro, type Periodo } from "@/lib/useFinanceiro";
import { useItensDasFaturas } from "@/lib/useProdutos";
import {
  INICIO_DOS_DADOS,
  abrirFaturas,
  apurarPorProduto,
  comparacaoMensal,
  conversaoDosBumps,
  conversaoMensal,
  mesesDaComparacao,
  type ConversaoDosBumps,
  type LinhaProduto,
  type Mes,
} from "@/lib/produtos";
import type { ChaveMetrica } from "@/lib/glossario";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Painel Demonstração" },
      {
        name: "description",
        content:
          "Vendas, reembolsos, faturamento e conversão dos order bumps de cada produto, no período e mês a mês.",
      },
      { property: "og:title", content: "Produtos — Painel Demonstração" },
      {
        property: "og:description",
        content: "Vendas, reembolsos, faturamento e order bumps de cada produto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Produtos />
    </AppLayout>
  ),
});

function Produtos() {
  const { gestao } = useAuth();
  const opcoes = useMemo(() => periodosPadrao(), []);
  const [periodo, setPeriodo] = useState<Periodo>(opcoes[4]!); // este mês

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
        <p className="text-sm text-muted-foreground">
          Quanto cada produto vendeu, devolveu e deixou de faturamento, e quantos clientes levaram
          os order bumps.
        </p>
      </div>

      <SeletorPeriodo opcoes={opcoes} periodo={periodo} onMudar={setPeriodo} />

      <DoPeriodo periodo={periodo} />
      <MesAMes />

      <div className="space-y-1 text-[11px] text-muted-foreground">
        <p>
          A conta é a mesma do Dashboard, feita produto a produto: a linha Total bate com o
          faturamento da tela principal no mesmo período.
        </p>
        <p>
          Anúncio e despesa não entram, porque não existe dado que diga quanto do anúncio levou a
          cada produto. Por isso a conta para no faturamento líquido.
        </p>
        <p>
          Vendas conta cada produto: um pedido com order bump soma uma venda no principal e uma no
          order bump. A Plataforma B manda a compra inteira numa fatura só, e o painel separa os produtos
          pelo preço de cada oferta. Quando a fatura não traz esse detalhe, o order bump fica somado ao
          produto principal.
        </p>
        <p>
          Nomes escritos de jeitos diferentes, com maiúscula, acento ou espaço a mais, contam como o
          mesmo produto.
        </p>
        <p>
          O painel recebe só as vendas da Plataforma A e da Plataforma B. O que é vendido em outras
          plataformas não aparece aqui.
        </p>
      </div>
    </div>
  );
}

function DoPeriodo({ periodo }: { periodo: Periodo }) {
  const financeiro = useFinanceiro(periodo);
  const itens = useItensDasFaturas(periodo);

  const calc = useMemo(() => {
    const dados = financeiro.data;
    if (!dados || !itens.data) return null;
    const abertas = abrirFaturas(dados.vendas, itens.data);
    return {
      porProduto: apurarPorProduto(
        abertas.vendas,
        dados.taxas,
        dados.impostoPercentual,
        dados.universo,
        periodo,
      ),
      bumps: conversaoDosBumps(abertas, periodo),
    };
  }, [financeiro.data, itens.data, periodo]);

  const estado = financeiro.isError || itens.isError ? "erro" : calc ? "pronto" : "carregando";

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="text-sm font-medium">Por produto — {rotuloPeriodo(periodo)}</p>
            <p className="text-xs text-muted-foreground">
              A venda conta no dia em que foi aprovada, e o reembolso no dia do estorno.
            </p>
            {periodo.inicio < INICIO_DOS_DADOS && (
              <p className="mt-1 text-xs text-abaixo">
                Este período começa antes dos dados da demonstração: os dias anteriores aparecem
                vazios.
              </p>
            )}
          </div>

          {estado !== "pronto" || !calc ? (
            <Estado estado={estado} />
          ) : calc.porProduto.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma venda em {rotuloPeriodo(periodo)}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Produto</th>
                    <Coluna>Vendas</Coluna>
                    <Coluna ajuda="precoMedio">Preço médio</Coluna>
                    <Coluna ajuda="reembolsos">Reembolsos</Coluna>
                    <Coluna ajuda="faturamentoBruto">Faturamento bruto</Coluna>
                    <Coluna ajuda="faturamentoLiquido">Faturamento líquido</Coluna>
                    <Coluna ajuda="participacao">Participação</Coluna>
                  </tr>
                </thead>
                <tbody>
                  {calc.porProduto.linhas.map((l) => (
                    <LinhaDaTabela key={l.chave} linha={l} />
                  ))}
                </tbody>
                <tfoot>
                  <LinhaDaTabela linha={calc.porProduto.total} total />
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              Order bumps — {rotuloPeriodo(periodo)}
              <AjudaMetrica metrica="conversaoBump" />
            </p>
            <p className="text-xs text-muted-foreground">
              Em quantos pedidos de cada produto o cliente levou também o order bump.
            </p>
          </div>
          {estado !== "pronto" || !calc ? (
            <Estado estado={estado} />
          ) : (
            <BumpsDoPeriodo conversao={calc.bumps} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Estado({ estado }: { estado: "erro" | "carregando" | "pronto" }) {
  return (
    <p className="text-sm text-muted-foreground">
      {estado === "erro" ? "Não foi possível carregar as vendas." : "Carregando…"}
    </p>
  );
}

function Coluna({ children, ajuda }: { children: ReactNode; ajuda?: ChaveMetrica }) {
  return (
    <th className="px-2 py-2 text-right font-medium">
      <span className="inline-flex items-center gap-1">
        {children}
        {ajuda && <AjudaMetrica metrica={ajuda} />}
      </span>
    </th>
  );
}

function LinhaDaTabela({ linha: l, total = false }: { linha: LinhaProduto; total?: boolean }) {
  return (
    <tr className={cn("align-top", total ? "border-t font-semibold" : "border-b last:border-0")}>
      <td className="px-2 py-2">
        <span className="block">{l.nome}</span>
        {!total && (
          <span className="text-xs font-normal text-muted-foreground">
            {l.plataformas.map((p) => PLATAFORMA_LABEL[p]).join(" · ")}
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular">{l.vendas}</td>
      <td className="px-2 py-2 text-right tabular">
        {l.precoMedio === null ? "—" : formatBRL(l.precoMedio)}
      </td>
      <td className="px-2 py-2 text-right tabular">
        {l.reembolsos === 0 ? (
          "—"
        ) : (
          <>
            {l.reembolsos}
            {l.taxaReembolso !== null && (
              <span className="font-normal text-muted-foreground">
                {" "}
                ({formatPercent(l.taxaReembolso)})
              </span>
            )}
            <span className="block text-xs font-normal text-muted-foreground">
              {formatBRL(l.valorReembolsado)}
            </span>
          </>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular">{formatBRL(l.faturamentoBruto)}</td>
      <td className="px-2 py-2 text-right tabular">{formatBRL(l.faturamentoLiquido)}</td>
      <td className="px-2 py-2 text-right tabular">
        {l.participacao === null ? "—" : formatPercent(l.participacao)}
      </td>
    </tr>
  );
}

function pedidos(n: number): string {
  return `${n} ${n === 1 ? "pedido" : "pedidos"}`;
}

function SemDetalhe({ quantos }: { quantos: number }) {
  if (quantos === 0) return null;
  const um = quantos === 1;
  return (
    <p className="text-xs text-muted-foreground">
      {pedidos(quantos)} da Plataforma B {um ? "importado" : "importados"} por planilha, antes da integração,{" "}
      {um ? "não tem" : "não têm"} o detalhe da fatura e {um ? "ficou" : "ficaram"} fora desta
      conta.
    </p>
  );
}

function BumpsDoPeriodo({ conversao }: { conversao: ConversaoDosBumps }) {
  const comBump = conversao.produtos.filter((p) => p.bumps.length > 0);
  const semBump = conversao.produtos.filter((p) => p.bumps.length === 0);

  if (conversao.produtos.length === 0) {
    return (
      <>
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum pedido no período.</p>
        <SemDetalhe quantos={conversao.semDetalhe} />
      </>
    );
  }

  return (
    <div className="space-y-2">
      {comBump.map((p) => (
        <div key={p.chave} className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">
            {p.nome}{" "}
            <span className="font-normal text-muted-foreground">· {pedidos(p.pedidos)}</span>
          </p>
          <ul className="mt-1 space-y-0.5">
            {p.bumps.map((b) => (
              <li key={b.chave} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{b.nome}</span>
                <span className="shrink-0 tabular">
                  <span className="font-semibold">{formatPercent(b.taxa)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({b.pedidos} de {p.pedidos})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {semBump.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sem order bump no período:{" "}
          {semBump.map((p) => `${p.nome} (${pedidos(p.pedidos)})`).join(" · ")}.
        </p>
      )}
      <SemDetalhe quantos={conversao.semDetalhe} />
    </div>
  );
}

function nomeDoMes(m: Mes): { mes: string; ano: string } {
  const [ano, mes] = m.inicio.split("-");
  return { mes: MESES[Number(mes) - 1] ?? mes!, ano: ano! };
}

function CabecalhoDosMeses({ meses, primeira }: { meses: Mes[]; primeira: string }) {
  const mesAtual = `${hojeISO().slice(0, 7)}-01`;
  return (
    <thead>
      <tr className="border-b text-xs text-muted-foreground">
        <th className="px-2 py-2 text-left font-medium">{primeira}</th>
        {meses.map((m) => {
          const { mes, ano } = nomeDoMes(m);
          return (
            <th key={m.inicio} className="px-2 py-2 text-right font-medium">
              <span className="block">{mes}</span>
              <span className="font-normal">
                {ano}
                {m.inicio === mesAtual && " (parcial)"}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function MesAMes() {
  const hoje = hojeISO();
  const meses = useMemo(() => mesesDaComparacao(hoje), [hoje]);
  const janela = useMemo<Periodo>(
    () => ({ inicio: meses[0]!.inicio, fim: meses[meses.length - 1]!.fim, rotulo: "Mês a mês" }),
    [meses],
  );
  const financeiro = useFinanceiro(janela);
  const itens = useItensDasFaturas(janela);

  const calc = useMemo(() => {
    const dados = financeiro.data;
    if (!dados || !itens.data) return null;
    const abertas = abrirFaturas(dados.universo, itens.data);
    return {
      faturamento: comparacaoMensal(abertas.vendas, dados.taxas, dados.impostoPercentual, meses),
      bumps: conversaoMensal(abertas, meses),
    };
  }, [financeiro.data, itens.data, meses]);

  const estado = financeiro.isError || itens.isError ? "erro" : calc ? "pronto" : "carregando";
  const largura = { minWidth: 240 + meses.length * 130 };
  const semDetalhe = calc
    ? meses
        .map((m, i) => ({
          mes: nomeDoMes(m).mes.toLowerCase(),
          quantos: calc.bumps.semDetalhe[i]!,
        }))
        .filter((m) => m.quantos > 0)
    : [];

  return (
    <>
      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="text-sm font-medium">Faturamento mês a mês</p>
            <p className="text-xs text-muted-foreground">
              Faturamento bruto e vendas de cada produto, desde o primeiro mês com as vendas
              completas no painel.
            </p>
          </div>

          {estado !== "pronto" || !calc ? (
            <Estado estado={estado} />
          ) : calc.faturamento.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={largura}>
                <CabecalhoDosMeses meses={meses} primeira="Produto" />
                <tbody>
                  {calc.faturamento.linhas.map((l) => (
                    <tr key={l.chave} className="border-b last:border-0 align-top">
                      <td className="px-2 py-2">{l.nome}</td>
                      {l.meses.map((c, i) => (
                        <td key={meses[i]!.inicio} className="px-2 py-2 text-right tabular">
                          {c === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {formatBRL(c.faturamentoBruto)}
                              <span className="block text-xs text-muted-foreground">
                                {c.vendas} {c.vendas === 1 ? "venda" : "vendas"}
                              </span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold align-top">
                    <td className="px-2 py-2">Total</td>
                    {calc.faturamento.totais.map((c, i) => (
                      <td key={meses[i]!.inicio} className="px-2 py-2 text-right tabular">
                        {formatBRL(c.faturamentoBruto)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {c.vendas} {c.vendas === 1 ? "venda" : "vendas"}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="flex items-center gap-1 text-sm font-medium">
              Order bumps mês a mês
              <AjudaMetrica metrica="conversaoBump" />
            </p>
            <p className="text-xs text-muted-foreground">
              A conversão de cada order bump sobre os pedidos do produto principal, mês a mês.
            </p>
          </div>

          {estado !== "pronto" || !calc ? (
            <Estado estado={estado} />
          ) : calc.bumps.linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum order bump vendido ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={largura}>
                <CabecalhoDosMeses meses={meses} primeira="Order bump" />
                <tbody>
                  {calc.bumps.linhas.map((l) => (
                    <tr key={l.chave} className="border-b last:border-0 align-top">
                      <td className="px-2 py-2">
                        <span className="block">{l.bump}</span>
                        <span className="text-xs text-muted-foreground">
                          nos pedidos de {l.principal}
                        </span>
                      </td>
                      {l.meses.map((c, i) => (
                        <td key={meses[i]!.inicio} className="px-2 py-2 text-right tabular">
                          {c === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {formatPercent(c.taxa)}
                              <span className="block text-xs text-muted-foreground">
                                {c.comBump} de {c.pedidos}
                              </span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {semDetalhe.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ficaram fora da conta, por não terem o detalhe da fatura:{" "}
              {semDetalhe.map((m) => `${pedidos(m.quantos)} da Plataforma B em ${m.mes}`).join(", ")}. São
              as vendas importadas por planilha, antes da integração.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
