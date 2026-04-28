import { prisma } from "./prisma";
import type { ZapiInbound } from "./zapi";

const INSTA_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/gi;
const PINTEREST_REGEX = /https?:\/\/(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+\/[^\s]+/gi;
const ANY_URL_REGEX = /https?:\/\/[^\s]+/gi;

/**
 * Detecta inspirações no payload Z-API (imagem ou link Instagram/Pinterest)
 * e cria registros Inspiration vinculados ao lead.
 *
 * Retorna o número de inspirações criadas, e se foi tipo "image" ou "link".
 */
export async function captureFromMessage(
  payload: ZapiInbound,
  leadId: string
): Promise<{ created: number; types: ("image" | "link")[] }> {
  const types: ("image" | "link")[] = [];

  // 1. Imagem
  if (payload.image?.imageUrl) {
    await prisma.inspiration.create({
      data: {
        leadId,
        type: "image",
        url: payload.image.imageUrl,
        caption: payload.image.caption || null,
        source: "whatsapp",
      },
    });
    types.push("image");
  }

  // 2. Links em texto (Instagram / Pinterest / qualquer URL)
  const text =
    payload.text?.message || payload.image?.caption || "";

  const insta = [...text.matchAll(INSTA_REGEX)].map((m) => m[0]);
  const pinterest = [...text.matchAll(PINTEREST_REGEX)].map((m) => m[0]);

  for (const url of insta) {
    await prisma.inspiration.create({
      data: { leadId, type: "link", url, source: "instagram" },
    });
    types.push("link");
  }
  for (const url of pinterest) {
    await prisma.inspiration.create({
      data: { leadId, type: "link", url, source: "pinterest" },
    });
    types.push("link");
  }

  return { created: types.length, types };
}

/**
 * Verifica rapidamente se a mensagem tem QUALQUER potencial inspiração
 * (imagem OU link) — usado pra Marina ajustar a resposta dela.
 */
export function messageHasInspirationHint(payload: ZapiInbound): boolean {
  if (payload.image?.imageUrl) return true;
  const text = payload.text?.message || "";
  return ANY_URL_REGEX.test(text);
}
