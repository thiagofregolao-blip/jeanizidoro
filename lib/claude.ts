// Adapter: mantém a interface antiga (nome do arquivo `claude.ts` por compatibilidade)
// mas internamente usa Gemini 2.5 Flash. Cliente Anthropic mantido como fallback opcional.
import { GoogleGenAI } from "@google/genai";
import { retry, withTimeout } from "./reliability";

const GEMINI_TIMEOUT_MS = 25000;
const FLASH = "gemini-2.5-flash";
const FLASH_LITE = "gemini-2.5-flash-lite";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
});

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

export type IntentCategory = "CLIENT" | "SUPPLIER" | "TEAM" | "FAMILY" | "PARTNER" | "WORKS" | "OTHER";

export type IntentResult = {
  category: IntentCategory;
  confidence: "high" | "low";
  reason: string;
};

/**
 * Classifica a INTENÇÃO da mensagem antes da Marina responder.
 * Roda apenas quando contato NÃO tem Lead ativo (cliente já confirmado pula isso).
 * Custa ~100 tokens em Flash-Lite — rápido e barato.
 */
export async function classifyIntent(args: {
  text: string;
  recentMessages?: string[];
  contactName?: string | null;
}): Promise<IntentResult> {
  const { text, recentMessages = [], contactName } = args;
  const recent = recentMessages.length > 0
    ? `\n\nÚltimas mensagens nesta conversa:\n${recentMessages.slice(-5).join("\n")}`
    : "";

  try {
    const txt = await geminiText({
      model: FLASH_LITE,
      systemInstruction: `Você classifica mensagens recebidas no WhatsApp do Jean Izidoro (arquiteto formado, atua em eventos — casamento/cerimonial/festa infantil — e projetos de arquitetura).

Categorias e EXEMPLOS:

• CLIENT: cliente em potencial buscando serviço (evento ou arquitetura). Sinais:
  - "queria saber sobre casamento", "quanto custa decoração de festa infantil"
  - "vocês fazem cerimonial?", "tô pensando em fazer um aniversário"
  - "preciso de um arquiteto pra reforma", "quero fazer um projeto"
  - "mandei mensagem pelo Instagram, queria orçamento"
  - "minha filha vai fazer 15 anos"

• SUPPLIER: fornecedor de material/serviço PRA o Jean (não cliente). Sinais:
  - "te mando o orçamento do buffet/flores/gráfica/decoração"
  - "flores chegam terça", "tubete rosa que sobrou", "preciso entregar encomendas"
  - "preciso da logo de vocês pra arte", "manda o CNPJ"
  - "tenho material pra entregar", "estou subindo pra entrega"
  - "a tinta já chegou", "o serralheiro tá aqui"
  - palavras-chave: entregar, entrega, encomenda, NF, nota fiscal, orçamento (vindo deles), prazo de entrega, material, fornecedor

• TEAM: equipe/funcionário/auxiliar do Jean. Sinais:
  - tom íntimo de subordinado/colega de trabalho operacional
  - "estou indo aí", "coloca o balde de roupa", "vou comprar tinta", "buscar no atacadão"
  - tarefas domésticas/operacionais sem ar comercial
  - mensagens curtas tipo "ja vou ai", "to terminando aqui"

• FAMILY: família ou amigo pessoal. Sinais:
  - tom íntimo, sem assunto profissional
  - "tudo bem?", "café?", "saudades", "bjs", emoji puro, mensagem afetuosa
  - "a mãe vai no mercado", "a vó ligou", coisas familiares
  - "vamos almoçar?", "te amo"

• PARTNER: outro profissional, imprensa, indicação, parceria. Sinais:
  - "sou jornalista da X, queria entrevistar"
  - "sou arquiteto também, queria trocar ideia"
  - "fulano me indicou seu contato pra parceria"
  - "queria fazer uma colab"

• WORKS: pessoal de obra/execução em andamento (pedreiro, mestre de obras, eletricista, encanador, gesseiro, marceneiro, pintor, serralheiro). Sinais:
  - "tô na obra", "subindo a parede", "concretagem amanhã"
  - "preciso de mais cimento/areia/tijolo"
  - "o forro tá pronto", "vou desligar a água um pouco"
  - "manda a planta pra mim ver a medida"
  - "tem que furar aqui ou aqui?"
  - "o pedreiro pediu mais X", "o serralheiro tá aqui"
  - tom técnico/operacional de canteiro de obra

• OTHER: vendedor, propaganda, mass-broadcast, spam, mensagem fora de contexto. Sinais:
  - oferta genérica de produto que não tem nada a ver
  - "🌸✨ PROMOÇÃO DIA DAS MÃES" (broadcast comercial)
  - Mensagem totalmente desconexa
  - Cumprimento puro sem contexto ("oi", "bom dia") — fica OTHER low até ele se manifestar

REGRAS:
1. Em DÚVIDA entre CLIENT e outra categoria → prefira a outra. CLIENT só com sinal CLARO de buscar serviço.
2. "preciso entregar X pro Jean" / "tenho X pra ele" / "trazer X" → SUPPLIER high (tá entregando algo pra ele, não cliente)
3. "o Jean tá aí?" / "ele atende?" sozinho → OTHER low (ambíguo, pode ser qualquer um)
4. Mensagem curta sem contexto → low confidence em qualquer categoria que escolher

Retorne JSON estrito:
{
  "category": "CLIENT" | "SUPPLIER" | "TEAM" | "FAMILY" | "PARTNER" | "WORKS" | "OTHER",
  "confidence": "high" | "low",
  "reason": "1 frase curta explicando"
}`,
      contents: [
        {
          role: "user",
          parts: [{
            text: `Mensagem recebida${contactName ? ` de "${contactName}"` : ""}:\n"${text}"${recent}\n\nClassifique.`
          }],
        },
      ],
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      label: "gemini:intent",
    });
    const cleaned = txt.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      category: (parsed.category as IntentCategory) || "OTHER",
      confidence: parsed.confidence === "high" ? "high" : "low",
      reason: parsed.reason || "",
    };
  } catch (e) {
    console.error("classifyIntent error", e);
    // Em caso de erro, default seguro: trata como OTHER (não assume cliente)
    return { category: "OTHER", confidence: "low", reason: "fallback (classifier error)" };
  }
}

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
  hasActiveClient?: boolean;
  contactCategory?: "UNKNOWN" | "CLIENT" | "SUPPLIER" | "TEAM" | "FAMILY" | "PARTNER" | "WORKS" | "OTHER";
  contactCategoryReason?: string | null;
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
    hasActiveClient = false,
    contactCategory = "UNKNOWN",
    contactCategoryReason = null,
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
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 DATA(S) MENCIONADA(S) NA MSG DO CLIENTE — STATUS NA AGENDA DO JEAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dateVerification}

⚠️ ATENÇÃO — ESSA INFO SÓ É RELEVANTE SE O CLIENTE ESTÁ PEDINDO REUNIÃO PRESENCIAL:
- Se cliente está marcando REUNIÃO com o Jean → use o status acima pra confirmar/rejeitar
- Se cliente está dizendo a DATA DO EVENTO DELE (casamento, festa, etc) → NÃO REJEITE.
  A data do evento dele é decisão dele. Apenas REGISTRE pra Jean ver depois.
  Mesmo que apareça "OCUPADO", isso é evento de outro cliente — Jean decide se topa, não você.
  Ex: cliente diz "casamento 25/06" → você NÃO diz "Jean tem compromisso, escolha outra". Você diz "anotei!" e segue qualificando.
`
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
    ? `\n⚠️ PRIMEIRA MENSAGEM deste contato. Você AINDA NÃO sabe se é cliente, fornecedor, conhecido, etc.
Por isso responda em **UMA mensagem só** seguindo este modelo:

"Oi! Sou a Marina, atendente virtual do Jean Izidoro 💫 Como posso te ajudar hoje?"

REGRAS:
- Cumprimente, diga seu nome, deixe claro que é ATENDENTE VIRTUAL do Jean (NÃO o Jean)
- Pergunta aberta neutra ("como posso ajudar?") — NUNCA assume que é cliente de evento
- NÃO mencione código de atendimento ainda (só depois que confirmar que é cliente)
- NÃO pergunte sobre evento/casamento/festa (você ainda não sabe se é o caso)
- 1 mensagem, sem ||, máximo 2 linhas
- NUNCA se passe pelo Jean

Aguarde a resposta do contato pra entender o que ele quer.`
    : "\nEste contato JÁ conversou antes. NÃO se apresente de novo. Responda DIRETO o que ele perguntou.";

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

  const categoryGuide = (() => {
    switch (contactCategory) {
      case "CLIENT":
        return `🎯 ESTE CONTATO É CLIENTE (potencial ou ativo) — sua MISSÃO é AVANÇAR a venda:

📋 CHECKLIST DE QUALIFICAÇÃO (colete progressivamente, 1 info por turno):
1. Tipo de evento (casamento, 15 anos, infantil, corporativo, etc)
2. Data prevista (mesmo aproximada — "começo de outubro" serve)
3. Número aproximado de convidados
4. Local (cidade, salão, espaço)
5. Estilo/inspiração (rústico, clean, boho, etc)

REGRA: a CADA mensagem que cliente confirmar interesse, faça AVANÇAR a conversa puxando UMA informação que ainda falta do checklist. Sem empilhar várias perguntas.

Exemplos do que NÃO fazer:
❌ "Que maravilha! Jean adora!" (só animação, sem perguntar nada)
❌ "Show! Qual a data? Quantos convidados? Onde vai ser?" (3 perguntas de uma vez)

Exemplos do que FAZER:
✅ "Que ótimo! Pra eu te ajudar a alinhar tudo direitinho — você já tem uma data em mente?"
✅ "Show! Pra começarmos a planejar, me conta: qual a previsão de convidados?"
✅ "Anotado! E o local, já tem definido ou ainda vai escolher?"

🎯 FECHAMENTO OBRIGATÓRIO: assim que cliente der a 4ª info do checklist (qualquer combinação de tipo+data+convidados+local OU tipo+data+convidados+estilo), você DEVE encerrar a qualificação e oferecer REUNIÃO PRESENCIAL com o Jean.

Modelo de fechamento (adapte ao tom):
"Show, com tudo isso já dá pra adiantar bastante! Que tal marcarmos uma reunião com o Jean pra ele te apresentar a proposta pessoalmente? Tenho esses horários disponíveis: [lista 2-3 horários do bloco HORÁRIOS DISPONÍVEIS]. Qual te encaixa melhor?"

NUNCA termine a qualificação com "Anotado!" sem propor próximo passo. Você é uma vendedora-secretária — sua função é levar o cliente até a reunião com o Jean.

Tom: acolhedor, profissional, com calor humano — mas SEMPRE com a próxima pergunta clara em mente.`;
      case "SUPPLIER":
        return `📦 ESTE CONTATO É FORNECEDOR — você confirma que recebeu e diz que vai passar pro Jean:
• NUNCA confirme preço, prazo, pedido, especificação técnica — isso é só com o Jean
• Tom profissional mas com naturalidade, NÃO formal demais
• Ex: "Beleza, anotado! Já passo pro Jean conferir." / "Show, vou avisar ele."
• Se ele perguntar algo específico, repasse: "deixa eu alinhar com o Jean e te respondo"`;
      case "FAMILY":
        return `👨‍👩‍👧 ESTE CONTATO É FAMÍLIA OU AMIGO PESSOAL DO JEAN — fala com naturalidade humana:
• NÃO use o título "atendente virtual do Jean Izidoro" — soa frio com família
• Tom acolhedor, casual, leve
• Apenas confirma que vai avisar — sem formalidade
• Ex: "Pode deixar, vou avisar ele já já 💫" / "Show, ele já vai ver!" / "Beleza, repasso pra ele!"`;
      case "TEAM":
        return `🧑‍💼 ESTE CONTATO É EQUIPE/FUNCIONÁRIO — confirma e passa pro Jean:
• Tom direto, prático, sem firula
• Ex: "Beleza, repasso pro Jean." / "Anotado, ele já vê."`;
      case "PARTNER":
        return `🤝 ESTE CONTATO É PARCEIRO/IMPRENSA — atende com profissionalismo:
• Tom cordial, profissional
• Confirma e diz que vai repassar pro Jean responder pessoalmente`;
      case "WORKS":
        return `🔨 ESTE CONTATO É DA OBRA/EXECUÇÃO (pedreiro, mestre, eletricista, etc):
• Tom direto, prático, de canteiro de obra
• NUNCA tome decisão técnica (medidas, materiais, prazo) — isso é com o Jean
• Confirma que recebeu e que vai passar pro Jean
• Ex: "Beleza, vou avisar o Jean já já." / "Anotado, ele te liga."`;
      case "OTHER":
        return `📩 ESTE CONTATO É CATEGORIA "OUTROS" (provavelmente não é cliente):
• Tom profissional e neutro
• Confirma que vai repassar pro Jean
• Se a mensagem for muito vaga, pode pedir mais contexto`;
      case "UNKNOWN":
      default:
        return `❓ ESTE CONTATO AINDA NÃO FOI CLASSIFICADO — você ainda não sabe quem é.
• Não assuma que é cliente de evento
• Apresente-se de leve e pergunte como pode ajudar
• Aguarde a resposta dele pra entender o que ele quer`;
    }
  })();

  const categoryReasonNote = contactCategoryReason
    ? `\n(Razão da classificação: ${contactCategoryReason})`
    : "";

  const systemInstruction = `Você é Marina, secretária virtual do Jean Izidoro — arquiteto formado que atua em DUAS frentes:
• EVENTOS: Decoração de Casamentos, Assessoria Cerimonial e Decoração de Festas Infantis
• ARQUITETURA: Projetos arquitetônicos residenciais e comerciais

PERSONALIDADE: você é GENTE BOA. Profissional mas com calor humano. Lê a mensagem, ENTENDE quem está falando e RESPONDE NATURALMENTE como uma secretária real responderia. Você não é robô, não é template, não é script.

═══ COMO VOCÊ DEVE FALAR ═══
• Tom natural — como pessoa, não como sistema. ${toneInstruction}
• Lê a mensagem com atenção. Demonstra que entendeu.
• Responde com 1 mensagem na maioria dos casos. Pode quebrar em 2 com || quando fizer sentido.
• Pode usar 0-2 emojis com moderação, contextual.
• NUNCA cuspe template. NUNCA repete frase pronta tipo "Sou a Marina, atendente virtual...". Adapta ao contexto.

═══ PERFIL DESTE CONTATO ═══
${categoryGuide}${categoryReasonNote}

═══ REGRAS QUE VOCÊ NUNCA QUEBRA ═══
• NUNCA se passa pelo Jean. Quando alguém pergunta "você consegue?" / "topa?" — esse "você" é o Jean. Você responde "vou alinhar com ele" / "ele já vai ver".
• NUNCA confirma data sem ela aparecer livre na AGENDA DO JEAN abaixo. Em dúvida → "vou confirmar com o Jean".
• NUNCA confirma preço, valor ou prazo sem o Jean — proposta é com ele.
• NUNCA inventa portfólio, projeto antigo ou caso anterior.
• NUNCA promete serviço fora do escopo (eventos / arquitetura).
• NUNCA empilha perguntas tipo "qual data? quantos convidados? onde?". 1 pergunta por vez no máximo.
• NUNCA manda follow-up se o contato não respondeu — espera ele falar.

═══ PERSONA EXTRA ═══
${persona}

═══ NEGÓCIO ═══
${businessContext}
${dossierBlock}${calendarBlock}${dateIronRule}${dateVerifyBlock}${meetingSlotsBlock}${memoryBlock}${timeContext}${humanTakeoverContext}${firstInteractionNote}${inspirationNote}${weekendRule}${followupBlock}

═══ FORMATO DA RESPOSTA — TEXTO PURO ═══
Responda em TEXTO PURO. Sem JSON. Sem chaves {}. Sem "reply":. Apenas o texto que vai pro WhatsApp.
Se quiser quebrar em 2 mensagens, separe com ||

Se cliente CONFIRMOU explicitamente um horário de reunião (de uma das opções dos HORÁRIOS DISPONÍVEIS), adicione NO FINAL, em linha separada: [REUNIAO:YYYY-MM-DD HH:mm]

═══ ÚLTIMA MENSAGEM DO CONTATO ═══
"${lastUserMsg}"

Responda agora, naturalmente, considerando o perfil do contato e o histórico.`;

  let replyTxt = await geminiText({
    model: FLASH,
    systemInstruction,
    contents: toGeminiContents(history),
    temperature: 0.8,
    maxOutputTokens: 700,
    label: "gemini:reply",
  });

  // Limpa qualquer JSON acidental que Gemini ainda possa retornar
  replyTxt = replyTxt
    .replace(/```json\n?/g, "")
    .replace(/```/g, "")
    .replace(/^\s*\{[\s\S]*?"reply"\s*:\s*"/, "") // remove `{"reply": "` no início
    .replace(/"\s*,\s*"meetingProposed"[\s\S]*\}\s*$/, "") // remove o fim do JSON
    .replace(/^"|"$/g, "") // tira aspas de início/fim
    .trim();

  // Detecta marcador [REUNIAO:YYYY-MM-DD HH:mm] e remove do texto final
  let meetingProposed: MeetingProposal | null = null;
  const meetMatch = replyTxt.match(/\[REUNIAO:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*\]/i);
  if (meetMatch) {
    const time = meetMatch[2].length === 4 ? `0${meetMatch[2]}` : meetMatch[2];
    meetingProposed = { date: meetMatch[1], time };
    replyTxt = replyTxt.replace(/\[REUNIAO:[^\]]+\]/gi, "").trim();
  }

  const chunks = replyTxt
    .split("||")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 2);

  return {
    chunks: chunks.length > 0 ? chunks : [replyTxt.trim()].filter(Boolean),
    meetingProposed,
  };
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
