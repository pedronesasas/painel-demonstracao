import type { Apuracao } from "@/lib/financeiro";

/**
 * Veredito de saúde da operação.
 *
 * O Dashboard existe para responder uma pergunta antes de qualquer outra:
 * está saudável ou não? Uma parede de KPIs não responde isso — quem lê
 * precisa comparar seis números de cabeça e saber qual deles importa hoje.
 *
 * Então a tela diz a conclusão em uma frase, e os números ficam abaixo para
 * quem quiser conferir.
 */

export type Nivel = "saudavel" | "atencao" | "critico" | "sem-dados";

export type Saude = {
  nivel: Nivel;
  titulo: string;
  /** O porquê: o fator que mais pesa no resultado deste período. */
  detalhe: string;
};

/**
 * Faixas de margem.
 *
 * Infoproduto com tráfego pago costuma trabalhar entre 20% e 40% de margem;
 * abaixo de 15% qualquer oscilação no CPA come o lucro do mês. São faixas de
 * referência, não verdade contábil — se a operação passar a trabalhar com
 * outra estrutura, é aqui que se mexe.
 */
const MARGEM_SAUDAVEL = 0.2;
const MARGEM_APERTADA = 0.1;

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O maior dreno do período, em percentual do faturamento bruto.
 *
 * Saber que a margem está baixa não ajuda; saber que o tráfego comeu 45% do
 * faturamento ajuda. É a diferença entre um alarme e um diagnóstico.
 */
function maiorDreno(a: Apuracao): { nome: string; fatia: number } | null {
  if (a.faturamentoBruto <= 0) return null;

  const drenos = [
    { nome: "o tráfego", valor: a.trafego },
    { nome: "as taxas de plataforma", valor: a.taxaGateway },
    { nome: "o imposto", valor: a.imposto },
    { nome: "as despesas fixas", valor: a.despesasAdicionais },
    { nome: "os reembolsos", valor: a.reembolsos },
  ];

  const maior = drenos.sort((x, y) => y.valor - x.valor)[0];
  if (!maior || maior.valor <= 0) return null;
  return { nome: maior.nome, fatia: maior.valor / a.faturamentoBruto };
}

export function avaliarSaude(a: Apuracao): Saude {
  if (a.itens === 0 && a.gastosTotais === 0) {
    return {
      nivel: "sem-dados",
      titulo: "Sem movimento no período",
      detalhe: "Nenhuma venda aprovada e nenhum custo lançado.",
    };
  }

  const dreno = maiorDreno(a);
  const porQue = dreno
    ? `${dreno.nome.charAt(0).toUpperCase()}${dreno.nome.slice(1)} levou ${pct(dreno.fatia)} do faturamento.`
    : "";

  // Gastou e não vendeu: o caso em que a margem nem existe para ser avaliada.
  if (a.faturamentoBruto <= 0 && a.gastosTotais > 0) {
    return {
      nivel: "critico",
      titulo: `Prejuízo de ${brl(Math.abs(a.lucro))}`,
      detalhe: `${brl(a.gastosTotais)} gastos sem faturamento aprovado no período.`,
    };
  }

  if (a.lucro < 0) {
    return {
      nivel: "critico",
      titulo: `Operação no prejuízo — ${brl(Math.abs(a.lucro))}`,
      detalhe:
        porQue || `Os custos superaram o faturamento líquido de ${brl(a.faturamentoLiquido)}.`,
    };
  }

  if (a.margem < MARGEM_APERTADA) {
    return {
      nivel: "critico",
      titulo: `Margem de ${pct(a.margem)} — no limite`,
      detalhe: `${porQue} Sobra ${brl(a.lucro)}: qualquer alta no CPA zera o mês.`,
    };
  }

  if (a.margem < MARGEM_SAUDAVEL) {
    return {
      nivel: "atencao",
      titulo: `Lucrando ${brl(a.lucro)}, com margem apertada`,
      detalhe: `${pct(a.margem)} de margem. ${porQue}`,
    };
  }

  return {
    nivel: "saudavel",
    titulo: `Operação saudável — ${brl(a.lucro)} de lucro`,
    detalhe: `${pct(a.margem)} de margem${
      a.trafego > 0
        ? ` e ROAS de ${a.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`
        : ""
    }. ${porQue}`,
  };
}
