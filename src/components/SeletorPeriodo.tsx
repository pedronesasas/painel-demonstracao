import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { hojeISO } from "@/lib/semana";
import { rotuloPeriodo, type Periodo } from "@/lib/useFinanceiro";

/**
 * Atalhos de período e a janela personalizada.
 *
 * Fica em componente compartilhado porque Dashboard e Vendas precisam
 * responder ao mesmo recorte: conferir um número do painel na lista de vendas
 * só funciona se as duas telas puderem olhar exatamente os mesmos dias.
 */

export const ROTULO_PERSONALIZADO = "Personalizado";

export function SeletorPeriodo({
  opcoes,
  periodo,
  onMudar,
}: {
  opcoes: Periodo[];
  periodo: Periodo;
  onMudar: (p: Periodo) => void;
}) {
  const hoje = hojeISO();
  const personalizado = periodo.rotulo === ROTULO_PERSONALIZADO;

  const [inicio, setInicio] = useState(periodo.inicio);
  const [fim, setFim] = useState(periodo.fim);
  const [aberto, setAberto] = useState(false);

  // Intervalo invertido não é erro de digitação a ser corrigido em silêncio:
  // trocar as pontas sozinho faria a tela mostrar um período que a pessoa não
  // pediu. Melhor barrar o botão e deixar ela ver o que escolheu.
  const valido = Boolean(inicio && fim && inicio <= fim);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {opcoes.map((o) => (
        <Button
          key={o.rotulo}
          size="sm"
          variant={!personalizado && o.rotulo === periodo.rotulo ? "default" : "outline"}
          onClick={() => onMudar(o)}
        >
          {o.rotulo}
        </Button>
      ))}

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button size="sm" variant={personalizado ? "default" : "outline"}>
            <CalendarRange className="size-4" />
            {personalizado ? rotuloPeriodo(periodo) : "Personalizado"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="periodo-inicio">
                De
              </label>
              <Input
                id="periodo-inicio"
                type="date"
                className="mt-1 h-9"
                value={inicio}
                max={hoje}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="periodo-fim">
                Até
              </label>
              <Input
                id="periodo-fim"
                type="date"
                className="mt-1 h-9"
                value={fim}
                max={hoje}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>
          </div>

          {!valido && inicio && fim && (
            <p className="text-xs text-negativo">A data inicial precisa vir antes da final.</p>
          )}

          <Button
            size="sm"
            className="w-full"
            disabled={!valido}
            onClick={() => {
              onMudar({ inicio, fim, rotulo: ROTULO_PERSONALIZADO });
              setAberto(false);
            }}
          >
            Aplicar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
