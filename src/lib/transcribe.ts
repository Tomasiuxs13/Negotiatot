import "server-only";

/**
 * Speech-to-text for posted videos, via fal's hosted Whisper.
 *
 * Claude cannot take audio, so the transcript has to come from somewhere else, and the
 * division of labour is deliberate: Whisper only writes down what was said and when.
 * Every judgement — where the sponsor segment starts, whether a requirement was met —
 * is made later by the model that can actually reason about a brief.
 *
 * Verified against the live API rather than assumed: it accepts an `.mp4` container
 * directly (no ffmpeg, no audio extraction step), `chunk_level: "word"` returns
 * `[start, end]` second pairs per word, and `prompt` primes the decoder toward names it
 * would otherwise mangle. That last one matters more than it sounds — the whole check
 * turns on whether "Ryoko" was said, and untuned Whisper writes it "Rioko".
 */

const FAL_ENDPOINT = "https://fal.run/fal-ai/whisper";

export interface TranscriptChunk {
  /** [start, end] in seconds. Reliable even where the words themselves are garbled. */
  timestamp: [number, number];
  text: string;
}

export interface Transcript {
  text: string;
  chunks: TranscriptChunk[];
  /** Total spoken span, used to sanity-check an integration length against the video. */
  durationSeconds: number | null;
}

export function hasFalKey(): boolean {
  return Boolean(process.env.FAL_KEY?.trim());
}

/**
 * A one-shot signed target the browser can PUT a video straight to.
 *
 * The file never touches this server. A 20-minute 1080p upload is comfortably past what
 * a server action will carry, and proxying it would mean holding hundreds of megabytes
 * in a Next.js request just to forward them on. fal signs the destination for us, so the
 * key stays server-side and the bytes go creator → fal directly.
 */
export async function signUpload(params: {
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; fileUrl: string }> {
  if (!hasFalKey()) {
    throw new Error("No FAL_KEY configured. Add it to .env.local and restart the server.");
  }

  const res = await fetch(
    "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
    {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content_type: params.contentType, file_name: params.fileName }),
    }
  );

  if (!res.ok) {
    throw new Error(`Could not start the upload (${res.status}).`);
  }
  const json = (await res.json()) as { upload_url?: string; file_url?: string };
  if (!json.upload_url || !json.file_url) throw new Error("Upload could not be started.");
  return { uploadUrl: json.upload_url, fileUrl: json.file_url };
}

export async function transcribe(params: {
  /** Publicly reachable media URL — fal fetches it server-side. */
  audioUrl: string;
  /** Brand and product names, to bias the decoder toward spelling them correctly. */
  prompt?: string;
  language?: string;
}): Promise<Transcript> {
  if (!hasFalKey()) {
    throw new Error("No FAL_KEY configured. Add it to .env.local and restart the server.");
  }

  const res = await fetch(FAL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: params.audioUrl,
      task: "transcribe",
      // Word level rather than segment: measuring where a read starts and stops needs
      // finer resolution than a segment boundary happens to fall on.
      chunk_level: "word",
      ...(params.prompt ? { prompt: params.prompt } : {}),
      ...(params.language ? { language: params.language } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Transcription failed (${res.status}). ${detail.slice(0, 300)}`.trim()
    );
  }

  const json = (await res.json()) as {
    text?: string;
    chunks?: { timestamp: [number, number] | null; text: string }[];
  };

  const chunks: TranscriptChunk[] = (json.chunks ?? [])
    .filter((c): c is { timestamp: [number, number]; text: string } => Array.isArray(c.timestamp))
    .map((c) => ({ timestamp: c.timestamp, text: c.text }));

  if (!json.text?.trim() && chunks.length === 0) {
    throw new Error("No speech was found in that file.");
  }

  return {
    text: json.text ?? "",
    chunks,
    durationSeconds: chunks.length > 0 ? chunks[chunks.length - 1].timestamp[1] : null,
  };
}

/**
 * Word-level chunks folded into ~15-second lines with a leading timestamp.
 *
 * The raw output is one entry per word, which is the right resolution for measuring a
 * segment and the wrong one for reading: several thousand JSON objects would crowd out
 * the brief in the prompt and cost far more than the judgement is worth. Folding keeps
 * the timestamps the check needs while making the transcript legible.
 */
export function foldForPrompt(chunks: TranscriptChunk[], windowSeconds = 15): string {
  if (chunks.length === 0) return "";
  const lines: string[] = [];
  let start = chunks[0].timestamp[0];
  let words: string[] = [];

  const flush = (end: number) => {
    if (words.length === 0) return;
    lines.push(`[${fmt(start)}–${fmt(end)}] ${words.join("").trim()}`);
    words = [];
  };

  for (const c of chunks) {
    if (c.timestamp[0] - start >= windowSeconds) {
      flush(c.timestamp[0]);
      start = c.timestamp[0];
    }
    words.push(c.text);
  }
  flush(chunks[chunks.length - 1].timestamp[1]);
  return lines.join("\n");
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
