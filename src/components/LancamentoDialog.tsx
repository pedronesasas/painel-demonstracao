import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { maskMoeda, parseMoeda, formatData } from "@/lib/format";
import { addDias, hojeISO } from "@/lib/semana";

type Props = {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  vendedoraId: string;
  /** Gestora e admin podem lançar em qualquer data. */
  semTrava: boolean;
  dataInicial?: string;
  valorInicial?: number | null;
  onSalvo: () => void;
};

export function LancamentoDialog({
  aberto,
  onOpenChange,
  vendedoraId,
  semTrava,
  dataInicial,
  valorInicial,
  onSalvo,
}: Props) {
  const hoje = hojeISO();
  const ontem = addDias(hoje, -1);
  const [data, setData] = useState(dataInicial ?? hoje);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setData(dataInicial ?? hoje);
    setValor(
      valorInicial != null
        ? valorInicial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "",
    );
  }, [aberto, dataInicial, valorInicial, hoje]);

  const dataBloqueada = !semTrava && (data < ontem || data > hoje);

  async function salvar() {
    if (dataBloqueada) return;
    setSalvando(true);
    const { error } = await supabase.from("vendas_diarias").upsert(
      {
        vendedora_id: vendedoraId,
        data,
        valor: parseMoeda(valor),
      },
      { onConflict: "vendedora_id,data" },
    );
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível salvar", {
        description: "Verifique se a data está liberada para você.",
      });
      return;
    }
    toast.success(`Venda de ${formatData(data)} salva`);
    onOpenChange(false);
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar venda</DialogTitle>
          <DialogDescription>
            {semTrava
              ? "Você pode lançar ou corrigir qualquer data."
              : "Você pode lançar apenas hoje e ontem."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data">Data</Label>
            <Input
              id="data"
              type="date"
              value={data}
              min={semTrava ? undefined : ontem}
              max={semTrava ? undefined : hoje}
              onChange={(e) => setData(e.target.value)}
            />
            {dataBloqueada && (
              <p className="text-sm text-abaixo">
                Data fechada — peça à gestora para liberar
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor vendido</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="valor"
                inputMode="numeric"
                className="pl-9 text-lg tabular"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(maskMoeda(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando || dataBloqueada}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
