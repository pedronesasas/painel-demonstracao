import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * No painel de verdade, aqui fica o login. A demonstração não tem login:
 * quem chega neste endereço vai direto para o Dashboard.
 */
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
