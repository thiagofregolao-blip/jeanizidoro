const BASE = process.env.ZAPI_BASE_URL || "https://api.z-api.io";
const INSTANCE = process.env.ZAPI_INSTANCE_ID!;
const TOKEN = process.env.ZAPI_TOKEN!;
const CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || "";

function url(path: string) {
  return `${BASE}/instances/${INSTANCE}/token/${TOKEN}${path}`;
}
function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CLIENT_TOKEN) h["Client-Token"] = CLIENT_TOKEN;
  return h;
}

export async function sendText(phone: string, message: string) {
  const res = await fetch(url("/send-text"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Z-API send-text falhou: ${res.status} ${t}`);
  }
  return res.json();
}

export async function sendDocument(phone: string, docUrl: string, fileName: string, caption?: string) {
  const res = await fetch(url("/send-document/pdf"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ phone, document: docUrl, fileName, caption }),
  });
  if (!res.ok) throw new Error(`Z-API send-document falhou: ${res.status}`);
  return res.json();
}

export async function setTyping(phone: string, durationMs = 2000) {
  try {
    await fetch(url("/send-chat-state"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ phone, chatState: "composing" }),
    });
    await new Promise((r) => setTimeout(r, durationMs));
  } catch {
    // ignore
  }
}

export type ZapiInbound = {
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  senderName?: string;
  type?: string;
  text?: { message?: string };
  image?: { caption?: string; imageUrl?: string };
  audio?: { audioUrl?: string };
  document?: { documentUrl?: string; fileName?: string };
  momment?: number;
};

export function extractTextFromZapi(p: ZapiInbound): string | null {
  if (p.text?.message) return p.text.message;
  if (p.image?.caption) return `[imagem] ${p.image.caption}`;
  if (p.image?.imageUrl) return "[imagem]";
  if (p.audio?.audioUrl) return "[áudio]";
  if (p.document?.fileName) return `[documento] ${p.document.fileName}`;
  return null;
}
