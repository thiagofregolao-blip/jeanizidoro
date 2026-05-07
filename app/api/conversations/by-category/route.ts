import { NextRequest, NextResponse } from "next/server";
import type { ContactCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

const VALID: ContactCategory[] = ["UNKNOWN", "SUPPLIER", "TEAM", "FAMILY", "PARTNER", "OTHER"];

/**
 * Lista conversas agrupadas por categoria — usado pras abas não-evento do painel.
 * Não inclui CLIENT (esses ficam na aba "Festas e Eventos" com pipeline de Lead).
 *
 * Cada item retorna info pra renderizar o card:
 * - contato (nome, telefone)
 * - última mensagem (conteúdo + direção + timestamp)
 * - categoria + confidence + reason da Marina
 * - tempo aguardando resposta (se última msg foi do contato e não foi respondida)
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cat = (url.searchParams.get("category") || "OTHER") as ContactCategory;
  if (!VALID.includes(cat)) {
    return NextResponse.json({ error: "categoria inválida" }, { status: 400 });
  }

  const contacts = await prisma.contact.findMany({
    where: { category: cat },
    select: {
      id: true,
      name: true,
      phone: true,
      category: true,
      categoryConfidence: true,
      categoryReason: true,
      conversations: {
        orderBy: { lastMsgAt: "desc" },
        take: 1,
        select: {
          id: true,
          lastMsgAt: true,
          status: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, direction: true, sender: true, createdAt: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const items = contacts
    .filter((c) => c.conversations.length > 0)
    .map((c) => {
      const conv = c.conversations[0];
      const lastMsg = conv.messages[0];
      const lastMsgFromContact = lastMsg?.direction === "IN";
      const waitingMs = lastMsgFromContact && lastMsg
        ? Date.now() - new Date(lastMsg.createdAt).getTime()
        : 0;
      const waitingDays = Math.floor(waitingMs / (24 * 3600 * 1000));
      const waitingHours = Math.floor(waitingMs / (3600 * 1000));
      return {
        contactId: c.id,
        name: c.name,
        phone: c.phone,
        category: c.category,
        categoryConfidence: c.categoryConfidence,
        categoryReason: c.categoryReason,
        conversationId: conv.id,
        lastMsgAt: conv.lastMsgAt,
        lastMsg: lastMsg
          ? {
              preview: lastMsg.content.slice(0, 140),
              fromContact: lastMsgFromContact,
              sender: lastMsg.sender,
              createdAt: lastMsg.createdAt,
            }
          : null,
        waitingDays,
        waitingHours,
      };
    });

  return NextResponse.json({ items });
}
