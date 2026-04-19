import { prisma } from "./prisma";
import type { ContactProfile } from "./claude";

type AttendDraft = {
  services?: string[];
  totalValue?: string;
  paymentTerms?: string;
  style?: string;
  notes?: string;
};

/**
 * Monta um dossiê completo do lead em markdown.
 * Incluído no prompt da Sofia como "memória persistente" estruturada.
 * Assim a Sofia sabe TUDO sobre o cliente sem depender só do histórico de msgs.
 */
export async function buildLeadDossier(conversationId: string): Promise<string> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: true,
    },
  });
  if (!conv) return "";

  const { contact, lead } = conv;
  const profile = (contact.profile as ContactProfile | null) || null;
  const draft = (lead?.attendDraft as AttendDraft | null) || null;

  const contracts = await prisma.contract.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const lines: string[] = [];
  lines.push("# 📋 DOSSIÊ DO CLIENTE");
  lines.push("");

  // Identificação
  lines.push("## 👤 Identificação");
  lines.push(`- **Nome**: ${contact.name || profile?.preferredName || "(ainda não informado)"}`);
  lines.push(`- **WhatsApp**: ${contact.phone}`);
  if (contact.email) lines.push(`- **Email**: ${contact.email}`);
  if (contact.tone) lines.push(`- **Tom de conversa habitual**: ${contact.tone}`);
  if (contact.firstMsgAt) {
    lines.push(`- **Primeira mensagem**: ${contact.firstMsgAt.toLocaleDateString("pt-BR")}`);
  }
  if (contact.isVip) lines.push(`- ⭐ **CONTATO VIP** — trate com atenção especial`);
  lines.push("");

  // Evento
  if (lead) {
    lines.push("## 🎉 Evento");
    if (lead.eventType) lines.push(`- **Tipo**: ${lead.eventType}`);
    if (lead.eventDate) {
      const d = new Date(lead.eventDate);
      lines.push(`- **Data**: ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`);
    }
    if (lead.guestCount) lines.push(`- **Convidados**: ${lead.guestCount}`);
    if (lead.location) lines.push(`- **Local**: ${lead.location}`);
    if (lead.style) lines.push(`- **Estilo / referências**: ${lead.style}`);
    if (lead.budget) lines.push(`- **Orçamento mencionado**: ${lead.budget}`);
    lines.push(`- **Temperatura do lead**: ${lead.temperature} (score ${lead.score}/100)`);
    lines.push(`- **Status no funil**: ${translateStatus(lead.status)}`);
    if (lead.summary) {
      lines.push(`- **Resumo**: ${lead.summary}`);
    }
    lines.push("");
  }

  // Memória do cliente (profile)
  if (profile && (profile.interests?.length || profile.pastEvents?.length || profile.notesFromAi?.length)) {
    lines.push("## 🧠 Memória sobre o cliente");
    if (profile.pastEvents?.length) {
      lines.push(`- **Eventos passados mencionados**: ${profile.pastEvents.join("; ")}`);
    }
    if (profile.interests?.length) {
      lines.push(`- **Interesses demonstrados**: ${profile.interests.join(", ")}`);
    }
    if (profile.notesFromAi?.length) {
      lines.push(`- **Observações aprendidas**:`);
      profile.notesFromAi.slice(-5).forEach((n) => lines.push(`  - ${n}`));
    }
    if (profile.lastTopics?.length) {
      lines.push(`- **Últimos tópicos falados**: ${profile.lastTopics.join(", ")}`);
    }
    lines.push("");
  }

  // Memória curta dinâmica — atualizada pelo Haiku a cada msg
  if (
    profile &&
    (profile.recentInteractions?.length ||
      profile.clientAlreadyAsked?.length ||
      profile.sofiaAlreadyExplained?.length ||
      profile.nextBestAction)
  ) {
    lines.push("## 📝 Interações recentes (MUITO IMPORTANTE — LEIA)");
    if (profile.recentInteractions?.length) {
      lines.push(`**O que rolou nas últimas trocas:**`);
      profile.recentInteractions.forEach((i) => lines.push(`- ${i}`));
    }
    if (profile.clientAlreadyAsked?.length) {
      lines.push(`\n**Perguntas que o cliente JÁ FEZ** (não peça pra repetir):`);
      profile.clientAlreadyAsked.slice(-5).forEach((q) => lines.push(`- ${q}`));
    }
    if (profile.sofiaAlreadyExplained?.length) {
      lines.push(`\n**O que VOCÊ já explicou pro cliente** (não repita literal):`);
      profile.sofiaAlreadyExplained.slice(-5).forEach((e) => lines.push(`- ${e}`));
    }
    if (profile.nextBestAction) {
      lines.push(`\n**🎯 Próxima melhor ação sugerida**: ${profile.nextBestAction}`);
    }
    lines.push("");
  }

  // Atendimento em andamento (presencial / draft)
  if (draft && (draft.services?.length || draft.totalValue || draft.paymentTerms)) {
    lines.push("## 💼 Atendimento em andamento (presencial ou via painel)");
    if (draft.services?.length) {
      lines.push(`- **Serviços discutidos**: ${draft.services.join(", ")}`);
    }
    if (draft.totalValue) {
      lines.push(`- **Valor apresentado pelo Jean**: R$ ${draft.totalValue}`);
    }
    if (draft.paymentTerms) {
      lines.push(`- **Condições de pagamento**: ${draft.paymentTerms}`);
    }
    if (draft.notes) {
      lines.push(`- **Observações**: ${draft.notes}`);
    }
    lines.push(
      `\n⚠️ Cliente já teve atendimento com o Jean. Se perguntar sobre esses tópicos, use as informações acima — não finja que não sabe.`
    );
    lines.push("");
  }

  // Contratos
  if (contracts.length > 0) {
    lines.push("## 📄 Contratos");
    for (const c of contracts) {
      const statusLabel =
        c.status === "SIGNED" ? "✅ ASSINADO" :
        c.status === "SENT" ? "📤 enviado, aguardando assinatura" :
        c.status === "VIEWED" ? "👁 visto pelo cliente" :
        c.status === "CANCELLED" ? "❌ cancelado" :
        "📝 rascunho";
      const value = c.totalValue ? `R$ ${Number(c.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "valor não definido";
      lines.push(`- ${statusLabel} — ${value} (criado ${c.createdAt.toLocaleDateString("pt-BR")})`);
    }
    lines.push("");
  }

  // Estado da conversa
  lines.push("## 🤖 Estado do atendimento");
  if (conv.humanTakeoverAt) {
    lines.push(`- Jean respondeu pessoalmente em ${conv.humanTakeoverAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  }
  if (conv.status === "HANDLED_BY_HUMAN") {
    lines.push(`- 👤 Conversa atualmente conduzida pelo Jean`);
  }

  return lines.join("\n");
}

function translateStatus(s: string): string {
  const map: Record<string, string> = {
    NEW: "Novo",
    IN_SERVICE: "Em atendimento",
    PROPOSAL_SENT: "Proposta enviada",
    CONTRACT_SENT: "Contrato enviado",
    WON: "Fechado (cliente ✓)",
    LOST: "Perdido",
  };
  return map[s] || s;
}
