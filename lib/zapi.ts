import { retry, withTimeout } from "./reliability";

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

async function zapiFetch(path: string, body: object, timeoutMs = 15000) {
  return retry(
    () =>
      withTimeout(
        (async () => {
          const res = await fetch(url(path), {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`Z-API ${path} ${res.status}: ${t.slice(0, 300)}`);
          }
          return res.json();
        })(),
        timeoutMs,
        `zapi:${path}`
      ),
    { retries: 3, baseDelayMs: 1200, label: `zapi:${path}` }
  );
}

export async function sendText(phone: string, message: string) {
  return zapiFetch("/send-text", { phone, message });
}

export async function sendDocument(phone: string, docUrl: string, fileName: string, caption?: string) {
  return zapiFetch("/send-document/pdf", { phone, document: docUrl, fileName, caption });
}

export async function setTyping(phone: string, durationMs = 2000) {
  try {
    await withTimeout(
      fetch(url("/send-chat-state"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ phone, chatState: "composing" }),
      }),
      4000,
      "zapi:typing"
    );
    await new Promise((r) => setTimeout(r, durationMs));
  } catch {
    // typing is non-critical, silently fail
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
