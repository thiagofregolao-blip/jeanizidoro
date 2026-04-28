import { prisma } from "./prisma";
import { sendText, setTyping } from "./zapi";
import { logError } from "./reliability";

const TAKEOVER_NOTICE =
  "💫 A partir de agora, o Jean vai conduzir nossa conversa pessoalmente. Foi um prazer te atender por aqui!";

/**
 * Envia aviso de takeover humano se for a primeira vez que Jean assume
 * após Marina ter sido a última a falar. Idempotente — chama várias vezes
 * em sequência sem duplicar.
 *
 * Lógica:
 * - Busca a última msg OUT da conversa
 * - Se sender === "AI" (Marina foi a última) → envia aviso
 * - Se sender === "HUMAN" (Jean já falou recente) → não faz nada
 *
 * Marca lastTakeoverNoticeAt na conversa pra fins de auditoria.
 */
export async function maybeSendTakeoverNotice(conversationId: string): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });
  if (!conv) return false;

  const lastOut = await prisma.message.findFirst({
    where: { conversationId, direction: "OUT" },
    orderBy: { createdAt: "desc" },
  });

  // Se não tem msg OUT ainda OU a última foi do Jean, não envia aviso
  if (!lastOut || lastOut.sender !== "AI") return false;

  // Marina foi a última a falar → envia aviso
  try {
    await setTyping(conv.contact.phone, 1500);
    const sent = await sendText(conv.contact.phone, TAKEOVER_NOTICE);
    await prisma.message.create({
      data: {
        conversationId,
        direction: "OUT",
        sender: "AI",
        content: TAKEOVER_NOTICE,
        zapiMessageId: sent?.messageId ?? null,
        meta: { takeoverNotice: true } as object,
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastTakeoverNoticeAt: new Date() },
    });
    console.log(`[TAKEOVER] aviso enviado pra conv=${conversationId}`);
    return true;
  } catch (e) {
    await logError("takeover", e instanceof Error ? e.message : String(e), { conversationId });
    return false;
  }
}
