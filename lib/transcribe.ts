import { retry, withTimeout, logError } from "./reliability";

const GROQ_API = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3";

/**
 * Baixa um áudio de URL pública e transcreve com Groq Whisper.
 * Retorna a transcrição em texto, ou null se falhar.
 */
export async function transcribeAudio(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[transcribe] GROQ_API_KEY não configurado — áudio não transcrito");
    return null;
  }

  try {
    // 1. Baixa o áudio
    const audioRes = await retry(
      () => withTimeout(fetch(audioUrl), 20000, "download_audio"),
      { retries: 2, baseDelayMs: 1000, label: "download_audio" }
    );
    if (!audioRes.ok) {
      await logError("transcribe", `download falhou ${audioRes.status}`, { audioUrl });
      return null;
    }
    const audioBlob = await audioRes.blob();

    // 2. Envia pro Groq Whisper
    const form = new FormData();
    form.append("file", audioBlob, "audio.ogg");
    form.append("model", MODEL);
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");

    const transcribeRes = await retry(
      () =>
        withTimeout(
          fetch(GROQ_API, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
          }),
          30000,
          "groq_transcribe"
        ),
      { retries: 2, baseDelayMs: 1500, label: "groq_transcribe" }
    );

    if (!transcribeRes.ok) {
      const errText = await transcribeRes.text().catch(() => "");
      await logError("transcribe", `Groq ${transcribeRes.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await transcribeRes.json()) as { text?: string };
    const text = data.text?.trim() || null;
    console.log(`[transcribe] áudio transcrito (${text?.length ?? 0} chars)`);
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logError("transcribe", msg);
    return null;
  }
}
