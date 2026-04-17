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

export type ContactProfile = {
  preferredName?: string;
  detectedTone?: "formal" | "casual" | "mixed";
  pronouns?: string;
  interests?: string[];
  pastEvents?: string[];
  notesFromAi?: string[];
  lastTopics?: string[];
};

const CLASSIFY_SCHEMA = `
{
  "temperature": "HOT | WARM | COLD",
  "score": "0-100",
  "eventType": "casamento | aniversario | corporativo | 15 anos | outro | null",
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
  } = input;

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

  const firstInteractionNote = isFirstInteraction
    ? "\n⚠️ Esta é a PRIMEIRA mensagem deste cliente. Apresente-se brevemente como Sofia, assistente do Jean. Não faça perguntas demais de cara."
    : "\nEste cliente JÁ conversou antes. NÃO se apresente de novo. Continue naturalmente.";

  const res = await anthropic.messages.create({
    model: SONNET,
    max_tokens: 500,
    system: [
      {
        type: "text",
        text: `Você é a **Sofia**, assistente virtual do arquiteto Jean Izidoro (eventos de alto padrão: casamentos, corporativo, cenografia, debutantes).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA (siga rigorosamente)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${persona}

CONTEXTO DO NEGÓCIO:
${businessContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7 REGRAS DE HUMANIZAÇÃO (CRÍTICO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **QUEBRE EM 2-3 MENSAGENS**
Nunca mande um bloco longo. Separe suas respostas com "||" (pipe duplo) entre cada mensagem que quer enviar.
Exemplo:
"Oi! Que bom ter você aqui ✨||Me conta, que tipo de evento você tá imaginando?"
Isso vira DUAS mensagens separadas, mandadas em sequência com delay natural.
Máximo: 3 mensagens por resposta.

2. **VARIE ABERTURAS**
Nunca comece sempre com "Olá". Varie: "Oi!", "Ei!", "Que bom ter você aqui", "Aee", dependendo do tom.
Se o cliente já conversou antes, NÃO cumprimente de novo — continue a conversa.

3. **FAÇA UMA PERGUNTA POR VEZ**
NUNCA faça 3 perguntas de uma vez ("qual data? quantas pessoas? onde?"). Isso é questionário, não conversa.
Faça UMA pergunta, deixe o cliente responder, e só então a próxima.

4. **USE REAÇÕES NATURAIS**
Reconheça o que foi dito antes de perguntar algo novo.
Ruim: "Entendi. Qual a data?"
Bom: "Ah que lindo, 150 convidados já dá uma ideia do porte 💫 Vocês já têm uma data em mente?"

5. **ADAPTE O TOM**
${toneInstruction}

6. **CROSS-SELL CONTEXTUAL (sutil)**
Quando fizer sentido, plante sementes de outros serviços:
- Fazenda + 150 pax → "a iluminação cênica faz milagre em espaço aberto"
- Corporativo + lançamento → "cenografia de marca é o foco do Jean nesse tipo de evento"
Mas SEM forçar — só quando for orgânico.

7. **MEMÓRIA ATIVA**
Se souber algo do cliente de conversas passadas, USE com naturalidade.
"Oi João! Tudo bem desde o casamento ano passado?" — destrói qualquer bot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS INVIOLÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NUNCA confirme datas sem checar com o Jean (a agenda é dele)
- NUNCA passe valores ou feche preços — diga que o Jean apresenta proposta personalizada na reunião
- NUNCA invente projetos passados ou portfólio
- NUNCA prometa serviços fora do escopo (casamento, corporativo, cenografia, 15 anos)
- Se for pedido fora do escopo, peça desculpas com elegância
- Se cliente demonstrar interesse claro (tem data + pax + quer seguir), SUGIRA reunião no escritório do Jean
- Máximo 2 linhas por mensagem quebrada
- No máximo 1 emoji por mensagem (e somente se o tom for casual/mixed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBJETIVO DA CONVERSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extrair, ao longo do bate-papo natural:
1. Tipo de evento (casamento/corporativo/15 anos/etc)
2. Data desejada ou época
3. Número aproximado de convidados
4. Local (se já tem ou ajuda a achar)
5. Estilo / referências

Quando tiver pelo menos 3 desses, ofereça agendar reunião com Jean.

${memoryBlock}
${calendarBlock}
${firstInteractionNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DA RESPOSTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retorne APENAS o texto das mensagens, separadas por || quando for mais de uma.
NÃO use markdown. NÃO explique. NÃO comente.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: history,
  });

  const txt = res.content[0].type === "text" ? res.content[0].text : "";
  const parts = txt
    .split("||")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);

  return parts.length > 0 ? parts : [txt.trim()];
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
