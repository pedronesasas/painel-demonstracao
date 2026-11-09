import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PLATAFORMAS, PLATAFORMA_LABEL, formatPercent } from "@/lib/financeiro";
import type { Recorte } from "@/lib/recorte";

/**
 * Todas / Plataforma B / Plataforma A, e se o tráfego entra na conta.
 *
 * O botão só aparece com uma plataforma escolhida: na operação inteira o
 * tráfego é dela toda, e não há nada para ratear. Ligado por padrão, porque a
 * pergunta mais comum é "quanto essa plataforma deixa de lucro".
 */
export function FiltroPlataforma({
  recorte,
  onRecorte,
  contarTrafego,
  onContarTrafego,
  participacao,
}: {
  recorte: Recorte;
  onRecorte: (r: Recorte) => void;
  contarTrafego: boolean;
  onContarTrafego: (v: boolean) => void;
  /** Fatia da plataforma no faturamento, para dizer quanto do tráfego ela leva. */
  participacao: number | null;
}) {
  const opcoes: Recorte[] = ["todas", ...PLATAFORMAS];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {opcoes.map((o) => (
          <Button
            key={o}
            size="sm"
            variant={o === recorte ? "default" : "outline"}
            onClick={() => onRecorte(o)}
          >
            {o === "todas" ? "Todas as plataformas" : PLATAFORMA_LABEL[o]}
          </Button>
        ))}
      </div>

      {recorte !== "todas" && (
        <div className="flex items-center gap-2">
          <Switch id="contar-trafego" checked={contarTrafego} onCheckedChange={onContarTrafego} />
          <Label htmlFor="contar-trafego" className="text-sm font-normal">
            Contar tráfego
            {contarTrafego && participacao !== null && (
              <span className="text-muted-foreground">
                {" "}
                — rateado: {formatPercent(participacao)} do anúncio
              </span>
            )}
          </Label>
        </div>
      )}
    </div>
  );
}
