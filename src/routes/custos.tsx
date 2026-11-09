import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaturamentoMensal } from "@/components/FaturamentoMensal";
import { GastoPorConta } from "@/components/GastoPorConta";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatBRL, formatData, MESES, DIAS_SEMANA, maskMoeda, parseMoeda } from "@/lib/format";
import { addDias, fromISO, hojeISO } from "@/lib/semana";
import { cn } from "@/lib/utils";
import {
  CANAL_LABEL,
  CATEGORIA_LABEL,
  type CanalTrafego,
  type CategoriaDespesa,
} from "@/lib/financeiro";
import { diasDoIntervalo, fimMes, inicioMes } from "@/lib/useFinanceiro";

const CANAIS: CanalTrafego[] = ["meta", "google", "tiktok", "outro"];
const CATEGORIAS: CategoriaDespesa[] = ["ferramenta", "equipe", "estrutura", "outro"];

export const Route = createFileRoute("/custos")({
  head: () => ({
    meta: [
      { title: "Custos — Painel Demonstração" },
      {
        name: "description",
        content:
          "Lançamento do investimento diário em anúncios e das despesas adicionais da operação.",
      },
      { property: "og:title", content: "Custos — Painel Demonstração" },
      { property: "og:description", content: "Investimento em anúncios e despesas adicionais da operação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppLayout>
      <Custos />
    </AppLayout>
  ),
});

function Custos() {
  const { gestao } = useAuth();
  const hoje = hojeISO();
  const [mesRef, setMesRef] = useState(inicioMes(hoje));

  if (!gestao) {
    return <p className="text-muted-foreground">Esta tela é da gestora e do admin.</p>;
  }

  const [ano, mes] = mesRef.split("-").map(Number);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Custos</h1>
        <p className="text-sm text-muted-foreground">
          Os dois gastos que o painel não recebe sozinho. Juntos formam os gastos totais que fecham
          o lucro e o ROI.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMesRef(inicioMes(addDias(mesRef, -1)))}
        >
          Mês anterior
        </Button>
        <span className="text-sm font-medium">
          {MESES[mes! - 1]} de {ano}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMesRef(inicioMes(addDias(fimMes(mesRef), 1)))}
          disabled={mesRef >= inicioMes(hoje)}
        >
          Próximo
        </Button>
      </div>

      <Tabs defaultValue="anuncios">
        {/* Quatro abas não cabem lado a lado no celular: a lista rola. */}
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
          <TabsTrigger value="por-conta">Por conta</TabsTrigger>
          <TabsTrigger value="despesas">Despesas adicionais</TabsTrigger>
          <TabsTrigger value="historico">Meses anteriores</TabsTrigger>
        </TabsList>

        <TabsContent value="anuncios" className="mt-4">
          <TabelaAnuncios mesRef={mesRef} hoje={hoje} />
        </TabsContent>

        <TabsContent value="por-conta" className="mt-4">
          <GastoPorConta mesRef={mesRef} hoje={hoje} />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <FaturamentoMensal />
        </TabsContent>

        <TabsContent value="despesas" className="mt-4">
          <Despesas mesRef={mesRef} hoje={hoje} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Invalida o painel financeiro junto — ele lê os mesmos números. */
function useInvalidar(mesRef: string) {
  const qc = useQueryClient();
  return (...chaves: string[]) => {
    for (const chave of chaves) void qc.invalidateQueries({ queryKey: [chave, mesRef] });
    void qc.invalidateQueries({ queryKey: ["financeiro"] });
  };
}

function TabelaAnuncios({ mesRef, hoje }: { mesRef: string; hoje: string }) {
  const invalidar = useInvalidar(mesRef);
  const inicio = inicioMes(mesRef);
  const fim = fimMes(mesRef);

  const { data: gastos } = useQuery({
    queryKey: ["trafego", mesRef],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gastos_trafego")
        .select("id, data, canal, valor")
        .gte("data", inicio)
        .lte("data", fim);
      if (error) throw error;
      return (data ?? []).map((g) => ({ ...g, valor: Number(g.valor) }));
    },
  });

  const salvar = useMutation({
    mutationFn: async (v: { data: string; canal: CanalTrafego; valor: number }) => {
      if (v.valor === 0) {
        // Zero é "não gastei", e não uma linha de R$0: apagar mantém a tabela
        // limpa e o mês sem buracos de linhas vazias.
        const { error } = await supabase
          .from("gastos_trafego")
          .delete()
          .eq("data", v.data)
          .eq("canal", v.canal);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("gastos_trafego")
        .upsert({ data: v.data, canal: v.canal, valor: v.valor }, { onConflict: "data,canal" });
      if (error) throw error;
    },
    // O gasto lançado é também a régua da aba Por conta.
    onSuccess: () => invalidar("trafego", "trafego-contas"),
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });

  const dias = useMemo(() => diasDoIntervalo(inicio, fim > hoje ? hoje : fim), [inicio, fim, hoje]);

  const valorDe = (dia: string, canal: CanalTrafego) =>
    gastos?.find((g) => g.data === dia && g.canal === canal)?.valor ?? 0;

  const totalCanal = (canal: CanalTrafego) =>
    gastos?.filter((g) => g.canal === canal).reduce((s, g) => s + g.valor, 0) ?? 0;

  const totalMes = gastos?.reduce((s, g) => s + g.valor, 0) ?? 0;

  return (
    <Card>
      <CardContent className="overflow-x-auto py-4">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Dia</th>
              {CANAIS.map((c) => (
                <th key={c} className="px-2 py-2 text-right font-medium">
                  {CANAL_LABEL[c]}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((dia) => {
              const total = CANAIS.reduce((s, c) => s + valorDe(dia, c), 0);
              const dow = (fromISO(dia).getDay() + 6) % 7; // 0 = segunda
              return (
                <tr
                  key={dia}
                  className={cn(
                    "border-b last:border-0",
                    dia === hoje && "bg-secondary/50",
                    dow >= 5 && "text-muted-foreground",
                  )}
                >
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {dia.slice(8)}/{dia.slice(5, 7)}{" "}
                    <span className="text-xs text-muted-foreground">{DIAS_SEMANA[dow]}</span>
                  </td>
                  {CANAIS.map((c) => (
                    <td key={c} className="px-1 py-1">
                      <CampoValor
                        valor={valorDe(dia, c)}
                        onSalvar={(valor) => salvar.mutate({ data: dia, canal: c, valor })}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular font-medium">
                    {total > 0 ? formatBRL(total) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-2 py-2">Total do mês</td>
              {CANAIS.map((c) => (
                <td key={c} className="px-2 py-2 text-right tabular">
                  {totalCanal(c) > 0 ? formatBRL(totalCanal(c)) : "—"}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular">{formatBRL(totalMes)}</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function Despesas({ mesRef, hoje }: { mesRef: string; hoje: string }) {
  const invalidar = useInvalidar(mesRef);
  const inicio = inicioMes(mesRef);
  const fim = fimMes(mesRef);

  const [data, setData] = useState(hoje >= inicio && hoje <= fim ? hoje : inicio);
  const [categoria, setCategoria] = useState<CategoriaDespesa>("ferramenta");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [recorrente, setRecorrente] = useState(false);

  const { data: despesas } = useQuery({
    queryKey: ["despesas", mesRef],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas")
        .select("id, data, categoria, descricao, valor, recorrente")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d) => ({ ...d, valor: Number(d.valor) }));
    },
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("despesas").insert({
        data,
        categoria,
        descricao: descricao.trim() || null,
        valor: parseMoeda(valor),
        recorrente,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar("despesas");
      setDescricao("");
      setValor("");
      setRecorrente(false);
    },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar("despesas"),
    onError: (e: Error) => toast.error(`Não apagou: ${e.message}`),
  });

  /**
   * Repete as recorrentes do mês anterior neste mês.
   *
   * A despesa fixa é lançada mês a mês de propósito: se uma linha só valesse
   * "para sempre", mudar o valor de uma ferramenta reescreveria o custo de
   * todos os meses passados. O botão só evita redigitar.
   */
  const repetir = useMutation({
    mutationFn: async () => {
      const anterior = inicioMes(addDias(inicio, -1));
      const { data: base, error } = await supabase
        .from("despesas")
        .select("data, categoria, descricao, valor")
        .eq("recorrente", true)
        .gte("data", anterior)
        .lte("data", fimMes(anterior));
      if (error) throw error;
      if (!base || base.length === 0) {
        toast.info("Nenhuma despesa recorrente no mês anterior.");
        return;
      }
      const { error: erroInsert } = await supabase.from("despesas").insert(
        base.map((d) => ({
          // Mesmo dia do mês, deslocado para o mês atual.
          data: `${mesRef.slice(0, 7)}-${d.data.slice(8)}`,
          categoria: d.categoria,
          descricao: d.descricao,
          valor: d.valor,
          recorrente: true,
        })),
      );
      if (erroInsert) throw erroInsert;
      toast.success(`${base.length} despesa(s) repetida(s).`);
    },
    onSuccess: () => invalidar("despesas"),
    onError: (e: Error) => toast.error(`Não repetiu: ${e.message}`),
  });

  const total = despesas?.reduce((s, d) => s + d.valor, 0) ?? 0;
  const podeSalvar = parseMoeda(valor) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <p className="mb-3 text-sm font-medium">Lançar despesa</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              type="date"
              className="h-9"
              value={data}
              min={inicio}
              max={fim}
              onChange={(e) => setData(e.target.value)}
            />
            <select
              className="h-9 rounded-lg border bg-card px-3 text-sm"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </option>
              ))}
            </select>
            <Input
              className="h-9 lg:col-span-2"
              placeholder="Descrição (opcional)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
            <Input
              inputMode="numeric"
              className="h-9 text-right tabular"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(maskMoeda(e.target.value))}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={recorrente}
                onChange={(e) => setRecorrente(e.target.checked)}
              />
              Repete todo mês
            </label>
            <Button
              size="sm"
              disabled={!podeSalvar || adicionar.isPending}
              onClick={() => adicionar.mutate()}
            >
              Adicionar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={repetir.isPending}
              onClick={() => repetir.mutate()}
            >
              Repetir as do mês anterior
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-medium">Despesas do mês</p>
            <p className="tabular font-semibold">{formatBRL(total)}</p>
          </div>

          {(despesas?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma despesa lançada neste mês.
            </p>
          ) : (
            <div className="space-y-2">
              {despesas?.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {d.descricao ?? CATEGORIA_LABEL[d.categoria]}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {formatData(d.data)} · {CATEGORIA_LABEL[d.categoria]}
                      {d.recorrente && (
                        <Badge variant="outline" className="text-[10px]">
                          mensal
                        </Badge>
                      )}
                    </p>
                  </div>
                  <span className="tabular text-sm font-medium">{formatBRL(d.valor)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Apagar despesa"
                    onClick={() => remover.mutate(d.id)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Campo de moeda que só grava ao sair. Salvar a cada tecla dispararia um
 * upsert por dígito e o valor piscaria enquanto se digita.
 */
function CampoValor({ valor, onSalvar }: { valor: number; onSalvar: (v: number) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const exibido =
    texto ??
    (valor > 0
      ? valor.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "");

  return (
    <Input
      inputMode="numeric"
      placeholder="0,00"
      className="h-8 text-right tabular"
      value={exibido}
      onChange={(e) => setTexto(maskMoeda(e.target.value))}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        if (texto === null) return;
        const novo = parseMoeda(texto);
        setTexto(null);
        if (novo !== valor) onSalvar(novo);
      }}
    />
  );
}
