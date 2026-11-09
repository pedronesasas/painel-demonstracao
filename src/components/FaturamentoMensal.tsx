import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, maskMoeda, parseMoeda, MESES } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Os meses fechados antes de o painel existir.
 *
 * Estes números são INFORMADOS — alguém digitou, vindos da planilha da
 * operação. Os meses a partir da entrada do painel são APURADOS: cada venda chega
 * pelo webhook com taxa, juros e status reais, e a cascata é recalculada
 * item a item.
 *
 * A tela diz qual é qual, e isso não é preciosismo. Misturar dado medido com
 * dado digitado apaga a única informação que separa um número em que se
 * confia de um número que alguém lembrou de outro jeito — e o apagamento é
 * silencioso.
 *
 * Por isso os meses históricos não entram na apuração do painel. Eles vivem
 * aqui, comparáveis lado a lado, sem se confundir.
 */

type Mes = {
  mes: string;
  faturamento_bruto: number;
  ads: number;
  despesas: number;
  folha: number;
  impostos: number;
  retiradas: number;
  observacao: string | null;
};

const CAMPOS = [
  { chave: "faturamento_bruto", rotulo: "Faturamento", dica: "vendido no mês" },
  { chave: "ads", rotulo: "Anúncios", dica: "gasto com tráfego" },
  { chave: "despesas", rotulo: "Despesas", dica: "ferramentas e estrutura" },
  { chave: "folha", rotulo: "Folha", dica: "salários e comissões" },
  { chave: "impostos", rotulo: "Impostos", dica: "do mês" },
  { chave: "retiradas", rotulo: "Retiradas", dica: "das sócias" },
] as const;

type Chave = (typeof CAMPOS)[number]["chave"];

/**
 * Acesso à tabela, com o tipo declarado aqui.
 *
 * `src/integrations/supabase/types.ts` é gerado a partir do banco, e o Lovable
 * só o regenera depois de aplicar a migration — então, até lá, a tabela não
 * existe para o TypeScript.
 *
 * O molde fica isolado nesta função em vez de espalhado em cada chamada: são
 * três operações no arquivo, e um `as` solto em cada uma é onde um nome de
 * coluna errado passaria sem ninguém ver. Quando os tipos forem regenerados,
 * some daqui e nada mais precisa mudar.
 */
const tabela = () =>
  supabase.from("faturamento_mensal" as never) as unknown as {
    select: (cols: string) => {
      order: (
        col: string,
        o: { ascending: boolean },
      ) => PromiseLike<{ data: Record<string, unknown>[] | null; error: Error | null }>;
    };
    upsert: (v: Mes, o: { onConflict: string }) => PromiseLike<{ error: Error | null }>;
    delete: () => {
      eq: (col: string, val: string) => PromiseLike<{ error: Error | null }>;
    };
  };

const vazio = (mes: string): Mes => ({
  mes,
  faturamento_bruto: 0,
  ads: 0,
  despesas: 0,
  folha: 0,
  impostos: 0,
  retiradas: 0,
  observacao: null,
});

/** Primeiro dia do mês anterior ao mais antigo já cadastrado, ou do passado. */
function proximoMesVago(existentes: Mes[]): string {
  if (existentes.length === 0) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const maisAntigo = existentes[0]!.mes;
  const [ano, mes] = maisAntigo.split("-").map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return `${MESES[mes! - 1]} de ${ano}`;
}

export function FaturamentoMensal() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Mes | null>(null);

  const { data, isLoading } = useQuery<Mes[]>({
    queryKey: ["faturamento-mensal"],
    queryFn: async () => {
      const { data, error } = await tabela()
        .select("mes, faturamento_bruto, ads, despesas, folha, impostos, retiradas, observacao")
        .order("mes", { ascending: true });
      if (error) throw error;
      // `numeric` volta como string do Postgres, para não perder precisão.
      // Sem o Number() aqui as somas da tela virariam concatenação de texto.
      return (data ?? []).map((linha) => {
        const m = linha as unknown as Mes;
        return {
          ...m,
          faturamento_bruto: Number(m.faturamento_bruto),
          ads: Number(m.ads),
          despesas: Number(m.despesas),
          folha: Number(m.folha),
          impostos: Number(m.impostos),
          retiradas: Number(m.retiradas),
        };
      });
    },
  });

  const salvar = useMutation({
    mutationFn: async (m: Mes) => {
      const { error } = await tabela().upsert(m, { onConflict: "mes" });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["faturamento-mensal"] });
      setEditando(null);
      toast.success("Mês salvo");
    },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });

  const apagar = useMutation({
    mutationFn: async (mes: string) => {
      const { error } = await tabela().delete().eq("mes", mes);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["faturamento-mensal"] });
      toast.success("Mês removido");
    },
    onError: (e: Error) => toast.error(`Não removeu: ${e.message}`),
  });

  const meses = data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="max-w-2xl">
            <p className="font-medium">Meses anteriores</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Números <strong>informados</strong>, vindos da planilha da operação. Desde que entrou
              no ar, o painel <strong>apura</strong> venda a venda, pelos webhooks — por isso esses
              meses ficam aqui em vez de virarem vendas falsas, que produziriam taxa e imposto
              inventados e sujariam a lista de vendas.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setEditando(vazio(proximoMesVago(meses)))}
            disabled={editando !== null}
          >
            <Plus className="size-4" /> Adicionar mês
          </Button>
        </CardContent>
      </Card>

      {editando && (
        <Editor
          valor={editando}
          onMudar={setEditando}
          onSalvar={() => salvar.mutate(editando)}
          onCancelar={() => setEditando(null)}
          salvando={salvar.isPending}
          jaExiste={meses.some((m) => m.mes === editando.mes)}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && meses.length === 0 && !editando && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="font-medium">Nenhum mês anterior cadastrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sem eles, o painel só enxerga do primeiro mês integrado em diante — e não há com o que comparar.
            </p>
          </CardContent>
        </Card>
      )}

      {meses.length > 1 && <Resumo meses={meses} />}

      {meses.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto py-2">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Mês</th>
                  <th className="px-2 py-2 text-right font-medium">Faturamento</th>
                  <th className="px-2 py-2 text-right font-medium">Anúncios</th>
                  <th className="px-2 py-2 text-right font-medium">Despesas</th>
                  <th className="px-2 py-2 text-right font-medium">Folha</th>
                  <th className="px-2 py-2 text-right font-medium">Impostos</th>
                  <th className="px-2 py-2 text-right font-medium">Lucro</th>
                  <th className="px-2 py-2 text-right font-medium">Retiradas</th>
                  <th className="px-2 py-2 text-right font-medium">Sobrou</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => {
                  // Duas linhas de lucro, e a distinção é a mesma da cascata:
                  // o "lucro" do painel é antes das sócias; o que a planilha
                  // chama de lucro líquido é depois. Mostrar só um dos dois
                  // faria duas colunas com o mesmo nome medirem coisas
                  // diferentes.
                  const lucro = m.faturamento_bruto - (m.ads + m.despesas + m.folha + m.impostos);
                  const sobrou = lucro - m.retiradas;
                  return (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-2 py-2">{rotuloMes(m.mes)}</td>
                      <td className="tabular px-2 py-2 text-right font-medium">
                        {formatBRL(m.faturamento_bruto)}
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(m.ads)}
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(m.despesas)}
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(m.folha)}
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(m.impostos)}
                      </td>
                      <td
                        className={cn(
                          "tabular px-2 py-2 text-right font-medium",
                          lucro < 0 && "text-destructive",
                        )}
                      >
                        {formatBRL(lucro)}
                      </td>
                      <td className="tabular px-2 py-2 text-right text-muted-foreground">
                        {formatBRL(m.retiradas)}
                      </td>
                      <td
                        className={cn(
                          "tabular px-2 py-2 text-right",
                          sobrou < 0 && "font-medium text-destructive",
                        )}
                      >
                        {formatBRL(sobrou)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditando(m)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-muted-foreground"
                          aria-label={`Remover ${rotuloMes(m.mes)}`}
                          onClick={() => {
                            if (confirm(`Remover ${rotuloMes(m.mes)}?`)) apagar.mutate(m.mes);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
              <strong>Lucro</strong> é antes das retiradas das sócias — é a linha que o painel usa.{" "}
              <strong>Sobrou</strong> é depois delas, que é o &ldquo;lucro líquido&rdquo; da
              planilha. As duas aparecem porque medem coisas diferentes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * O que os meses juntos dizem, e um mês sozinho não diz.
 *
 * O peso das retiradas aparece aqui de propósito. Elas são fixas em R$ 10.000
 * por sócia e o lucro oscila, então a proporção varia muito de um mês para o
 * outro — em junho passou de 100%, que é a definição de retirar mais do que a
 * operação gerou. Isso não se enxerga olhando um mês por vez, que é como a
 * planilha é lida.
 */
function Resumo({ meses }: { meses: Mes[] }) {
  const soma = (f: (m: Mes) => number) => meses.reduce((s, m) => s + f(m), 0);

  const faturamento = soma((m) => m.faturamento_bruto);
  const lucro = soma((m) => m.faturamento_bruto - (m.ads + m.despesas + m.folha + m.impostos));
  const retiradas = soma((m) => m.retiradas);
  const sobrou = lucro - retiradas;

  const negativos = meses.filter(
    (m) => m.faturamento_bruto - (m.ads + m.despesas + m.folha + m.impostos + m.retiradas) < 0,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini
          titulo="Faturamento médio"
          valor={formatBRL(faturamento / meses.length)}
          rodape={`${meses.length} meses · ${formatBRL(faturamento)} no total`}
        />
        <Mini
          titulo="Lucro médio"
          valor={formatBRL(lucro / meses.length)}
          rodape={`${Math.round((lucro / faturamento) * 100)}% do faturamento, antes das sócias`}
        />
        <Mini
          titulo="Peso das retiradas"
          valor={`${Math.round((retiradas / lucro) * 100)}%`}
          rodape={`${formatBRL(retiradas)} sobre ${formatBRL(lucro)} de lucro`}
          alerta={retiradas / lucro > 0.7}
        />
        <Mini
          titulo="Sobrou na operação"
          valor={formatBRL(sobrou)}
          rodape={`${Math.round((sobrou / faturamento) * 100)}% do faturamento`}
          alerta={sobrou < 0}
        />
      </div>

      {negativos.length > 0 && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <strong>
            {negativos.length === 1
              ? `${rotuloMes(negativos[0]!.mes)} fechou negativo`
              : `${negativos.length} meses fecharam negativos`}
          </strong>{" "}
          depois das retiradas. Elas são fixas e o lucro oscila — nesses meses saiu mais do que a
          operação gerou.
        </p>
      )}
    </div>
  );
}

function Mini({
  titulo,
  valor,
  rodape,
  alerta,
}: {
  titulo: string;
  valor: string;
  rodape: string;
  alerta?: boolean;
}) {
  return (
    <Card className={cn(alerta && "border-destructive/50")}>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("tabular text-xl font-semibold", alerta && "text-destructive")}>{valor}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{rodape}</p>
      </CardContent>
    </Card>
  );
}

function Editor({
  valor,
  onMudar,
  onSalvar,
  onCancelar,
  salvando,
  jaExiste,
}: {
  valor: Mes;
  onMudar: (m: Mes) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
  jaExiste: boolean;
}) {
  const lucro =
    valor.faturamento_bruto - (valor.ads + valor.despesas + valor.folha + valor.impostos);

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-44">
            <Label htmlFor="mes">Mês</Label>
            <Input
              id="mes"
              type="month"
              value={valor.mes.slice(0, 7)}
              onChange={(e) => onMudar({ ...valor, mes: `${e.target.value}-01` })}
            />
          </div>
          {jaExiste && (
            <p className="text-xs text-muted-foreground">
              Já existe lançamento neste mês — salvar substitui.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS.map((c) => (
            <div key={c.chave}>
              <Label htmlFor={c.chave}>{c.rotulo}</Label>
              <Input
                id={c.chave}
                inputMode="numeric"
                value={maskMoeda(String(Math.round(valor[c.chave as Chave] * 100)))}
                onChange={(e) =>
                  onMudar({ ...valor, [c.chave]: parseMoeda(e.target.value) } as Mes)
                }
              />
              <p className="mt-0.5 text-xs text-muted-foreground">{c.dica}</p>
            </div>
          ))}
        </div>

        <div>
          <Label htmlFor="obs">Observação</Label>
          <Input
            id="obs"
            value={valor.observacao ?? ""}
            placeholder="De onde vieram os números"
            onChange={(e) => onMudar({ ...valor, observacao: e.target.value || null })}
          />
        </div>

        {/* O lucro aparece enquanto se digita: é como se percebe um zero a
            mais antes de salvar, e não três meses depois. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-sm">
            Lucro antes das sócias:{" "}
            <strong className={cn("tabular", lucro < 0 && "text-destructive")}>
              {formatBRL(lucro)}
            </strong>
            <span className="ml-2 text-muted-foreground">
              · sobra {formatBRL(lucro - valor.retiradas)} depois das retiradas
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button onClick={onSalvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar mês"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
