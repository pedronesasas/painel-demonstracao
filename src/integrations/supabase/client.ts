// Na demonstração não existe banco remoto: o cliente é o de `src/demo`, que
// gera os dados no navegador e responde com a mesma API do Supabase.
//
// Importe assim:
// import { supabase } from "@/integrations/supabase/client";
export { supabaseDemo as supabase } from "@/demo/cliente";
