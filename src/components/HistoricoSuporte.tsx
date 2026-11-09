import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { consultaResumoMes, extratoDoMes } from "@/components/BonificacaoSuporte";
import { formatBRL } from "@/lib/format";
import { hojeISO } from "@/lib/semana";
import { inicioMes } from "@/lib/useFinanceiro";
import { INICIO_CONTRATO, mesDoPedido, mesesDoHistorico } from "@/lib/reembolso";

/**
 * O suporte mês a mês.
 *
 * Duas famílias de número na mesma linha, cada uma pela data que faz sentido
 * para ela:
 * - o trabalho do mês (pedidos que chegaram, revertidos, perdidos, valor
 *   salvo) conta pelo mês em que o pedido de reembolso chegou;
 * - comissão e bônus seguem a regra do suporte: a comissão conta no mês da reversão,
 *   e a taxa usa os pedidos vendidos e os reembolsos concluídos no mês. Vêm
 *   da mesma `suporte_resumo_mes` da tela do mês, para os dois números nunca
 *   discordarem.
 */

type SolicitacaoHistorico = {
  status: string;
  valor: number | null;
  solicitado_em: string;
};

function nomeDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function HistoricoSuporte({
  solicitacoes,
  carregando,
}: {
  solicitacoes: SolicitacaoHistorico[];
  carregando: boolean;
}) {
  const hoje = hojeISO();
  const mesAtual = inicioMes(hoje);
  const meses = useMemo(
    () =>
      mesesDoHistorico(
        solicitacoes.map((s) => s.solicitado_em),
        hoje,
      ),
    [solicitacoes, hoje],
  );
  const resumos = useQueries({ queries: meses.map((m) => consultaResumoMes(m)) });

  const linhas = meses.map((mes, i) => {
    const doMes = solicitacoes.filter((s) => mesDoPedido(s.solicitado_em) === mes);
    const revertidos = doMes.filter((s) => s.status === "revertida");
    const perdidos = doMes.filter((s) => s.status === "perdida");
    const decididos = revertidos.length + perdidos.length;
    const resumo = resumos[i]?.data;
    return {
      mes,
      recebidos: doMes.length,
      revertidos: revertidos.length,
      perdidos: perdidos.length,
      aproveitamento: decididos > 0 ? revertidos.length / decididos : null,
      salvo: revertidos.reduce((t, s) => t + (s.valor ?? 0), 0),
      extrato: resumo ? extratoDoMes(resumo, hoje) : null,
      carregandoExtrato: resumos[i]?.isLoading ?? false,
    };
  });

  const bonusDoMes = (e: NonNullable<(typeof linhas)[number]["extrato"]>) => {
    if (e.bonus.taxa === null) return "—";
    if (e.bonus.abaixoDoPiso) return "abaixo de 250 pedidos";
    const valor = e.bonus.faixa?.bonus ?? 0;
    return valor > 0 ? formatBRL(valor) : "sem bônus";
  };

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div>
          <p className="text-sm font-medium">Histórico do suporte</p>
          <p className="text-xs text-muted-foreground">
            Pedidos de reembolso, reversões, comissão e bônus, mês a mês.
          </p>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Pedidos de reembolso</TableHead>
                  <TableHead className="text-right">Revertidos</TableHead>
                  <TableHead className="text-right">Perdidos</TableHead>
                  <TableHead className="text-right">Aproveitamento</TableHead>
                  <TableHead className="text-right">Valor salvo</TableHead>
                  <TableHead className="text-right">Comissão confirmada</TableHead>
                  <TableHead className="text-right">Pedidos vendidos</TableHead>
                  <TableHead className="text-right">Reembolsos</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.mes}>
                    <TableCell className="whitespace-nowrap">
                      <span className="capitalize">{nomeDoMes(l.mes)}</span>
                      {l.mes === mesAtual && (
                        <span className="ml-1 text-xs text-muted-foreground">(parcial)</span>
                      )}
                      {l.mes < INICIO_CONTRATO && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (antes da regra atual)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{l.recebidos}</TableCell>
                    <TableCell className="tabular text-right">{l.revertidos}</TableCell>
                    <TableCell className="tabular text-right">{l.perdidos}</TableCell>
                    <TableCell className="tabular text-right">
                      {l.aproveitamento === null ? "—" : `${Math.round(l.aproveitamento * 100)}%`}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatBRL(l.salvo)}</TableCell>
                    {l.extrato ? (
                      <>
                        <TableCell className="tabular whitespace-nowrap text-right">
                          {formatBRL(l.extrato.confirmado)}
                          {l.extrato.carencia > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              + {formatBRL(l.extrato.carencia)} em carência
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="tabular text-right">{l.extrato.bonus.vendas}</TableCell>
                        <TableCell className="tabular text-right">
                          {l.extrato.bonus.reembolsos}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {l.extrato.bonus.taxa === null
                            ? "—"
                            : `${l.extrato.bonus.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`}
                        </TableCell>
                        <TableCell className="tabular whitespace-nowrap text-right">
                          {bonusDoMes(l.extrato)}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
                        {l.carregandoExtrato ? "Carregando…" : "Não foi possível carregar o mês."}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-1 text-[11px] text-muted-foreground">
          <p>
            Pedidos de reembolso, revertidos, perdidos e valor salvo contam pelo mês em que o
            pedido chegou. Aproveitamento é revertidos ÷ (revertidos + perdidos) desses pedidos.
          </p>
          <p>
            Comissão e bônus seguem a regra do suporte: a comissão conta no mês da reversão e só confirma
            15 dias depois dela; a taxa é reembolsos concluídos ÷ pedidos vendidos no mês, e com
            menos de 250 pedidos não há bônus. O bônus ainda depende da qualidade do atendimento,
            avaliada no fechamento do mês.
          </p>
          <p>Os meses anteriores à regra atual aparecem só como referência.</p>
        </div>
      </CardContent>
    </Card>
  );
}
