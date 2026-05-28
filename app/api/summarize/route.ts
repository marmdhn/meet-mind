import { NextRequest, NextResponse } from "next/server";

const MAX_TRANSCRIPT_CHARS = 100_000;

const MODELS = [
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OpenRouter API key belum dikonfigurasi" },
        { status: 500 },
      );
    }

    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Transcript kosong atau tidak valid" },
        { status: 400 },
      );
    }

    const prompt = `
      Kamu adalah asisten meeting AI. Transkrip di bawah ini sudah diberi label
      pembicara dengan format "Pembicara 1:", "Pembicara 2:", dan seterusnya.

      Analisis transkrip lalu hasilkan output dalam Bahasa Indonesia memakai
      format Markdown berikut:

      # Ringkasan
      Ringkasan singkat jalannya meeting.

      # Poin per Pembicara
      Untuk tiap pembicara, ringkas kontribusi dan poin utama yang mereka sampaikan.

      # Action Items
      Daftar tugas dalam bentuk bullet. Sebutkan pembicara mana yang bertanggung
      jawab bila bisa diketahui dari transkrip.

      # Keputusan Penting
      Keputusan-keputusan penting yang diambil dalam meeting.

      Transkrip:
      ${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}
      `;

    let lastStatus = 0;
    let lastDetail = "";

    for (const model of MODELS) {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        lastStatus = response.status;
        lastDetail = await response.text();
        console.error("OpenRouter error:", model, response.status, lastDetail);
        if (response.status === 429 || response.status >= 500) continue;
        break;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      if (content) {
        return NextResponse.json({ result: content });
      }

      lastStatus = 502;
      lastDetail = "Empty completion";
    }

    const rateLimited = lastStatus === 429;
    return NextResponse.json(
      {
        error: rateLimited
          ? "Semua model gratis sedang sibuk (rate-limited). Coba lagi sebentar."
          : "Layanan ringkasan gagal memproses transkrip",
        details: lastDetail.slice(0, 300),
      },
      { status: 502 },
    );
  } catch (error) {
    console.error("SUMMARY ERROR:", error);

    return NextResponse.json(
      {
        error: "Failed to summarize transcript",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
