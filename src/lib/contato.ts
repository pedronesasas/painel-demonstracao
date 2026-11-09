/**
 * Link para abrir a conversa com o cliente no WhatsApp.
 *
 * O `wa.me` só aceita o número inteiro com o código do país, sem nenhum
 * símbolo. A Plataforma B manda "+5511900001234", mas cadastro digitado à mão chega
 * de todo jeito: "(11) 90000-1234", "11900001234", "+1 305 555 0100".
 *
 * Com "+" na frente, o código do país já veio e fica como está. Sem ele, 10 ou
 * 11 dígitos são um número brasileiro com DDD, e ganham o 55. Um número dos EUA
 * sem o "+" também tem 11 dígitos e seria lido como brasileiro — por isso o
 * "+" decide, e não a contagem.
 */
export function linkWhatsApp(telefone: string | null): string | null {
  if (!telefone) return null;
  const internacional = telefone.trim().startsWith("+");
  let digitos = telefone.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);

  if (!internacional && (digitos.length === 10 || digitos.length === 11)) {
    digitos = `55${digitos}`;
  }
  // Curto demais para ser um número completo: melhor não mostrar o botão do
  // que abrir o WhatsApp numa conversa com um número que não existe.
  if (digitos.length < 11) return null;
  return `https://wa.me/${digitos}`;
}
