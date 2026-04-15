import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

const CLASSIFY_SCHEMA = `
{
  "temperature": "HOT | WARM | COLD",
  "score": "0-100",
  "eventType": "casamento | aniversario | corporativo | outro | null",
  "eventDate": "YYYY-MM-DD ou null",
  "guestCount": "número ou null",
  "location": "string ou null",
  "budget": "string ou null",
  "style": "string ou null",
  "contactName": "nome do cliente ou null",
  "summary": "1-2 frases resumindo o lead",
  "shouldEscalate": "true se cliente pediu falar com humano, reclamou, ou IA não pode ajudar"
}
`;

export async function classifyLead(history: { role: "user" | "assistant"; content: string }[]) {
  const lastUserMsgs = history
    .filter((m) => m.role === "user")
    .slice(-10)
    .map((m) => m.content)
    .join("\n");

  const res = await anthropic.messages.create({
    model: HAIKU,
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: `Você é um classificador de leads para Jean Izidoro, arquiteto de eventos (casamentos, corporativo, cenografia).
Analise a conversa e extraia dados em JSON estrito seguindo o schema:
${CLASSIFY_SCHEMA}

Critérios de temperatura:
- HOT: tem data, número de convidados, demonstra urgência ou pediu orçamento
- WARM: tem pelo menos data OU local OU tipo de evento + interesse claro
- COLD: só perguntou preço genérico, sem dados concretos

Retorne SOMENTE o JSON, sem markdown, sem comentários.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `Mensagens do contato:\n${lastUserMsgs}` }],
  });

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

export async function generateReply(
  persona: string,
  businessContext: string,
  history: { role: "user" | "assistant"; content: string }[]
) {
  const res = await anthropic.messages.create({
    model: SONNET,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: `Você é a assistente virtual de Jean Izidoro, arquiteto e cenógrafo de eventos de alto padrão.

PERSONA:
${persona}

CONTEXTO DO NEGÓCIO:
${businessContext}

REGRAS INVIOLÁVEIS:
- Nunca confirme datas sem antes perguntar (a agenda é checada pelo Jean)
- Nunca passe valores ou feche preços — diga que o Jean vai apresentar uma proposta personalizada
- Nunca prometa serviços fora do escopo (casamento, corporativo, cenografia)
- Tom: elegante, acolhedor, conciso. Mensagens curtas (máximo 3 linhas)
- Se for pedido fora do escopo, peça desculpas educadamente
- Sempre tente extrair: tipo de evento, data desejada, número de convidados, local
- Não use emojis em excesso (no máximo 1 por mensagem)
- Se o cliente já demonstrou interesse claro, sugira agendar reunião com Jean no escritório
- NUNCA invente informações sobre projetos passados`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: history,
  });

  const txt = res.content[0].type === "text" ? res.content[0].text : "";
  return txt.trim();
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
