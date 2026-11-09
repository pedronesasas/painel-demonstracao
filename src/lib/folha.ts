/**
 * Folha de pagamento: como o lucro é repartido.
 *
 * A regra da operação, na ordem exata em que foi definida:
 *
 *   1. desconta os FIXOS
 *   2. tira a % dos COLABORADORES
 *   3. depois a parte das SÓCIAS
 *
 * A ordem é o ponto inteiro deste arquivo. Um percentual sobre o lucro é
 * circular — a folha reduz o lucro e o percentual incide sobre o lucro — e a
 * única saída é fixar em que linha cada percentual morde. Aqui:
 *
 *   Lucro operacional = Fat. líquido − anúncios − despesas − folha direta
 *   Comissões         = % colaborador × Lucro operacional
 *   Após comissões    = Lucro operacional − comissões
 *   Sócias            = % sócia × Após comissões
 *   Retido            = Após comissões − sócias
 *
 * "Folha direta" é o que dá para calcular sem saber o lucro: os salários fixos
 * e quem ganha percentual do faturamento. Esses entram junto com as despesas,
 * antes da base das comissões — é isso que "o lucro é depois de descontar os
 * fixos" quer dizer, e é o que faz o colaborador do percentual receber sobre
 * um lucro já limpo de salário.
 *
 * Trocar duas linhas de lugar aqui muda quanto cada pessoa recebe. Por isso a
 * cascata é explícita e testada, em vez de espalhada pela tela.
 */

export type BaseRemuneracao = "fixo" | "percentual_lucro" | "percentual_faturamento";

/** Em que degrau da cascata a pessoa entra. */
export type ClasseRemuneracao = "colaborador" | "socia";

export type Remuneracao = {
  pessoa_id: string;
  nome: string;
  base: BaseRemuneracao;
  classe: ClasseRemuneracao;
  /** Reais por período, quando `base` é 'fixo'. */
  valor_fixo: number | null;
  /** Percentual de 0 a 100, nas outras bases. */
  percentual: number | null;
  /**
   * Mensal ou semestral muda QUANDO o dinheiro sai, não a que mês o custo
   * pertence. O painel é de competência: a comissão de setembro é custo de
   * setembro mesmo saindo do caixa em outubro.
   */
  periodicidade: "mensal" | "semestral";
  vigencia_inicio: string;
  vigencia_fim: string | null;
};

export type ParcelaFolha = {
  pessoa_id: string;
  nome: string;
  classe: ClasseRemuneracao;
  base: BaseRemuneracao;
  valor: number;
};

export type Folha = {
  /** Fixos e percentuais do faturamento: saem antes da base das comissões. */
  folhaDireta: number;
  /** Fat. líquido − anúncios − despesas − folha direta. Base das comissões. */
  lucroOperacional: number;
  /** Soma do que os colaboradores recebem por percentual do lucro. */
  comissoes: number;
  /** Lucro operacional − comissões. Base da parte das sócias. */
  lucroAposComissoes: number;
  partesSocias: number;
  /** O que sobra na operação depois de todo mundo. */
  lucroRetido: number;
  /** Uma linha por pessoa, na ordem da cascata. */
  parcelas: ParcelaFolha[];
};

/**
 * Remunerações vigentes no dia.
 *
 * Mesmo critério da taxa de plataforma: renegociar o salário de alguém não
 * pode reescrever o custo de um mês já fechado.
 */
export function vigentesEm(remuneracoes: Remuneracao[], dia: string): Remuneracao[] {
  return remuneracoes.filter(
    (r) => r.vigencia_inicio <= dia && (r.vigencia_fim === null || r.vigencia_fim >= dia),
  );
}

/**
 * Quanto de um valor mensal cabe no período apurado.
 *
 * Um salário mensal não pode ser descontado inteiro de um único dia: o painel
 * mostraria prejuízo todo dia 1 e lucro no resto do mês. A proporção é por
 * dias corridos do mês de referência — fevereiro tem 28, e usar 30 fixo
 * deixaria o ano sem fechar.
 */
export function proporcaoDoMes(inicio: string, fim: string): number {
  const dias = diasEntre(inicio, fim);
  const [ano, mes] = inicio.split("-").map(Number);
  const diasNoMes = new Date(ano!, mes!, 0).getDate();
  return dias / diasNoMes;
}

function diasEntre(inicio: string, fim: string): number {
  const a = Date.UTC(...(inicio.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(fim.split("-").map(Number) as [number, number, number]));
  // +1 porque as duas pontas entram: de 01 a 01 é um dia, não zero.
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Reparte o resultado do período entre quem recebe.
 *
 * `faturamentoLiquido`, `trafego` e `despesas` vêm da apuração de vendas.
 * `inicio`/`fim` existem só para ratear os fixos: um mês inteiro passa
 * proporção 1.
 */
export function repartir(
  entrada: {
    faturamentoLiquido: number;
    trafego: number;
    despesas: number;
    inicio: string;
    fim: string;
  },
  remuneracoes: Remuneracao[],
): Folha {
  const vigentes = vigentesEm(remuneracoes, entrada.fim);
  const proporcao = proporcaoDoMes(entrada.inicio, entrada.fim);
  const parcelas: ParcelaFolha[] = [];

  // --- Degrau 1: o que não depende do lucro -------------------------------
  //
  // `classe === "colaborador"` não é detalhe. A retirada de uma sócia pode ser
  // um valor fixo — o mesmo valor em
  // todos os meses, inclusive no mês que fechou no vermelho. Fixo, mas sócia.
  //
  // Se ela entrasse aqui, sairia ANTES da base das comissões, e o colaborador
  // do percentual receberia sobre um lucro já sem as retiradas — o contrário
  // da regra, que manda as sócias virem por último. A classe decide o degrau;
  // a base decide só como o valor é calculado.
  let folhaDireta = 0;
  for (const r of vigentes) {
    if (r.classe !== "colaborador") continue;
    let valor = 0;
    if (r.base === "fixo") {
      valor = (r.valor_fixo ?? 0) * proporcao;
    } else if (r.base === "percentual_faturamento") {
      valor = entrada.faturamentoLiquido * ((r.percentual ?? 0) / 100);
    } else {
      continue;
    }
    folhaDireta += valor;
    parcelas.push({ pessoa_id: r.pessoa_id, nome: r.nome, classe: r.classe, base: r.base, valor });
  }

  const lucroOperacional =
    entrada.faturamentoLiquido - entrada.trafego - entrada.despesas - folhaDireta;

  // --- Degrau 2: a % dos colaboradores ------------------------------------
  // Só sobre lucro positivo. Percentual de prejuízo daria comissão negativa,
  // isto é, o colaborador devolvendo dinheiro — o que ninguém combinou.
  const base = Math.max(lucroOperacional, 0);
  let comissoes = 0;
  for (const r of vigentes) {
    if (r.base !== "percentual_lucro" || r.classe !== "colaborador") continue;
    const valor = base * ((r.percentual ?? 0) / 100);
    comissoes += valor;
    parcelas.push({ pessoa_id: r.pessoa_id, nome: r.nome, classe: r.classe, base: r.base, valor });
  }

  const lucroAposComissoes = lucroOperacional - comissoes;

  // --- Degrau 3: a parte das sócias ---------------------------------------
  const baseSocias = Math.max(lucroAposComissoes, 0);
  let partesSocias = 0;
  for (const r of vigentes) {
    if (r.classe !== "socia") continue;

    // A retirada fixa sai mesmo no mês ruim — foi o que aconteceu em junho,
    // que fechou negativo e ainda assim teve as duas retiradas de R$ 10.000.
    // Diferente da comissão, que é percentual e simplesmente não existe sem
    // lucro.
    const valor =
      r.base === "fixo"
        ? (r.valor_fixo ?? 0) * proporcao
        : r.base === "percentual_faturamento"
          ? entrada.faturamentoLiquido * ((r.percentual ?? 0) / 100)
          : baseSocias * ((r.percentual ?? 0) / 100);

    partesSocias += valor;
    parcelas.push({ pessoa_id: r.pessoa_id, nome: r.nome, classe: r.classe, base: r.base, valor });
  }

  return {
    folhaDireta,
    lucroOperacional,
    comissoes,
    lucroAposComissoes,
    partesSocias,
    lucroRetido: lucroAposComissoes - partesSocias,
    parcelas,
  };
}

/**
 * Quando o pagamento de um período sai.
 *
 * A regra combinada: dia 5 do mês seguinte ao fim do período apurado. Vale
 * para mensal e para semestral — muda só qual é o período, não a data.
 */
export function dataDePagamento(fimDoPeriodo: string, diaPagamento = 5): string {
  const [ano, mes] = fimDoPeriodo.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano!, mes!, 1));
  const dd = String(diaPagamento).padStart(2, "0");
  return `${proximo.getUTCFullYear()}-${String(proximo.getUTCMonth() + 1).padStart(2, "0")}-${dd}`;
}
