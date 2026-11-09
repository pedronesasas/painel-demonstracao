/**
 * O que cada métrica é e como sai a conta.
 *
 * As fórmulas não são óbvias e já causaram confusão nesta própria operação:
 * ROAS usa o faturamento BRUTO e ROI usa o LÍQUIDO, e quem não sabe disso lê
 * os dois como se medissem a mesma coisa. Deixar a explicação a um passe de
 * mouse é mais barato que explicar de novo toda vez.
 *
 * Fica em arquivo separado porque a definição é a mesma em qualquer tela que
 * mostre a métrica — e porque, quando a conta mudar, o texto tem que mudar
 * junto, no mesmo lugar.
 */

export type Explicacao = {
  /** Uma frase: o que a métrica responde. */
  oQueE: string;
  /** A conta, em palavras. */
  comoCalcula: string;
  /** Opcional: o que costuma ser mal interpretado. */
  atencao?: string;
};

export const GLOSSARIO = {
  faturamentoBruto: {
    oQueE: "Tudo que os clientes pagaram em vendas aprovadas, já descontado o que foi devolvido.",
    comoCalcula: "Soma das vendas aprovadas − reembolsos − chargebacks",
    atencao: "Não é o que entra na conta. Daqui ainda saem taxa de plataforma e imposto.",
  },
  faturamentoLiquido: {
    oQueE: "O que sobra das vendas depois de tudo que a plataforma e o governo cobram.",
    comoCalcula:
      "Faturamento bruto + juros repassados − taxa de gateway − comissões de coprodutor e afiliado − custo de produto − imposto",
    atencao: "É o valor que efetivamente cai na conta. Anúncios e despesas ainda não entraram.",
  },
  lucro: {
    oQueE: "O que realmente sobra da operação no período.",
    comoCalcula: "Faturamento líquido − gastos com anúncios − despesas adicionais",
  },
  margem: {
    oQueE: "Quanto de cada real faturado virou lucro.",
    comoCalcula: "Lucro ÷ Faturamento líquido",
    atencao:
      "Margem alta com faturamento baixo pode valer menos que margem apertada com volume. Olhe junto com o lucro.",
  },
  roas: {
    oQueE: "Quantos reais de venda cada real de anúncio trouxe.",
    comoCalcula: "Faturamento BRUTO ÷ gastos com anúncios",
    atencao:
      "Usa o bruto de propósito: mede a eficiência do anúncio, não a do negócio. ROAS alto convive com prejuízo se a margem for fina.",
  },
  roi: {
    oQueE: "Quanto a operação inteira devolve sobre tudo que foi gasto.",
    comoCalcula: "Faturamento LÍQUIDO ÷ gastos totais (anúncios + despesas)",
    atencao:
      "Diferente do ROAS, que usa o bruto e só considera anúncio. O ROI é o retorno do negócio.",
  },
  cpa: {
    oQueE: "Quanto custou, em anúncio, cada pedido aprovado.",
    comoCalcula: "Gastos com anúncios ÷ pedidos aprovados",
    atencao: "Conta pedidos, não itens: um pedido com dois order bumps é um cliente só.",
  },
  ticketMedio: {
    oQueE: "Quanto vale, em média, cada pedido.",
    comoCalcula: "Faturamento bruto ÷ pedidos aprovados",
  },
  receitaPorCliente: {
    oQueE: "Quanto cada cliente trouxe, somando todas as compras dele no período.",
    comoCalcula: "Faturamento bruto ÷ clientes distintos (por e-mail)",
    atencao:
      "Ocupa o lugar do ARPU enquanto não há assinatura: sem assinante ativo, o ARPU não tem denominador. Difere do ticket médio quando o mesmo cliente compra mais de uma vez.",
  },
  custoPlataforma: {
    oQueE: "Quanto a plataforma de pagamento ficou do que foi vendido.",
    comoCalcula: "Taxa de gateway ÷ faturamento bruto",
    atencao:
      "Quando a plataforma informa o líquido do vendedor, a taxa é medida (bruto − líquido). Quando não informa, é estimada pela tabela negociada — o painel diz qual dos dois está vendo.",
  },
  aprovadas: {
    oQueE: "Cobranças que viraram dinheiro.",
    comoCalcula:
      "Soma das vendas aprovadas no período, inclusive as que depois foram reembolsadas — elas foram venda, e a devolução sai à parte",
  },
  pendentes: {
    oQueE: "Pix e boleto gerados e ainda não pagos. É receita que ainda pode entrar.",
    comoCalcula: "Soma do valor das cobranças em aberto",
    atencao:
      "Indicador de direção: mostra o que vem, não o que foi. É a fila da recuperação de boleto.",
  },
  reembolsos: {
    oQueE: "Dinheiro que entrou e voltou para o cliente, somando reembolsos e chargebacks.",
    comoCalcula:
      "Valor devolvido no período, pela data do estorno. A taxa é a da regra de bônus do suporte: pedidos reembolsados no período ÷ pedidos aprovados no período",
    atencao:
      "Conta pedidos, não reais: um reembolso de R$ 497 pesa o mesmo que um de R$ 47. É a taxa que define o bônus do suporte.",
  },
  naoPagas: {
    oQueE: "Cobranças que morreram: cartão recusado, boleto vencido, pix expirado.",
    comoCalcula: "Taxa de aprovação = aprovadas ÷ (aprovadas + não pagas)",
    atencao:
      "As pendentes ficam fora da conta de propósito: ainda podem ser pagas, e contá-las como perda faria a taxa cair sempre que entrasse um boleto novo.",
  },
  ritmo: {
    oQueE: "Se a operação está no caminho de bater a meta do período.",
    comoCalcula:
      "Realizado ÷ o que deveria estar realizado hoje, considerando a reta do zero até a meta ao longo do período",
    atencao:
      "Serve para agir antes do fechamento. Descobrir no dia 28 que o mês não fecha não adianta nada.",
  },
  projecao: {
    oQueE: "Onde o período termina se o ritmo de hoje continuar até o fim.",
    comoCalcula: "(Realizado ÷ dias decorridos) × total de dias do período",
  },
  gastoLancado: {
    oQueE: "O gasto com anúncio da Meta que o painel usa no lucro, no ROAS e no ROI.",
    comoCalcula: "Soma do gasto lançado na aba Anúncios, canal Meta Ads, sem a taxa de 12% da Meta",
    atencao:
      "É o total oficial: inclui o gasto de contas que a UTMify não enxerga. O gasto por conta detalha este número, não o substitui.",
  },
  gastoIdentificado: {
    oQueE: "A parte do gasto que a UTMify atribui a uma conta de anúncios.",
    comoCalcula: "Soma do gasto de cada conta no mês, sem a taxa de 12% da Meta",
    atencao: "A UTMify só enxerga as contas de anúncio habilitadas nela.",
  },
  semContaIdentificada: {
    oQueE: "Gasto lançado que nenhuma conta visível na UTMify explica.",
    comoCalcula:
      "Gasto lançado − soma das contas, dia a dia. Dia em que as contas passam do lançado conta zero e vai para o aviso",
    atencao:
      "Costuma ser gasto de conta que a UTMify não enxerga, ou de dia cujo gasto por conta ainda não foi puxado. A conta é por dia para a sobra de um dia não esconder o que falta em outro.",
  },
  precoMedio: {
    oQueE: "Quanto saiu, em média, cada venda do produto.",
    comoCalcula:
      "Soma das vendas do período ÷ número de vendas, inclusive as que depois foram reembolsadas",
    atencao:
      "Mostra o desconto: um produto de tabela R$ 397 com preço médio de R$ 250 está saindo bem abaixo do preço cheio.",
  },
  participacao: {
    oQueE: "Quanto do faturamento bruto do período veio deste produto.",
    comoCalcula: "Faturamento bruto do produto ÷ faturamento bruto de todos os produtos",
  },
  conversaoBump: {
    oQueE: "Em quantos pedidos do produto principal o cliente levou também o order bump.",
    comoCalcula:
      "Pedidos do principal com o order bump ÷ pedidos do principal, vendidos no período, inclusive os que depois foram reembolsados",
    atencao:
      "Na Plataforma B, o aviso da venda diz qual produto entrou como order bump. Na Plataforma A, cada produto chega como uma venda, e o principal é a primeira venda do pedido.",
  },
  aproveitamento: {
    oQueE: "Dos pedidos de reembolso já decididos, quantos o suporte conseguiu reverter.",
    comoCalcula: "Revertidos ÷ (revertidos + perdidos)",
    atencao:
      "Pedidos ainda abertos ou em contato não entram, porque não foram decididos. Soma todos os pedidos desde que o painel começou a recebê-los.",
  },
  emCarencia: {
    oQueE: "Comissão das reversões feitas há menos de 15 dias, que ainda não está garantida.",
    comoCalcula: "10% do líquido de cada reversão, até completar 15 dias da desistência do cliente",
    atencao:
      "A regra só considera revertido o pedido que passa 15 dias sem estorno. Se a venda continuar ativa nesse prazo, o valor vai para Comissão confirmada; se o reembolso sair ou vier chargeback, o caso vira estorno e não gera comissão.",
  },
} as const satisfies Record<string, Explicacao>;

export type ChaveMetrica = keyof typeof GLOSSARIO;
