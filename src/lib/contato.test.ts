import { describe, expect, test } from "bun:test";
import { linkWhatsApp } from "./contato";

describe("link do WhatsApp", () => {
  test("do jeito que a Plataforma B manda", () => {
    expect(linkWhatsApp("+5511900001234")).toBe("https://wa.me/5511900001234");
  });

  test("digitado à mão, sem código do país: vira brasileiro", () => {
    expect(linkWhatsApp("(11) 90000-1234")).toBe("https://wa.me/5511900001234");
    expect(linkWhatsApp("1130001234")).toBe("https://wa.me/551130001234");
  });

  test("estrangeiro com + fica como veio, mesmo tendo 11 dígitos", () => {
    expect(linkWhatsApp("+1 305 555 0100")).toBe("https://wa.me/13055550100");
  });

  test("00 na frente é o jeito antigo de discar internacional", () => {
    expect(linkWhatsApp("0055 11 90000-1234")).toBe("https://wa.me/5511900001234");
  });

  test("sem telefone, ou curto demais, não há botão", () => {
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp("")).toBeNull();
    expect(linkWhatsApp("90000-1234")).toBeNull();
  });
});
