/**
 * Busca paginada até o fim.
 *
 * O Supabase devolve no máximo 1.000 linhas por consulta e NÃO avisa quando
 * corta: a resposta chega com 1.000 registros e nenhum erro. Um mês da
 * operação passa perto disso, e "últimos 30 dias" pega dois meses — o
 * faturamento sairia menor sem que ninguém percebesse.
 *
 * `montar` recebe o intervalo da página e devolve a consulta já com `.range()`.
 * A consulta precisa de ordenação estável, senão uma linha pode aparecer em
 * duas páginas e outra em nenhuma.
 */
export async function buscarTodas<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanho = 1000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar(de, de + tamanho - 1);
    // Antes, erro virava lista vazia — e lista vazia vira "faturamento zero"
    // na tela. Melhor a tela dizer que não carregou do que mostrar um zero.
    if (error) throw error;
    const lote = data ?? [];
    todas.push(...lote);
    if (lote.length < tamanho) return todas;
  }
}
