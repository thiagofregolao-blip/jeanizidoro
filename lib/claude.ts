// Adapter: mantém a interface antiga (nome do arquivo `claude.ts` por compatibilidade)
// mas internamente usa Gemini 2.5 Flash. Cliente Anthropic mantido como fallback opcional.
import { GoogleGenAI } from "@google/genai";
import { retry, withTimeout } from "./reliability";

const GEMINI_TIMEOUT_MS = 25000;
const FLASH = "gemini-2.5-flash";
const FLASH_LITE = "gemini-2.5-flash-lite";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY || "" });

// converte histórico { user|assistant } pra formato Gemini { user|model }
function toGeminiContents(history: { role: "user" | "assistant"; content: string }[]) {
  return history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));
}

async function geminiText(opts: {
  model: string;
  systemInstruction: string;
  contents: { role: string; parts: { text: string }[] }[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: object;
  label: string;
}): Promise<string> {
  const res = await retry(
    () =>
      withTimeout(
        ai.models.generateContent({
          model: opts.model,
          contents: opts.contents,
          config: {
            systemInstruction: opts.systemInstruction,
            temperature: opts.temperature,
            maxOutputTokens: opts.maxOutputTokens,
            ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
            ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
          },
        }),
        GEMINI_TIMEOUT_MS,
        opts.label
      ),
    { retries: 2, baseDelayMs: 1500, label: opts.label }
  );
  return res.text || "";
}

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
  recentInteractions?: string[];
  clientAlreadyAsked?: string[];
  sofiaAlreadyExplained?: string[];
  nextBestAction?: string;
};

export type MeetingProposal = {
  date: string;   // "YYYY-MM-DD"
  time: string;   // "HH:mm"
};

const CLASSIFY_SCHEMA = `
{
  "temperature": "HOT" | "WARM" | "COLD",
  "score": <inteiro de 0 a 100, NUNCA string>,
  "eventType": "casamento" | "aniversario_infantil" | "aniversario_adulto" | "evento_corporativo" | "15_anos" | "outro" | null,
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
- false em TODOS os outros casos.

IMPORTANTE: score e guestCount DEVEM ser números inteiros JSON, NÃO strings.`;

export async function classifyLead(history: { role: "user" | "assistant"; content: string }[]) {
  const lastUserMsgs = history
    .filter((m) => m.role === "user")
    .slice(-10)
    .map((m) => m.content)
    .join("\n");

  try {
    const txt = await geminiText({
      model: FLASH_LITE,
      systemInstruction: `Você é um classificador de leads para Jean Izidoro, arquiteto de eventos (decoração de casamentos, assessoria cerimonial de eventos, decoração de festas infantis).
Analise a conversa e extraia dados em JSON estrito seguindo o schema:
${CLASSIFY_SCHEMA}

Critérios de temperatura:
- HOT: tem data + número de convidados + demonstra urgência OU pediu orçamento explícito OU quer reunião
- WARM: tem pelo menos data OU local OU tipo de evento + interesse claro em continuar
- COLD: só perguntou preço genérico, sem dados concretos, ou apenas curiosidade

Retorne SOMENTE o JSON, sem markdown, sem comentários.`,
      contents: [{ role: "user", parts: [{ text: `Mensagens do contato:\n${lastUserMsgs}` }] }],
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      label: "gemini:classify",
    });
    const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
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
  meetingSlotsContext?: string;
  dateVerification?: string;
  humanTakeoverContext?: string;
  leadDossier?: string;
  attendCode?: string | null;
  hasInspiration?: boolean;
  mode?: "normal" | "followup";
};

export type GenerateReplyOutput = {
  chunks: string[];
  meetingProposed?: MeetingProposal | null;
};

export async function generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput> {
  const {
    persona,
    businessContext,
    history,
    contactName,
    contactProfile,
    detectedTone = "mixed",
    isFirstInteraction = false,
    calendarContext = "",
    meetingSlotsContext = "",
    dateVerification = "",
    humanTakeoverContext = "",
    leadDossier = "",
    attendCode = null,
    hasInspiration = false,
    mode = "normal",
  } = input;

  const dossierBlock = leadDossier
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 DOSSIÊ DO CLIENTE (MEMÓRIA PERSISTENTE — CONSULTE ANTES DE RESPONDER)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${leadDossier}\n\n⚠️ REGRA: ANTES de responder qualquer coisa, LEIA esse dossiê. Use as informações dele como VERDADE. Se cliente perguntar algo que já está no dossiê, responda COM O DADO DO DOSSIÊ.\n`
    : "";

  const calendarBlock = calendarContext
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAGENDA DO JEAN (use para confirmar disponibilidade)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${calendarContext}\n`
    : "";

  // 🚨 REGRA DE FERRO — DATAS (anti-alucinação)
  const dateIronRule = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 REGRA DE FERRO — DATAS (LEIA COM ATENÇÃO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUNCA confirme disponibilidade de uma data específica sem que o status dela apareça
explicitamente no bloco "AGENDA DO JEAN" ou em "VERIFICAÇÃO ESPECÍFICA".

Se cliente perguntar sobre data X:
• Está no bloco AGENDA como ❌ OCUPADO → diga claramente que JÁ TEM compromisso. Sugira outra.
• Está no bloco AGENDA como ⚠️/☀️/🌙 (parcial) → siga a instrução do bloco.
• NÃO está no bloco AGENDA → diga "vou confirmar com o Jean e te respondo".

NUNCA invente disponibilidade. NUNCA diga "tá disponível" sem confirmação no bloco.
Em qualquer dúvida → "vou confirmar com o Jean".`;

  const dateVerifyBlock = dateVerification
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔍 VERIFICAÇÃO ESPECÍFICA DE DATA (USE SEM RECONSIDERAR)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${dateVerification}\n`
    : "";

  const meetingSlotsBlock = meetingSlotsContext
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📅 HORÁRIOS DE REUNIÃO PRESENCIAL DISPONÍVEIS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${meetingSlotsContext}\n\nQuando cliente pedir reunião, ofereça 2-3 horários desta lista. Reunião dura ~30 min.\nSE cliente confirmar um horário específico ("pode terça 14h", "ok 15h"), você DEVE preencher o campo "meetingProposed" do JSON com a data e hora confirmadas.\n`
    : "";

  const memoryBlock = contactProfile
    ? `
MEMÓRIA SOBRE ESTE CLIENTE (use com naturalidade):
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
  const timeContext = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCONTEXTO TEMPORAL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAgora é ${nowBR} (horário de Brasília).\n`;

  const firstInteractionNote = isFirstInteraction
    ? `\n⚠️ PRIMEIRA mensagem deste cliente. Siga este formato em 3 mensagens separadas por ||:

Msg 1: Cumprimente + diga seu nome + deixe claro que você é a ATENDENTE VIRTUAL do Jean (assistente, não o Jean) + cite o CÓDIGO DE ATENDIMENTO ${attendCode ? `(${attendCode})` : "(será gerado)"} pra ele guardar
Msg 2: Explique que vai dar INÍCIO ao atendimento dele colhendo algumas informações, e depois o Jean assume pessoalmente
Msg 3: Primeira pergunta aberta pra começar

NUNCA se passe pelo Jean. Sempre deixe claro que você é ASSISTENTE VIRTUAL dele.`
    : "\nEste cliente JÁ conversou antes. NÃO se apresente de novo. Continue naturalmente.";

  const inspirationNote = hasInspiration
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ CLIENTE ENVIOU INSPIRAÇÃO (imagem ou link)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OBRIGATÓRIO incluir na sua resposta:
1. Agradeça a referência
2. Deixe claro que vai usar como INSPIRAÇÃO pra criar algo único, JAMAIS como cópia
3. Faça UMA pergunta de aprofundamento (cor? clima? estilo?)

NUNCA prometa replicar o que o cliente mandou. Use "inspiração", não "fazer igual".`
    : "";

  const weekendRule = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 REGRA DE FIM DE SEMANA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SE hoje for SEXTA, SÁBADO ou DOMINGO E o cliente pedir EXPLICITAMENTE para falar com o Jean:
adicione observação tipo "sex/sáb/dom o Jean costuma estar conduzindo eventos, então o retorno pode levar um pouco mais — mas vou avisar ele agora!"
Em qualquer outro caso, siga normal sem mencionar.`;

  const followupBlock =
    mode === "followup"
      ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔁 MODO FOLLOW-UP — REENGAJAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Releia o DOSSIÊ pra entender em qual etapa parou. Envie 1-2 mensagens curtas, gentis, com especificidade do que estavam falando. Termine com pergunta aberta.`
      : "";

  const lastUserMsg = [...history].reverse().find((m) => m.role === "user")?.content || "";

  const systemInstruction = `Você é Marina, atendente virtual do Jean Izidoro (arquiteto de eventos especialista em Decoração de Casamentos, Assessoria Cerimonial de Eventos e Decoração de Festas Infantis).

SUA MISSÃO: responder o cliente com naturalidade, qualificar o lead coletando info do evento, e sugerir reunião com Jean quando fizer sentido. Você NÃO é o Jean — é a atendente dele.

═══ REGRA DE OURO ═══
RESPONDA SEMPRE A ÚLTIMA PERGUNTA/FALA DO CLIENTE. Nunca ignore o que ele perguntou pra mudar de assunto. Se não souber a resposta, diga honestamente "isso o Jean responde melhor pessoalmente".

═══ COMO RESPONDER ═══
• Quebre em 1-3 mensagens curtas, separadas por "||" no campo "reply"
• Máximo 2 linhas por mensagem
• Tom: ${toneInstruction}
• Máximo 1 emoji por mensagem
• Varie aberturas — não comece sempre igual

═══ O QUE VOCÊ NUNCA FAZ ═══
• Nunca confirma data sem checar AGENDA (ver REGRA DE FERRO abaixo)
• Nunca passa valor (o Jean apresenta proposta)
• Nunca inventa portfólio/projetos antigos
• Nunca se passa pelo Jean
• Nunca se despede se cliente não se despediu
• Nunca promete serviço fora do escopo

═══ PERSONA ═══
${persona}

═══ NEGÓCIO ═══
${businessContext}
${dossierBlock}${calendarBlock}${dateIronRule}${dateVerifyBlock}${meetingSlotsBlock}${memoryBlock}${timeContext}${humanTakeoverContext}${firstInteractionNote}${inspirationNote}${weekendRule}${followupBlock}

═══ FORMATO DA RESPOSTA (JSON OBRIGATÓRIO) ═══
Retorne JSON estrito:
{
  "reply": "msg1||msg2||msg3",
  "meetingProposed": { "date": "YYYY-MM-DD", "time": "HH:mm" } OU null
}

"meetingProposed" só preenche se o cliente CONFIRMOU explicitamente um horário de reunião (de uma das opções dos HORÁRIOS DISPONÍVEIS). Em qualquer outra resposta, deixe null.

═══ FOCO AGORA ═══
A ÚLTIMA MENSAGEM DO CLIENTE É: "${lastUserMsg}"`;

  try {
    const txt = await geminiText({
      model: FLASH,
      systemInstruction,
      contents: toGeminiContents(history),
      temperature: 0.8,
      maxOutputTokens: 700,
      responseMimeType: "application/json",
      label: "gemini:reply",
    });
    const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { reply?: string; meetingProposed?: MeetingProposal | null };
    const replyTxt = parsed.reply || "";
    const chunks = replyTxt
      .split("||")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3);
    const meetingProposed =
      parsed.meetingProposed && parsed.meetingProposed.date && parsed.meetingProposed.time
        ? parsed.meetingProposed
        : null;
    return {
      chunks: chunks.length > 0 ? chunks : [replyTxt.trim()].filter(Boolean),
      meetingProposed,
    };
  } catch (e) {
    console.error("[gemini:reply] parse error", e);
    throw e;
  }
}

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
    const txt = await geminiText({
      model: FLASH_LITE,
      systemInstruction: `Você resume conversa entre cliente e Marina. Retorne JSON estrito:
{
  "recentInteractions": ["bullet 1", "bullet 2", ...] (máx 5),
  "clientAlreadyAsked": ["perguntas que cliente fez"] (máx 5),
  "sofiaAlreadyExplained": ["coisas que Marina já explicou"] (máx 5),
  "nextBestAction": "1 frase do que Marina deve fazer próximo"
}
Conciso, mantenha info estável. JSON apenas.`,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Contexto prévio: ${JSON.stringify({
                recentInteractions: existing?.recentInteractions || [],
                clientAlreadyAsked: existing?.clientAlreadyAsked || [],
                sofiaAlreadyExplained: existing?.sofiaAlreadyExplained || [],
              })}\n\nÚltimas trocas:\n${dialog}\n\nAtualize o resumo com o que é novo.`,
            },
          ],
        },
      ],
      maxOutputTokens: 500,
      responseMimeType: "application/json",
      label: "gemini:interactions",
    });
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
    const txt = await geminiText({
      model: FLASH_LITE,
      systemInstruction: `Você extrai aprendizados sobre um cliente. Retorne JSON estrito:
{
  "preferredName": "nome/apelido se mencionado",
  "interests": ["interesses"],
  "pastEvents": ["eventos passados que cliente mencionou"],
  "notesFromAi": ["observações úteis"],
  "lastTopics": ["tópicos desta conversa"]
}
Se não houver info nova, retorne campo vazio. JSON apenas.`,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Perfil atual: ${JSON.stringify(existing || {})}\n\nMensagens recentes:\n${lastUser}\n\nExtraia novos aprendizados.`,
            },
          ],
        },
      ],
      maxOutputTokens: 300,
      responseMimeType: "application/json",
      label: "gemini:learnings",
    });
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
  try {
    const txt = await geminiText({
      model: FLASH_LITE,
      systemInstruction: "Você gera resumos executivos curtos pra Jean Izidoro.",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Gere resumo executivo curto (máx 5 linhas):
- ${data.totalMsgs} mensagens recebidas
- ${data.newLeads} novos leads
- ${data.hotLeads} leads quentes
Lista de leads:
${data.leadsList.map((l) => `- ${l.name} (${l.temperature}): ${l.eventType} em ${l.date}`).join("\n")}

Tom profissional, destaque oportunidades urgentes.`,
            },
          ],
        },
      ],
      maxOutputTokens: 500,
      label: "gemini:summary",
    });
    return txt.trim();
  } catch {
    return "";
  }
}
