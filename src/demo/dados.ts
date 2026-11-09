/**
 * Banco de dados da demonstração.
 *
 * Tudo aqui é inventado: pessoas, clientes, produtos e valores. O gerador
 * monta uns quatro meses de operação terminando hoje, com o mesmo formato das
 * tabelas reais do painel, para que as telas e as regras de apuração rodem
 * exatamente como rodariam com dado de verdade.
 *
 * O sorteio usa semente fixa por dia: quem abre o painel duas vezes no mesmo
 * dia vê os mesmos números.
 */

import { addDias, hojeISO, inicioSemana } from "@/lib/semana";

/**
 * Uma linha de qualquer tabela. O formato de cada uma é o de
 * `integrations/supabase/types.ts`; aqui o gerador só precisa montar objetos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Linha = any;

const TABELAS = [
  "profiles",
  "user_roles",
  "vendas",
  "gastos_trafego",
  "gastos_trafego_contas",
  "despesas",
  "plataforma_taxas",
  "config_financeiro",
  "metas_operacao",
  "metas",
  "vendas_diarias",
  "solicitacoes_reembolso",
  "dc_etapas",
  "dc_snapshots",
  "faturamento_mensal",
  "log_alteracoes",
] as const;

export type Banco = { [T in (typeof TABELAS)[number]]: Linha[] };

// ---------------------------------------------------------------- sorteio

/** Gerador pseudoaleatório com semente (mulberry32). */
function sorteador(semente: number) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: proximo,
    entre: (min: number, max: number) => min + proximo() * (max - min),
    inteiro: (min: number, max: number) => Math.floor(min + proximo() * (max - min + 1)),
    chance: (p: number) => proximo() < p,
    um: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)]!,
    pesado: <T>(opcoes: readonly (readonly [T, number])[]): T => {
      const total = opcoes.reduce((s, [, p]) => s + p, 0);
      let r = proximo() * total;
      for (const [valor, peso] of opcoes) {
        r -= peso;
        if (r <= 0) return valor;
      }
      return opcoes[opcoes.length - 1]![0];
    },
  };
}

function sementeDoTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- cadastro

export const PESSOAS = {
  gestora: { id: "u-gestora", nome: "Visitante", email: "visitante@exemplo.com", papel: "admin" },
  vendedora1: { id: "u-vend-1", nome: "Bianca Souza", email: "bianca@exemplo.com", papel: "vendedora" },
  vendedora2: { id: "u-vend-2", nome: "Renata Lima", email: "renata@exemplo.com", papel: "vendedora" },
  suporte: { id: "u-suporte", nome: "Joana Ribeiro", email: "suporte@exemplo.com", papel: "suporte" },
} as const;

type Produto = { nome: string; preco: number; tipo: "principal" | "bump" | "upsell" };

const PRODUTO_1: Produto = { nome: "Produto 1", preco: 397, tipo: "principal" };
const PRODUTO_2: Produto = { nome: "Produto 2", preco: 97, tipo: "principal" };
const PRODUTO_3: Produto = { nome: "Produto 3", preco: 47, tipo: "bump" };
const PRODUTO_4: Produto = { nome: "Produto 4", preco: 27, tipo: "bump" };
const PRODUTO_5: Produto = { nome: "Produto 5", preco: 197, tipo: "upsell" };

const NOMES = [
  "Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela",
  "Júlia", "Larissa", "Mariana", "Natália", "Patrícia", "Rafaela", "Sabrina", "Tatiane", "Vanessa",
  "André", "Bruno", "Carlos", "Diego", "Felipe", "Gustavo", "Lucas", "Marcelo", "Rodrigo", "Thiago",
];
const SOBRENOMES = [
  "Almeida", "Barbosa", "Cardoso", "Dias", "Esteves", "Farias", "Gomes", "Henrique", "Lopes",
  "Machado", "Nogueira", "Oliveira", "Pereira", "Queiroz", "Ramos", "Santos", "Teixeira", "Vieira",
];

const MOTIVOS = [
  "Não tive tempo de acompanhar as aulas.",
  "Achei que o conteúdo era outro.",
  "Estou passando por um aperto financeiro.",
  "Comprei por impulso e me arrependi.",
  "Não consegui acessar a área de membros.",
  "Comprei duas vezes sem querer.",
];

const ANOTACOES = [
  "Liguei e expliquei o cronograma; cliente decidiu continuar.",
  "Enviei o passo a passo de acesso por WhatsApp.",
  "Ofereci acompanhamento individual na primeira semana.",
  "Cliente pediu mais prazo para decidir.",
];

// ---------------------------------------------------------------- geração

/** Meses inteiros de dados antes do mês atual. */
const MESES_DE_HISTORICO = 4;

/** Primeiro dia com venda na demonstração: dia 1, alguns meses antes de hoje. */
export function inicioDaDemo(hoje = hojeISO()): string {
  const d = new Date(`${hoje.slice(0, 7)}-01T12:00:00`);
  d.setMonth(d.getMonth() - MESES_DE_HISTORICO);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Hora atual em Brasília, como "HH:MM", para as vendas de hoje pararem no agora. */
function agoraEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function horario(dia: string, minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${dia}T${h}:${m}:00-03:00`;
}

export function gerarBanco(hoje = hojeISO()): Banco {
  const s = sorteador(sementeDoTexto(`painel-demo-${hoje}`));
  const inicio = inicioDaDemo(hoje);
  const DIAS_DE_HISTORICO =
    Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1;
  const [hh, mm] = agoraEmBrasilia().split(":").map(Number);
  const minutosAgora = hh! * 60 + mm!;

  const banco = Object.fromEntries(TABELAS.map((t) => [t, []])) as unknown as Banco;
  banco.config_financeiro.push({ id: true, imposto_percentual: 6, atualizado_em: `${inicio}T00:00:00Z` });

  for (const p of Object.values(PESSOAS)) {
    banco.profiles.push({ id: p.id, nome: p.nome, email: p.email, ativo: true, criado_em: `${inicio}T09:00:00Z` });
    banco.user_roles.push({ id: `r-${p.id}`, user_id: p.id, role: p.papel });
  }

  // Taxas das plataformas. A Plataforma A cobra por faixa de faturamento do
  // mês e não informa o líquido; a B informa, então a tabela é só referência.
  banco.plataforma_taxas.push(
    { id: "t-a1", plataforma: "plataforma_a", vigencia_inicio: "2020-01-01", faixa_min: 0, faixa_max: 50000, percentual: 4.99, fixo_por_venda: 1, fixo_so_no_principal: false, perc_juros_repassado: 0, observacao: null },
    { id: "t-a2", plataforma: "plataforma_a", vigencia_inicio: "2020-01-01", faixa_min: 50000, faixa_max: null, percentual: 3.99, fixo_por_venda: 1, fixo_so_no_principal: false, perc_juros_repassado: 0, observacao: null },
    { id: "t-b1", plataforma: "plataforma_b", vigencia_inicio: "2020-01-01", faixa_min: 0, faixa_max: null, percentual: 6.99, fixo_por_venda: 2.49, fixo_so_no_principal: true, perc_juros_repassado: 10, observacao: null },
  );

  // ------------------------------------------------------------ vendas
  let seqPedido = 48_210_000;
  let seqLinha = 0;
  const receitaDoDia = new Map<string, number>();

  for (let i = 0; i < DIAS_DE_HISTORICO; i += 1) {
    const dia = addDias(inicio, i);
    const ehHoje = dia === hoje;
    const diaSemana = new Date(`${dia}T12:00:00`).getDay();
    const fimDeSemana = diaSemana === 0 || diaSemana === 6;
    const crescimento = 0.8 + 0.4 * (i / DIAS_DE_HISTORICO);
    const pedidosNoDia = Math.round(22 * crescimento * (fimDeSemana ? 0.7 : 1) * s.entre(0.75, 1.25));
    let receita = 0;

    for (let n = 0; n < pedidosNoDia; n += 1) {
      const minuto = ehHoje ? s.inteiro(0, Math.max(0, minutosAgora - 1)) : s.inteiro(6 * 60, 23 * 60 + 50);
      if (ehHoje && minutosAgora < 5) continue;
      const plataforma = s.chance(0.55) ? "plataforma_a" : "plataforma_b";
      const principal = s.chance(0.45) ? PRODUTO_1 : PRODUTO_2;
      const itens: Produto[] = [principal];
      if (s.chance(0.35)) itens.push(PRODUTO_3);
      if (s.chance(0.2)) itens.push(PRODUTO_4);
      if (principal === PRODUTO_1 && s.chance(0.12)) itens.push(PRODUTO_5);

      const metodo = s.pesado([["pix", 55], ["credit_card", 40], ["boleto", 5]] as const);
      const parcelas = metodo === "credit_card" ? s.pesado([[1, 40], [3, 15], [6, 20], [12, 25]] as const) : 1;
      const jurosPorReal = parcelas > 1 ? 0.0249 * (parcelas - 1) * 0.55 : 0;

      // Status do pedido inteiro: os itens de um checkout seguem juntos.
      const diasAtras = DIAS_DE_HISTORICO - 1 - i;
      let status: string;
      if (metodo !== "credit_card" && diasAtras <= 1 && s.chance(0.18)) status = "pendente";
      else if (s.chance(metodo === "credit_card" ? 0.08 : 0.12)) status = "nao_paga";
      else status = "aprovada";

      let reembolsadoDia: string | null = null;
      if (status === "aprovada" && s.chance(0.05)) {
        const chargeback = s.chance(0.08);
        const dia2 = addDias(dia, chargeback ? s.inteiro(20, 45) : s.inteiro(1, 14));
        if (dia2 <= hoje) {
          status = chargeback ? "chargeback" : "reembolsada";
          reembolsadoDia = dia2;
        }
      }

      const cliente = `${s.um(NOMES)} ${s.um(SOBRENOMES)}`;
      const email = `${cliente.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, ".")}${s.inteiro(1, 99)}@exemplo.com`;
      const quando = horario(dia, minuto);
      const base = {
        plataforma,
        status,
        metodo_pagamento: metodo,
        parcelas,
        ocorrido_em: quando,
        ocorrido_dia: dia,
        reembolsado_dia: reembolsadoDia,
        reembolsado_em: reembolsadoDia ? `${reembolsadoDia}T15:00:00-03:00` : null,
        liberado_em: null,
        cliente_nome: cliente,
        cliente_email: email,
        taxa_afiliado: 0,
        taxa_coprodutor: 0,
        custo_produto: 0,
        criado_em: quando,
      };

      if (plataforma === "plataforma_a") {
        // Cada produto do checkout chega como uma venda; os itens extras
        // apontam para o pedido do primeiro.
        let primeiro: string | null = null;
        for (const item of itens) {
          seqPedido += s.inteiro(1, 7);
          const pedido = String(seqPedido);
          banco.vendas.push({
            ...base,
            id: `v-${(seqLinha += 1)}`,
            evento_externo_id: `a-${pedido}`,
            pedido_externo_id: pedido,
            pedido_chave: primeiro,
            produto_nome: item.nome,
            tipo: item.tipo,
            valor_bruto: item.preco,
            juros_parcelamento: centavos(item.preco * jurosPorReal),
            liquido_plataforma: null,
            payload: null,
          });
          primeiro ??= pedido;
        }
      } else {
        // Uma fatura por compra, com o detalhe de cada oferta no aviso.
        seqPedido += s.inteiro(1, 7);
        const pedido = `B${seqPedido}`;
        const bruto = itens.reduce((t, p) => t + p.preco, 0);
        const juros = centavos(bruto * jurosPorReal);
        const liquido = centavos(bruto - (bruto * 0.0699 + 2.49) + juros * 0.1);
        banco.vendas.push({
          ...base,
          id: `v-${(seqLinha += 1)}`,
          evento_externo_id: `b-${pedido}`,
          pedido_externo_id: pedido,
          pedido_chave: null,
          produto_nome: principal.nome,
          tipo: "principal",
          valor_bruto: bruto,
          juros_parcelamento: juros,
          liquido_plataforma: status === "aprovada" || status === "reembolsada" || status === "chargeback" ? liquido : null,
          payload: {
            event: {
              products: itens.map((p) => ({
                id: p.nome,
                name: p.nome,
                offers: [{ amountCents: p.preco * 100, isOrderBump: p.tipo !== "principal" }],
              })),
            },
          },
        });
      }

      if (status !== "pendente" && status !== "nao_paga") receita += itens.reduce((t, p) => t + p.preco, 0);
    }
    receitaDoDia.set(dia, receita);

    // ---------------------------------------------------------- tráfego
    const fracaoDoDia = ehHoje ? Math.min(1, minutosAgora / (24 * 60)) : 1;
    const meta = centavos(receita * s.entre(0.28, 0.38) * (ehHoje ? 1 : 1) + 350 * fracaoDoDia);
    banco.gastos_trafego.push({ id: `g-${dia}-meta`, data: dia, canal: "meta", valor: meta, observacao: null, criado_em: `${dia}T23:59:00Z`, atualizado_em: `${dia}T23:59:00Z`, criado_por: null });
    if (diaSemana !== 0 && s.chance(0.6)) {
      const google = centavos(s.entre(60, 220) * fracaoDoDia);
      banco.gastos_trafego.push({ id: `g-${dia}-google`, data: dia, canal: "google", valor: google, observacao: null, criado_em: `${dia}T23:59:00Z`, atualizado_em: `${dia}T23:59:00Z`, criado_por: null });
    }

    // O mesmo gasto da Meta aberto por conta. Uma fatia fica sem conta
    // identificada, como acontece quando nem toda conta está integrada.
    const contas = [
      ["act_100201", "Conta 01 · Captação", 0.58],
      ["act_100202", "Conta 02 · Remarketing", 0.27],
      ["act_100203", "Conta 03 · Testes", 0.1],
    ] as const;
    for (const [contaId, contaNome, fatia] of contas) {
      banco.gastos_trafego_contas.push({
        id: `gc-${dia}-${contaId}`,
        data: dia,
        canal: "meta",
        conta_id: contaId,
        conta_nome: contaNome,
        valor: centavos(meta * fatia * s.entre(0.95, 1.03)),
        fechado: !ehHoje,
        fonte: "api",
        observacao: null,
        criado_em: `${dia}T23:59:00Z`,
        atualizado_em: `${dia}T23:59:00Z`,
        criado_por: null,
      });
    }
  }

  // ------------------------------------------------------------ despesas e metas
  const meses = new Set<string>();
  for (let i = 0; i < DIAS_DE_HISTORICO; i += 1) meses.add(addDias(inicio, i).slice(0, 7));

  const FIXAS = [
    ["ferramenta", "CRM e atendimento", 497, 3],
    ["ferramenta", "Ferramenta de e-mail", 197, 5],
    ["ferramenta", "Hospedagem e domínio", 89, 5],
    ["estrutura", "Contabilidade", 650, 10],
    ["equipe", "Editor de vídeo (freelancer)", 1800, 15],
  ] as const;

  for (const mes of meses) {
    for (const [categoria, descricao, valor, diaDoMes] of FIXAS) {
      const data = `${mes}-${String(diaDoMes).padStart(2, "0")}`;
      if (data > hoje || data < inicio) continue;
      banco.despesas.push({ id: `d-${mes}-${descricao}`, data, categoria, descricao, valor, recorrente: true, criado_em: `${data}T10:00:00Z`, atualizado_em: `${data}T10:00:00Z`, criado_por: null });
    }
    const avulsa = `${mes}-20`;
    if (avulsa <= hoje && avulsa >= inicio) {
      banco.despesas.push({ id: `d-${mes}-avulsa`, data: avulsa, categoria: "outro", descricao: "Equipamento de gravação", valor: centavos(s.entre(150, 900)), recorrente: false, criado_em: `${avulsa}T10:00:00Z`, atualizado_em: `${avulsa}T10:00:00Z`, criado_por: null });
    }

    banco.metas_operacao.push({ id: `mo-${mes}`, periodo: "mensal", referencia: `${mes}-01`, meta_faturamento: 160000, meta_lucro: 38000, criado_em: `${mes}-01T00:00:00Z`, atualizado_em: `${mes}-01T00:00:00Z` });

    const [ano, numeroMes] = mes.split("-").map(Number);
    banco.metas.push(
      { id: `m-${mes}-1`, vendedora_id: PESSOAS.vendedora1.id, ano, mes: numeroMes, meta_diaria: 2800 },
      { id: `m-${mes}-2`, vendedora_id: PESSOAS.vendedora2.id, ano, mes: numeroMes, meta_diaria: 2400 },
    );
  }

  for (let seg = inicioSemana(inicio); seg <= hoje; seg = addDias(seg, 7)) {
    banco.metas_operacao.push({ id: `mo-s-${seg}`, periodo: "semanal", referencia: seg, meta_faturamento: 37000, meta_lucro: 9000, criado_em: `${seg}T00:00:00Z`, atualizado_em: `${seg}T00:00:00Z` });
  }

  // ------------------------------------------------------------ vendedoras
  // O que cada uma lançou no fim do dia. Hoje, só a primeira já lançou o
  // parcial do turno.
  for (const [dia, receita] of receitaDoDia) {
    if (dia > hoje) continue;
    const parte1 = s.entre(0.48, 0.6);
    banco.vendas_diarias.push(
      { id: `vd-${dia}-1`, vendedora_id: PESSOAS.vendedora1.id, data: dia, valor: centavos(receita * 0.9 * parte1), criado_em: `${dia}T23:30:00Z`, atualizado_em: `${dia}T23:30:00Z`, criado_por: PESSOAS.vendedora1.id },
    );
    // Um dia esquecido na semana passada, para a tela mostrar o aviso.
    if (dia === addDias(hoje, -9) || dia === hoje) continue;
    banco.vendas_diarias.push(
      { id: `vd-${dia}-2`, vendedora_id: PESSOAS.vendedora2.id, data: dia, valor: centavos(receita * 0.9 * (1 - parte1)), criado_em: `${dia}T23:30:00Z`, atualizado_em: `${dia}T23:30:00Z`, criado_por: PESSOAS.vendedora2.id },
    );
  }

  // ------------------------------------------------------------ suporte
  const vendasPorPedido = new Map<string, Linha>();
  for (const v of banco.vendas!) {
    if (v.pedido_chave === null) vendasPorPedido.set(v.pedido_externo_id as string, v);
  }
  let seqSolicitacao = 0;
  const desdeSuporte = addDias(hoje, -75);

  for (const v of vendasPorPedido.values()) {
    const dia = v.ocorrido_dia as string;
    if (dia < desdeSuporte) continue;
    const devolvida = v.status === "reembolsada";
    // Toda devolução passou pelo suporte; algumas vendas de pé também, e
    // parte delas foi revertida.
    if (!devolvida && !(v.status === "aprovada" && s.chance(0.035))) continue;

    const solicitadoDia = devolvida ? addDias(v.reembolsado_dia as string, -s.inteiro(0, 2)) : addDias(dia, s.inteiro(1, 10));
    if (solicitadoDia > hoje) continue;
    const idadeDias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${solicitadoDia}T12:00:00Z`)) / 86_400_000);

    let status: string;
    if (devolvida) status = "perdida";
    else if (idadeDias <= 1) status = s.chance(0.7) ? "aberta" : "em_contato";
    else if (idadeDias <= 4) status = s.pesado([["em_contato", 50], ["revertida", 40], ["aberta", 10]] as const);
    else status = s.pesado([["revertida", 80], ["recusada", 20]] as const);

    const revertidaDia = status === "revertida" ? addDias(solicitadoDia, Math.min(idadeDias, s.inteiro(0, 3))) : null;
    const atendido = status !== "aberta";
    const hora = s.inteiro(8 * 60, 21 * 60);

    banco.solicitacoes_reembolso.push({
      id: `s-${(seqSolicitacao += 1)}`,
      externo_id: `sol-${seqSolicitacao}`,
      plataforma: v.plataforma,
      venda_externo_id: v.pedido_externo_id,
      cliente_nome: v.cliente_nome,
      cliente_email: v.cliente_email,
      cliente_telefone: `(11) 9${String(s.inteiro(1000, 9999))}-${String(s.inteiro(1000, 9999))}`,
      produto_nome: v.produto_nome,
      valor: v.valor_bruto,
      motivo_cliente: s.um(MOTIVOS),
      status,
      anotacao_suporte: atendido && s.chance(0.85) ? s.um(ANOTACOES) : null,
      resposta_vendedor: null,
      atendido_por: atendido ? PESSOAS.suporte.id : null,
      solicitado_em: horario(solicitadoDia, hora),
      revertida_em: revertidaDia ? `${revertidaDia}T18:00:00-03:00` : null,
      criado_em: horario(solicitadoDia, hora),
      atualizado_em: horario(solicitadoDia, hora),
    });
  }

  // ------------------------------------------------------------ CRM
  const etapas = [
    ["e-1", "Novo lead", null],
    ["e-2", "Em conversa", null],
    ["e-3", "Pediu o link", "pediu_o_link"],
    ["e-4", "Link enviado", null],
    ["e-5", "Retomada", "retomadas"],
    ["e-6", "Comprou", null],
    ["e-7", "Sem interesse", null],
  ] as const;
  etapas.forEach(([id, nome, papel], indice) =>
    banco.dc_etapas.push({ id, nome, papel, indice, pipeline_id: "p-1", pipeline_nome: "Funil de vendas", cor: null, visto_em: `${hoje}T00:00:00Z` }),
  );

  let leadsTotal = 18_400;
  for (let i = 29; i >= 0; i -= 1) {
    const dia = addDias(hoje, -i);
    const ehHoje = i === 0;
    const fracao = ehHoje ? Math.min(1, minutosAgora / (24 * 60)) : 1;
    const leads = Math.round(s.inteiro(45, 95) * fracao);
    leadsTotal += leads;
    banco.dc_snapshots.push({
      id: `dc-${dia}`,
      colhido_em: ehHoje ? new Date(Date.now() - 7 * 60_000).toISOString() : `${dia}T23:45:00-03:00`,
      colhido_dia: dia,
      conversas_unstarted: s.inteiro(2, 14),
      conversas_waiting: s.inteiro(6, 24),
      conversas_opened: s.inteiro(25, 60),
      esperando_resposta: s.inteiro(4, 18),
      esperando_atrasadas: s.inteiro(0, 6),
      esperando_24h: s.inteiro(0, 4),
      atrasadas_24h: s.inteiro(0, 5),
      espera_maxima_min: s.inteiro(12, 240),
      leads_do_dia: leads,
      leads_7dias: s.inteiro(420, 560),
      leads_total: leadsTotal,
      negocios_total: s.inteiro(900, 1300),
      negocios_movidos_hoje: Object.fromEntries(
        etapas.map(([id], k) => [id, Math.round(Math.max(0, s.inteiro(0, 40) - k * 4) * fracao)]),
      ),
      erro: null,
    });
  }

  // ------------------------------------------------------------ meses de planilha
  // Antes do painel, o fechamento era digitado. São os seis meses anteriores
  // ao primeiro dia com venda registrada.
  const primeiroMes = `${inicio.slice(0, 7)}-01`;
  for (let k = 6; k >= 1; k -= 1) {
    const d = new Date(`${primeiroMes}T12:00:00`);
    d.setMonth(d.getMonth() - k);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const faturamento = centavos(95_000 + (6 - k) * 9_000 + s.entre(-6000, 6000));
    banco.faturamento_mensal.push({
      mes,
      faturamento_bruto: faturamento,
      ads: centavos(faturamento * s.entre(0.3, 0.37)),
      despesas: centavos(s.entre(3200, 4200)),
      folha: centavos(faturamento * 0.09),
      impostos: centavos(faturamento * 0.06),
      retiradas: 15000,
      observacao: k === 6 ? "Fechamento lançado da planilha antiga." : null,
      criado_em: `${mes}T00:00:00Z`,
      atualizado_em: `${mes}T00:00:00Z`,
    });
  }

  return banco;
}
