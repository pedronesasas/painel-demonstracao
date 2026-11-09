import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARIO, type ChaveMetrica } from "@/lib/glossario";

/**
 * O "?" ao lado da métrica.
 *
 * É um `button` e não um ícone solto de propósito: no celular não existe
 * passar o mouse, e só um elemento focável abre o tooltip no toque e no
 * teclado. Um ícone decorativo deixaria a explicação inacessível em metade
 * dos acessos.
 */
export function AjudaMetrica({ metrica }: { metrica: ChaveMetrica }) {
  const { oQueE, comoCalcula, atencao } = GLOSSARIO[metrica] as {
    oQueE: string;
    comoCalcula: string;
    atencao?: string;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`O que é: ${oQueE}`}
            className="text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <HelpCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs space-y-1.5 text-xs leading-relaxed">
          <p>{oQueE}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{comoCalcula}</p>
          {atencao && <p className="border-t pt-1.5 text-muted-foreground">{atencao}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
