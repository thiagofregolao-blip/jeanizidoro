import Anthropic from "@anthropic-ai/sdk";
import { retry, withTimeout } from "./reliability";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

const CLAUDE_TIMEOUT_MS = 25000;

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

export type LeadExtraction = {
  temperature: "HOT" | "WARM" | "COLD";
  score: number;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  location: string | null;
  budget: string | null;
  style: string | null;
  contactName: string | null;
  summary: string;
  shouldEscalate: boolean;
};

export type ContactProfile = {
  preferredName?: string;
  detectedTone?: "formal" | "casual" | "mixed";
  pronouns?: string;
  interests?: string[];
  pastEvents?: string[];
  notesFromAi?: string[];
  lastTopics?: string[];
  // Novo: resumo estruturado das últimas trocas (atualizado pelo Haiku em background)
  recentInteractions?: string[];
  clientAlreadyAsked?: string[];
  sofiaAlreadyExplained?: string[];
  nextBestAction?: string;
};

const CLASSIFY_SCHEMA = `
{
  "temperature": "HOT" | "WARM" | "COLD",
  "score": <inteiro de 0 a 100, NUNCA string>,
  "eventType": "casamento" | "aniversario" | "corporativo" | "15 anos" | "outro" | null,
  "eventDate": "YYYY-MM-DD" | null,
  "guestCount": <inteiro ou null, NUNCA string>,
  "location": "string" | null,
  "budget": "string" | null,
  "style": "string" | null,
  "contactName": "string" | null,
  "summary": "1-2 frases resumindo o lead",
  "shouldEscalate": <boolean>
}

CRITÉRIOS DE shouldEscalate (seja CONSERVADOR — default é false):
- true APENAS se o cliente:
  * PEDIU EXPLICITAMENTE falar com humano/atendente/"falar com Jean"
  * Está reclamando, irritado ou insatisfeito
  * Fez pergunta técnica que só Jean pode responder (ex: projetos passados, assinatura, casos específicos)
- false em TODOS os outros casos, incluindo:
  * Cliente querendo agendar reunião (a Marina já faz isso)
  * Cliente confirmando interesse
  * Cliente dando informações do evento
  * Cliente dizendo "vamos agendar", "ok", "perfeito"
  * Cliente fazendo pergunta normal de orçamento/prazo

IMPORTANTE: score e guestCount DEVEM ser números inteiros JSON (ex: 85, 100), NÃO strings entre aspas.`;

export async function classifyLead(history: { role: "user" | "assistant"; content: string }[]) {
  const lastUserMsgs = history
    .filter((m) => m.role === "user")
    .slice(-10)
    .map((m) => m.content)
    .join("\n");

  const res = await retry(
    () =>
      withTimeout(
        anthropic.messages.create({
          model: HAIKU,
          max_tokens: 600,
          system: [
            {
              type: "text",
              text: `Você é um classificador de leads para Jean Izidoro, arquiteto de eventos (casamentos, corporativo, cenografia, 15 anos).
Analise a conversa e extraia dados em JSON estrito seguindo o schema:
${CLASSIFY_SCHEMA}

Critérios de temperatura:
- HOT: tem data + número de convidados + demonstra urgência OU pediu orçamento explícito OU quer reunião
- WARM: tem pelo menos data OU local OU tipo de evento + interesse claro em continuar
- COLD: só perguntou preço genérico, sem dados concretos, ou apenas curiosidade

Retorne SOMENTE o JSON, sem markdown, sem comentários.`,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: `Mensagens do contato:\n${lastUserMsgs}` }],
        }),
        CLAUDE_TIMEOUT_MS,
        "claude:classify"
      ),
    { retries: 2, baseDelayMs: 1500, label: "claude:classify" }
  );

  const txt = res.content[0].type === "text" ? res.content[0].text : "{}";
  const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as LeadExtraction;
  } catch {
    return {
      temperature: "COLD",
      score: 0,
      eventType: null,
      eventDate: null,
      guestCount: null,
      location: null,
      budget: null,
      style: null,
      contactName: null,
      summary: "Não foi possível classificar.",
      shouldEscalate: false,
    } as LeadExtraction;
  }
}

export async function detectTone(text: string): Promise<"formal" | "casual" | "mixed"> {
  if (text.length < 5) return "mixed";
  const formal = /(senhor|senhora|prezado|gostaria de|poderia|bom dia,|boa tarde,|boa noite,|atenciosamente|obrigado\.)/i;
  const casual = /(oi|oie|tudo bem|blz|kkk|rs|rsrs|mano|ata|vlw|valeu|haha|tmj|aee|massa|show|demais|👋|😂|🥰|😍|❤️)/i;
  const f = formal.test(text);
  const c = casual.test(text);
  if (c && !f) return "casual";
  if (f && !c) return "formal";
  return "mixed";
}

type GenerateReplyInput = {
  persona: string;
  businessContext: string;
  history: { role: "user" | "assistant"; content: string }[];
  contactName?: string | null;
  contactProfile?: ContactProfile | null;
  detectedTone?: "formal" | "casual" | "mixed";
  isFirstInteraction?: boolean;
  calendarContext?: string;
  humanTakeoverContext?: string;
  leadDossier?: string;
};

export async function generateReply(input: GenerateReplyInput): Promise<string[]> {
  const {
    persona,
    businessContext,
    history,
    contactName,
    contactProfile,
    detectedTone = "mixed",
    isFirstInteraction = false,
    calendarContext = "",
    humanTakeoverContext = "",
    leadDossier = "",
  } = input;

  const dossierBlock = leadDossier
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 DOSSIÊ DO CLIENTE (MEMÓRIA PERSISTENTE — CONSULTE ANTES DE RESPONDER)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${leadDossier}\n\n⚠️ REGRA: ANTES de responder qualquer coisa, LEIA esse dossiê. Use as informações dele como VERDADE. Se cliente perguntar algo que já está no dossiê (ex: "qual a data do meu evento?", "quanto o Jean me passou de valor?"), responda COM O DADO DO DOSSIÊ. Nunca finja que não lembra — tudo que sabemos sobre o cliente está aí.\n`
    : "";

  const calendarBlock = calendarContext
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAGENDA DO JEAN (use para confirmar disponibilidade)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${calendarContext}\n\nSE o cliente mencionar uma data específica, verifique se está livre antes de animar. Se estiver ocupada, diga algo tipo "deixa eu ver aqui... essa data o Jean já tem compromisso. Você tem flexibilidade pra um fim de semana próximo?" Nunca confirme data como reservada — só o Jean reserva.\n`
    : "";

  const memoryBlock = contactProfile
    ? `
MEMÓRIA SOBRE ESTE CLIENTE (use com naturalidade, como quem lembra de coisa conversada):
- Nome preferido: ${contactProfile.preferredName || contactName || "ainda não sei"}
- Tom habitual: ${contactProfile.detectedTone || detectedTone}
- Eventos passados: ${contactProfile.pastEvents?.join("; ") || "nenhum registrado"}
- Interesses mencionados: ${contactProfile.interests?.join(", ") || "—"}
- Observações que aprendi: ${contactProfile.notesFromAi?.slice(-5).join("; ") || "—"}
- Últimos tópicos: ${contactProfile.lastTopics?.slice(-3).join("; ") || "—"}
`
    : "";

  const toneInstruction =
    detectedTone === "formal"
      ? "Cliente usou linguagem formal. Responda com elegância, evite gírias e emojis demais."
      : detectedTone === "casual"
      ? "Cliente é descontraído. Pode ser mais solto, use 1-2 emojis, linguagem natural."
      : "Cliente tom neutro. Seja acolhedor, profissional e caloroso sem ser formal demais.";

  const nowBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
  const timeContext = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCONTEXTO TEMPORAL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAgora é ${nowBR} (horário de Brasília).\nUse pra saber se é manhã/tarde/noite e se o cumprimento do cliente é recente ou não.\n`;

  const firstInteractionNote = isFirstInteraction
    ? `\n⚠️ PRIMEIRA mensagem deste cliente. Siga OBRIGATORIAMENTE este formato de apresentação em 3 mensagens quebradas com ||:

Msg 1: Cumprimente + diga seu nome + deixe claro que você é a ATENDENTE VIRTUAL do Jean (assistente, não o Jean)
Msg 2: Explique que vai dar INÍCIO ao atendimento dele colhendo algumas informações, e depois o Jean assume pessoalmente
Msg 3: Primeira pergunta aberta pra começar (tipo "me conta, que tipo de evento você tá planejando?")

Exemplo (adapte ao tom):
"Oi! Tudo bem? Eu sou a Marina, atendente virtual aqui do Jean Izidoro 💫||Vou dar início ao seu atendimento por aqui, colher alguns detalhes do seu evento, e em seguida o Jean pessoalmente entra em contato pra conversar com você ✨||Me conta, que tipo de evento você tá planejando?"

NUNCA se passe pelo Jean. Sempre deixe claro que você é ASSISTENTE VIRTUAL dele.`
    : "\nEste cliente JÁ conversou antes. NÃO se apresente de novo. Continue naturalmente.";

  // Extrai a ÚLTIMA msg do cliente pra destacar explicitamente
  const lastUserMsg = [...history].reverse().find((m) => m.role === "user")?.content || "";

  const systemPrompt = `Você é Marina, atendente virtual do Jean Izidoro (arquiteto/cenógrafo de eventos de alto padrão em São Paulo — casamentos, corporativo, cenografia, debutantes).

SUA MISSÃO: responder o cliente com naturalidade, qualificar o lead coletando info do evento, e sugerir reunião com Jean quando fizer sentido. Você NÃO é o Jean — é a atendente dele.

═══ REGRA DE OURO ═══
RESPONDA SEMPRE A ÚLTIMA PERGUNTA/FALA DO CLIENTE. Nunca ignore o que ele perguntou pra mudar de assunto. Se não souber a resposta, diga honestamente "isso o Jean responde melhor pessoalmente" — mas JAMAIS desvie a conversa sem responder.

═══ COMO RESPONDER ═══
• Quebre em 1-3 mensagens curtas, separadas por "||" (pipe duplo)
• Máximo 2 linhas por mensagem
• Tom: ${toneInstruction}
• Máximo 1 emoji por mensagem
• Varie aberturas — não comece sempre igual

═══ O QUE VOCÊ NUNCA FAZ ═══
• Nunca confirma data (só o Jean reserva)
• Nunca passa valor (o Jean apresenta proposta)
• Nunca inventa portfólio/projetos antigos
• Nunca se passa pelo Jean
• Nunca se despede se cliente não se despediu (ex: "oi" NÃO é despedida)
• Nunca promete serviço fora do escopo (casamentos, corporativo, cenografia, 15 anos)

═══ PERSONA ═══
${persona}

═══ NEGÓCIO ═══
${businessContext}

${dossierBlock}
${calendarBlock}
${timeContext}
${humanTakeoverContext}
${firstInteractionNote}

═══ FORMATO DA RESPOSTA ═══
Texto puro, em português. Separe mensagens por "||". Sem markdown. Sem explicações.

═══ FOCO AGORA ═══
A ÚLTIMA MENSAGEM DO CLIENTE É: "${lastUserMsg}"

Sua próxima resposta TEM QUE responder essa mensagem específica. Leia o DOSSIÊ acima pra ter os dados. Responda agora.`;

  const res = await retry(
    () =>
      withTimeout(
        anthropic.messages.create({
          model: SONNET,
          max_tokens: 500,
          temperature: 0.8,
          system: systemPrompt,
          messages: history,
        }),
        CLAUDE_TIMEOUT_MS,
        "claude:reply"
      ),
    { retries: 2, baseDelayMs: 1500, label: "claude:reply" }
  );

  const txt = res.content[0].type === "text" ? res.content[0].text : "";
  const parts = txt
    .split("||")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);

  return parts.length > 0 ? parts : [txt.trim()];
}

/**
 * Atualiza seções dinâmicas do dossiê baseado nas últimas trocas.
 * Rodado em background pelo Haiku (barato, rápido).
 * Mantém: recentInteractions + clientAlreadyAsked + sofiaAlreadyExplained + nextBestAction
 */
export async function updateRecentInteractions(
  lastTurns: { role: "user" | "assistant"; content: string }[],
  existing: ContactProfile | null
): Promise<Partial<ContactProfile>> {
  if (lastTurns.length === 0) return {};

  const dialog = lastTurns
    .slice(-10)
    .map((t) => `${t.role === "user" ? "Cliente" : "Marina"}: ${t.content}`)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: `Você resume e estrutura uma conversa entre cliente e atendente virtual (Marina).
Retorne JSON estrito:
{
  "recentInteractions": ["bullet 1 do que aconteceu", "bullet 2", ...] (máx 5, curto),
  "clientAlreadyAsked": ["perguntas que o cliente já fez"] (máx 5),
  "sofiaAlreadyExplained": ["coisas que Marina já explicou pro cliente"] (máx 5),
  "nextBestAction": "o que Marina deve fazer na próxima msg (1 frase)"
}

Seja conciso. Mantenha info estável entre chamadas (não invente). JSON apenas, sem markdown.`,
      messages: [
        {
          role: "user",
          content: `Contexto prévio: ${JSON.stringify({
            recentInteractions: existing?.recentInteractions || [],
            clientAlreadyAsked: existing?.clientAlreadyAsked || [],
            sofiaAlreadyExplained: existing?.sofiaAlreadyExplained || [],
          })}

Últimas trocas:
${dialog}

Atualize o resumo com o que é novo.`,
        },
      ],
    });
    const txt = res.content[0].type === "text" ? res.content[0].text : "{}";
    const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      recentInteractions: Array.isArray(parsed.recentInteractions)
        ? parsed.recentInteractions.slice(0, 5)
        : existing?.recentInteractions,
      clientAlreadyAsked: Array.isArray(parsed.clientAlreadyAsked)
        ? [...new Set([...(existing?.clientAlreadyAsked || []), ...parsed.clientAlreadyAsked])].slice(-10)
        : existing?.clientAlreadyAsked,
      sofiaAlreadyExplained: Array.isArray(parsed.sofiaAlreadyExplained)
        ? [...new Set([...(existing?.sofiaAlreadyExplained || []), ...parsed.sofiaAlreadyExplained])].slice(-10)
        : existing?.sofiaAlreadyExplained,
      nextBestAction: parsed.nextBestAction || existing?.nextBestAction,
    };
  } catch (e) {
    console.error("updateRecentInteractions error", e);
    return {};
  }
}

export async function extractProfileLearnings(
  history: { role: "user" | "assistant"; content: string }[],
  existing: ContactProfile | null
): Promise<ContactProfile | null> {
  const lastUser = history.filter((m) => m.role === "user").slice(-5).map((m) => m.content).join("\n");
  if (!lastUser.trim()) return null;

  try {
    const res = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 300,
      system: [
        {
          type: "text",
          text: `Você extrai aprendizados sobre um cliente a partir de mensagens dele.
Retorne JSON estrito:
{
  "preferredName": "nome/apelido se mencionado",
  "interests": ["coisas que o cliente demonstrou interesse"],
  "pastEvents": ["eventos passados que o cliente mencionou ter participado"],
  "notesFromAi": ["observações úteis (ex: 'mãe de noiva', 'prefere contato noturno', 'muito detalhista')"],
  "lastTopics": ["tópicos falados nesta conversa"]
}
Se não houver informação nova, retorne campo vazio. JSON apenas, sem markdown.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Perfil atual: ${JSON.stringify(existing || {})}

Mensagens recentes do cliente:
${lastUser}

Extraia novos aprendizados (apenas o que for novo e útil).`,
        },
      ],
    });
    const txt = res.content[0].type === "text" ? res.content[0].text : "{}";
    const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      ...(existing || {}),
      preferredName: parsed.preferredName || existing?.preferredName,
      interests: [...new Set([...(existing?.interests || []), ...(parsed.interests || [])])].slice(-10),
      pastEvents: [...new Set([...(existing?.pastEvents || []), ...(parsed.pastEvents || [])])].slice(-10),
      notesFromAi: [...(existing?.notesFromAi || []), ...(parsed.notesFromAi || [])].slice(-10),
      lastTopics: [...(parsed.lastTopics || [])].slice(-5),
    };
  } catch {
    return existing;
  }
}

export async function generateDailySummary(data: {
  totalMsgs: number;
  newLeads: number;
  hotLeads: number;
  leadsList: { name: string; eventType: string; date: string; temperature: string }[];
}) {
  const res = await anthropic.messages.create({
    model: HAIKU,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Gere um resumo executivo curto (máximo 5 linhas) do dia para Jean Izidoro:
- ${data.totalMsgs} mensagens recebidas
- ${data.newLeads} novos leads
- ${data.hotLeads} leads quentes
Lista de leads:
${data.leadsList.map((l) => `- ${l.name} (${l.temperature}): ${l.eventType} em ${l.date}`).join("\n")}

Use tom profissional, destaque oportunidades urgentes.`,
      },
    ],
  });
  const txt = res.content[0].type === "text" ? res.content[0].text : "";
  return txt.trim();
}
