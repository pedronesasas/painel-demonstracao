/**
 * Um Supabase de mentira, que roda inteiro no navegador.
 *
 * Implementa a parte da API que o painel usa — `from().select().eq()...`,
 * `rpc`, e o login — sobre o banco gerado em `dados.ts`. As telas continuam
 * escritas contra o Supabase de verdade e não sabem que estão numa
 * demonstração.
 *
 * O que o visitante grava (lançamentos, despesas, status de atendimento) fica
 * na memória da aba e some ao recarregar a página.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addDias, hojeISO } from "@/lib/semana";
import { PESSOAS, gerarBanco, type Banco, type Linha } from "./dados";

type Tabelas = Record<string, Linha[]>;
type Resposta = { data: unknown; error: null | { message: string }; count?: number | null };

let _banco: Banco | null = null;
function banco(): Banco {
  _banco ??= gerarBanco();
  return _banco;
}

/** O mesmo banco, acessado pelo nome da tabela que a consulta recebeu. */
const tabelas = () => banco() as unknown as Tabelas;

const atraso = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

// ---------------------------------------------------------------- select

/** Separa por vírgula, respeitando os parênteses de tabelas embutidas. */
function partes(texto: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const c of texto) {
    if (c === "(") nivel += 1;
    if (c === ")") nivel -= 1;
    if (c === "," && nivel === 0) {
      saida.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}

/** Relações que o painel embute num select: tabela → (coluna local, tabela, coluna remota). */
const RELACOES: Record<string, Record<string, [string, string]>> = {
  user_roles: { profiles: ["user_id", "id"] },
};

function projetar(tabela: string, linha: Linha, colunas: string): { linha: Linha; ok: boolean } {
  if (colunas.trim() === "*" || colunas.trim() === "") return { linha: { ...linha }, ok: true };
  const saida: Linha = {};
  let ok = true;
  for (const parte of partes(colunas)) {
    const embutida = parte.match(/^(\w+)(!inner)?\((.*)\)$/s);
    if (embutida) {
      const [, outra, inner, cols] = embutida;
      const rel = RELACOES[tabela]?.[outra!];
      const alvo = rel ? tabelas()[outra!]?.find((l) => l[rel[1]] === linha[rel[0]]) : undefined;
      if (!alvo && inner) ok = false;
      saida[outra!] = alvo ? projetar(outra!, alvo, cols!).linha : null;
      continue;
    }
    const [apelido, caminho] = parte.includes(":") ? parte.split(":").map((x) => x.trim()) : [null, parte];
    const passos = caminho!.split("->").map((x) => x.trim());
    let valor: unknown = linha[passos[0]!];
    for (const p of passos.slice(1)) valor = valor && typeof valor === "object" ? (valor as Linha)[p] : null;
    saida[apelido ?? passos[passos.length - 1]!] = valor ?? null;
  }
  return { linha: saida, ok };
}

// ---------------------------------------------------------------- consulta

type Operacao = "select" | "insert" | "update" | "upsert" | "delete";

let seqId = 0;
const novoId = () => `demo-${Date.now().toString(36)}-${(seqId += 1)}`;

function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

class Consulta implements PromiseLike<Resposta> {
  private filtros: ((l: Linha) => boolean)[] = [];
  private ordens: [string, boolean][] = [];
  private faixa: [number, number] | null = null;
  private colunas = "*";
  private devolver = false;
  private unico: "single" | "maybe" | null = null;
  private operacao: Operacao = "select";
  private valores: Linha | Linha[] | null = null;
  private conflito: string[] = [];

  constructor(private tabela: string) {}

  select(colunas = "*") {
    if (this.operacao === "select") this.colunas = colunas;
    else this.devolver = true;
    return this;
  }
  insert(v: Linha | Linha[]) {
    this.operacao = "insert";
    this.valores = v;
    return this;
  }
  update(v: Linha) {
    this.operacao = "update";
    this.valores = v;
    return this;
  }
  upsert(v: Linha | Linha[], opcoes?: { onConflict?: string }) {
    this.operacao = "upsert";
    this.valores = v;
    this.conflito = (opcoes?.onConflict ?? "id").split(",").map((c) => c.trim());
    return this;
  }
  delete() {
    this.operacao = "delete";
    return this;
  }

  private filtro(f: (l: Linha) => boolean) {
    this.filtros.push(f);
    return this;
  }
  eq(c: string, v: unknown) {
    return this.filtro((l) => l[c] === v || (l[c] !== null && v !== null && String(l[c]) === String(v)));
  }
  neq(c: string, v: unknown) {
    return this.filtro((l) => l[c] !== v);
  }
  gt(c: string, v: unknown) {
    return this.filtro((l) => l[c] != null && comparar(l[c], v) > 0);
  }
  gte(c: string, v: unknown) {
    return this.filtro((l) => l[c] != null && comparar(l[c], v) >= 0);
  }
  lt(c: string, v: unknown) {
    return this.filtro((l) => l[c] != null && comparar(l[c], v) < 0);
  }
  lte(c: string, v: unknown) {
    return this.filtro((l) => l[c] != null && comparar(l[c], v) <= 0);
  }
  in(c: string, lista: unknown[]) {
    return this.filtro((l) => lista.includes(l[c]));
  }
  is(c: string, v: unknown) {
    return this.filtro((l) => (l[c] ?? null) === v);
  }
  match(obj: Linha) {
    for (const [c, v] of Object.entries(obj)) this.eq(c, v);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.ordens.push([c, o?.ascending ?? true]);
    return this;
  }
  range(de: number, ate: number) {
    this.faixa = [de, ate];
    return this;
  }
  limit(n: number) {
    this.faixa = [0, n - 1];
    return this;
  }
  single() {
    this.unico = "single";
    return this;
  }
  maybeSingle() {
    this.unico = "maybe";
    return this;
  }

  private tabelaViva(): Linha[] {
    const t = tabelas();
    t[this.tabela] ??= [];
    return t[this.tabela]!;
  }

  private executar(): Resposta {
    const linhas = this.tabelaViva();
    const passa = (l: Linha) => this.filtros.every((f) => f(l));

    if (this.operacao === "insert" || this.operacao === "upsert") {
      const novas = Array.isArray(this.valores) ? this.valores : [this.valores ?? {}];
      const gravadas: Linha[] = [];
      for (const v of novas) {
        const existente =
          this.operacao === "upsert"
            ? linhas.find((l) => this.conflito.every((c) => String(l[c]) === String(v[c])))
            : undefined;
        if (existente) {
          Object.assign(existente, v, { atualizado_em: new Date().toISOString() });
          gravadas.push(existente);
        } else {
          const agora = new Date().toISOString();
          const linha = { id: novoId(), criado_em: agora, atualizado_em: agora, ...v };
          linhas.push(linha);
          gravadas.push(linha);
        }
      }
      return this.resposta(gravadas);
    }

    if (this.operacao === "update") {
      const alvo = linhas.filter(passa);
      for (const l of alvo) Object.assign(l, this.valores, { atualizado_em: new Date().toISOString() });
      return this.resposta(alvo);
    }

    if (this.operacao === "delete") {
      const removidas = linhas.filter(passa);
      tabelas()[this.tabela] = linhas.filter((l) => !passa(l));
      return this.resposta(removidas);
    }

    let resultado = linhas.filter(passa);
    if (this.ordens.length > 0) {
      resultado = [...resultado].sort((a, b) => {
        for (const [c, asc] of this.ordens) {
          const r = comparar(a[c], b[c]);
          if (r !== 0) return asc ? r : -r;
        }
        return 0;
      });
    }
    const projetadas = resultado
      .map((l) => projetar(this.tabela, l, this.colunas))
      .filter((p) => p.ok)
      .map((p) => p.linha);
    const pagina = this.faixa ? projetadas.slice(this.faixa[0], this.faixa[1] + 1) : projetadas;
    return this.resposta(pagina, true);
  }

  private resposta(linhas: Linha[], jaProjetadas = false): Resposta {
    if (this.operacao !== "select" && !this.devolver) return { data: null, error: null };
    const dados = jaProjetadas ? linhas : linhas.map((l) => projetar(this.tabela, l, this.colunas).linha);
    if (this.unico) {
      if (dados.length > 1 || (this.unico === "single" && dados.length === 0)) {
        return { data: null, error: { message: "Esperava uma linha só." } };
      }
      return { data: dados[0] ?? null, error: null };
    }
    return { data: dados.map((d) => ({ ...d })), error: null };
  }

  then<A = Resposta, B = never>(
    ok?: ((v: Resposta) => A | PromiseLike<A>) | null,
    falha?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return atraso()
      .then(() => this.executar())
      .then(ok, falha);
  }
}

// ---------------------------------------------------------------- rpc

const DEVOLUCOES = ["reembolsada", "chargeback"];
const APROVADAS_ALGUM_DIA = ["aprovada", ...DEVOLUCOES];

/** O extrato do suporte no mês: pedidos, reembolsos e reversões. */
function suporteResumoMes(mes: string) {
  const b = banco();
  const inicio = `${mes.slice(0, 7)}-01`;
  const fim = addDias(`${addDias(inicio, 32).slice(0, 7)}-01`, -1);
  const dentro = (d: string) => d >= inicio && d <= fim;
  const pedido = (v: Linha) => (v.pedido_chave ?? v.pedido_externo_id ?? v.id) as string;

  const vendas: Record<string, Set<string>> = { plataforma_a: new Set(), plataforma_b: new Set() };
  const reembolsos: Record<string, Set<string>> = { plataforma_a: new Set(), plataforma_b: new Set() };
  for (const v of b.vendas) {
    const p = v.plataforma as string;
    if (APROVADAS_ALGUM_DIA.includes(v.status as string) && dentro(v.ocorrido_dia as string)) vendas[p]!.add(pedido(v));
    const dia = (v.reembolsado_dia ?? v.ocorrido_dia) as string;
    if (DEVOLUCOES.includes(v.status as string) && dentro(dia)) reembolsos[p]!.add(pedido(v));
  }

  const revertidas = (b.solicitacoes_reembolso)
    .filter((s) => s.status === "revertida" && s.revertida_em && dentro((s.revertida_em as string).slice(0, 10)))
    .map((s) => {
      const itens = (b.vendas).filter((v) => pedido(v) === s.venda_externo_id);
      const soma = (c: string) => itens.reduce((t, v) => t + Number(v[c] ?? 0), 0);
      const plataformaA = s.plataforma === "plataforma_a";
      const bruto = soma("valor_bruto");
      return {
        id: s.id,
        cliente_nome: s.cliente_nome,
        produto_nome: s.produto_nome,
        plataforma: s.plataforma,
        revertida_dia: (s.revertida_em as string).slice(0, 10),
        com_registro: Boolean(s.anotacao_suporte),
        valor_bruto: itens.length ? bruto : null,
        juros_parcelamento: itens.length ? soma("juros_parcelamento") : null,
        liquido_plataforma: plataformaA ? null : itens[0]?.liquido_plataforma ?? null,
        liquido_estimado: plataformaA && itens.length ? bruto * (1 - 0.0499) - itens.length : null,
        status_venda: itens[0]?.status ?? null,
        perc_juros_repassado: plataformaA ? 0 : 10,
      };
    });

  const contar = (r: Record<string, Set<string>>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.size]));

  return { imposto_percentual: 6, vendas: contar(vendas), reembolsos: contar(reembolsos), revertidas };
}

// ---------------------------------------------------------------- login

/**
 * A demonstração não tem login: quem abre o painel já está dentro, como
 * administrador, vendo todas as telas da gestão.
 */
type Sessao = { user: { id: string; email: string }; access_token: string };

const SESSAO: Sessao = {
  user: { id: PESSOAS.gestora.id, email: PESSOAS.gestora.email },
  access_token: "demo",
};

const auth = {
  async getSession() {
    return { data: { session: SESSAO }, error: null };
  },
  async getUser() {
    return { data: { user: SESSAO.user }, error: null };
  },
  async getClaims() {
    return { data: { claims: { sub: SESSAO.user.id, email: SESSAO.user.email } }, error: null };
  },
  onAuthStateChange(_ouvinte: (evento: string, sessao: Sessao | null) => void) {
    return { data: { subscription: { unsubscribe: () => undefined } } };
  },
  async signInWithPassword() {
    return { data: { session: SESSAO, user: SESSAO.user }, error: null };
  },
  async signOut() {
    return { error: null };
  },
};

// ---------------------------------------------------------------- cliente

const cliente = {
  from: (tabela: string) => new Consulta(tabela),
  async rpc(nome: string, args: Record<string, unknown> = {}) {
    await atraso();
    if (nome === "suporte_resumo_mes") return { data: suporteResumoMes(String(args["p_mes"] ?? hojeISO())), error: null };
    if (nome === "has_role") {
      const papel = banco().user_roles.find((r) => r.user_id === args["_user_id"])?.role;
      return { data: papel === args["_role"], error: null };
    }
    return { data: null, error: { message: `Função ${nome} não existe na demonstração.` } };
  },
  auth,
};

/**
 * Tipado como o cliente de verdade, para o resto do código não mudar. A
 * demonstração cobre só o que as telas usam.
 */
export const supabaseDemo = cliente as unknown as SupabaseClient<Database>;
