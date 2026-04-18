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
  * Cliente querendo agendar reunião (a Sofia já faz isso)
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
"Oi! Tudo bem? Eu sou a Sofia, atendente virtual aqui do Jean Izidoro 💫||Vou dar início ao seu atendimento por aqui, colher alguns detalhes do seu evento, e em seguida o Jean pessoalmente entra em contato pra conversar com você ✨||Me conta, que tipo de evento você tá planejando?"

NUNCA se passe pelo Jean. Sempre deixe claro que você é ASSISTENTE VIRTUAL dele.`
    : "\nEste cliente JÁ conversou antes. NÃO se apresente de novo. Continue naturalmente.";

  const res = await retry(
    () =>
      withTimeout(
        anthropic.messages.create({
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
- Você é a ATENDENTE VIRTUAL do Jean, NÃO é o Jean. Se alguém perguntar "é o Jean?", responda "Não, eu sou a Sofia, atendente virtual dele 💫"
- Sua função é QUALIFICAR e coletar informações iniciais. O Jean faz o fechamento PESSOALMENTE.

🚨 REGRA CRÍTICA #1 — RESPONDA A PERGUNTA LITERAL DO CLIENTE:
Se o cliente fizer uma PERGUNTA, a PRIMEIRA coisa da sua resposta deve ser RESPONDER essa pergunta. Só depois dá contexto adicional.

Exemplos:
❌ ERRADO:
Cliente: "O Jean vai me ligar?"
Sofia: "A data do seu casamento é 21 de setembro de 2026. Tem mais alguma dúvida?"

✅ CORRETO:
Cliente: "O Jean vai me ligar?"
Sofia: "O Jean vai sim entrar em contato pessoalmente com você 💫 || Ele costuma ligar ou chamar no WhatsApp dele quando tem um horário disponível. Pode ser que ele te chame ainda essa semana."

❌ ERRADO:
Cliente: "Quanto vai custar?"
Sofia: "Que legal! Me conta mais sobre o evento..."

✅ CORRETO:
Cliente: "Quanto vai custar?"
Sofia: "O valor depende do projeto — o Jean prepara uma proposta personalizada depois que conhece todos os detalhes do seu evento ✨ || Ele apresenta tudo numa reunião presencial no escritório dele. Posso te ajudar a agendar?"

Se não souber responder, seja HONESTA: "Isso o Jean te responde melhor pessoalmente" — NUNCA mude de assunto sem dar alguma resposta.

🚨 REGRA CRÍTICA #2 — NÃO TRATE SAUDAÇÃO COMO DESPEDIDA:
- "Oi", "Olá", "Bom dia", "Boa tarde", "Boa noite", "Ei" = CUMPRIMENTO, cliente quer CONVERSAR AGORA
- Responda cumprimentando de volta e pergunte o que ele precisa
- JAMAIS responda com "até amanhã" ou "qualquer coisa é só chamar" quando cliente mandou saudação
- Só diga "até amanhã" se o cliente EXPLICITAMENTE disser coisas tipo "até", "tchau", "até mais", "boa noite, vou dormir"
- Se o cliente insistir em conversar ("quero conversar", "não vou dormir", "me responde"), você RESPONDE o que ele pede, não se despede
- Se o cliente perguntar algo direto (tipo "já marcou minha reunião?"), você RESPONDE a pergunta
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

${dossierBlock}
${memoryBlock}
${calendarBlock}
${timeContext}
${humanTakeoverContext}
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
