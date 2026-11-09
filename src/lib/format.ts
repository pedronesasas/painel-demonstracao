export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

/** Ex.: "07/09" */
export function formatDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Ex.: "07/09/2026" */
export function formatData(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDataHora(value: string): string {
  const dt = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

/**
 * Há quanto tempo, em palavras: "há 2 h", "há 3 dias".
 *
 * No suporte a idade do pedido é o dado mais importante depois do valor: a
 * janela entre o cliente pedir o reembolso e a plataforma aceitar é curta, e
 * um card parado há três dias não é o mesmo que um que chegou agora. A data
 * absoluta não diz isso sem o leitor fazer a conta de cabeça.
 */
export function formatHaQuantoTempo(value: string, agora = new Date()): string {
  const minutos = Math.floor((agora.getTime() - new Date(value).getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Converte texto digitado com máscara em número. */
export function parseMoeda(texto: string): number {
  const limpo = texto.replace(/[^\d]/g, "");
  if (!limpo) return 0;
  return Number(limpo) / 100;
}

/** Aplica máscara de moeda enquanto digita. */
export function maskMoeda(texto: string): string {
  const valor = parseMoeda(texto);
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
