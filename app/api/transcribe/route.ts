import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

function preprocessAudio(input: Buffer): Promise<Buffer | null> {
  return (async () => {
    const tmpIn = join(tmpdir(), `meetmind-${randomUUID()}`);

    try {
      await writeFile(tmpIn, input);
    } catch {
      return null;
    }

    try {
      return await new Promise<Buffer | null>((resolve) => {
        const ff = spawn("ffmpeg", [
          "-i",
          tmpIn,
          "-af",
          "dynaudnorm=f=150:g=15,apad=pad_dur=10",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "libopus",
          "-b:a",
          "32k",
          "-f",
          "ogg",
          "pipe:1",
        ]);

        const chunks: Buffer[] = [];
        let failed = false;

        ff.on("error", () => {
          failed = true;
          resolve(null);
        });
        ff.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        ff.stderr.on("data", () => {});
        ff.on("close", (code) => {
          if (failed) return;
          resolve(
            code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null,
          );
        });
      });
    } finally {
      unlink(tmpIn).catch(() => {});
    }
  })();
}

type DeepgramWord = {
  word: string;
  punctuated_word?: string;
  speaker?: number;
};

type DeepgramUtterance = {
  speaker?: number;
  transcript: string;
};

type DeepgramResponse = {
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: {
      alternatives?: {
        transcript?: string;
        words?: DeepgramWord[];
      }[];
    }[];
  };
};

function speakerLabel(speaker: number | undefined) {
  return `Pembicara ${(speaker ?? 0) + 1}`;
}

function formatDiarizedTranscript(data: DeepgramResponse): string {
  const utterances: DeepgramUtterance[] | undefined = data?.results?.utterances;

  if (utterances && utterances.length > 0) {
    return utterances
      .map((u) => `${speakerLabel(u.speaker)}: ${u.transcript.trim()}`)
      .join("\n");
  }

  const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
  const words: DeepgramWord[] = alternative?.words ?? [];

  if (words.length === 0) {
    return alternative?.transcript ?? "";
  }

  const segments: { speaker: number; tokens: string[] }[] = [];

  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const token = w.punctuated_word ?? w.word;
    const last = segments[segments.length - 1];

    if (last && last.speaker === speaker) {
      last.tokens.push(token);
    } else {
      segments.push({ speaker, tokens: [token] });
    }
  }

  return segments
    .map((s) => `${speakerLabel(s.speaker)}: ${s.tokens.join(" ")}`)
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json(
        { error: "Deepgram API key belum dikonfigurasi" },
        { status: 500 },
      );
    }

    const formData = await req.formData();

    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());

    const processed = await preprocessAudio(original);
    const audio = processed ?? original;
    const contentType = processed ? "audio/ogg" : file.type;
    console.log(
      processed
        ? "transcribe: audio preprocessed (opus + loudnorm)"
        : "transcribe: ffmpeg unavailable, sending original audio",
    );

    const params = new URLSearchParams({
      model: "nova-3",
      smart_format: "true",
      punctuate: "true",
      diarize: "true",
      utterances: "true",
      paragraphs: "true",
      language: "id",
    });

    const response = await fetch(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": contentType,
        },
        body: new Blob([new Uint8Array(audio)]),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("Deepgram error:", response.status, detail);
      return NextResponse.json(
        { error: "Layanan transkripsi gagal memproses audio" },
        { status: 502 },
      );
    }

    const data = await response.json();

    const transcript = formatDiarizedTranscript(data);

    return NextResponse.json({
      transcript,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 },
    );
  }
}
