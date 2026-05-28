"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileAudio, Loader2, ArrowLeft } from "lucide-react";

type Stage = "idle" | "transcribing" | "summarizing" | "done" | "error";

const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 0;
const MAX_UPLOAD_BYTES =
  MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB * 1024 * 1024 : undefined;

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-zinc-400">
      <Loader2 className="mb-3 h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ResultBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export function UploadBox() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];

    if (!uploadedFile) return;

    setError("");
    setFile(uploadedFile);
  }, []);

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const tooLarge = rejections.some((r) =>
      r.errors.some((e) => e.code === "file-too-large"),
    );
    setError(
      tooLarge
        ? `File terlalu besar. Maksimal ${MAX_UPLOAD_MB} MB.`
        : "File tidak didukung.",
    );
  }, []);

  const handleTranscribe = async () => {
    if (!file) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      setError("");
      setTranscript("");
      setResult("");
      setStage("transcribing");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        signal,
      });

      const data = await response.json();
      if (signal.aborted) return;

      if (!response.ok) {
        throw new Error(data.error || "Gagal mentranskrip audio");
      }

      setTranscript(data.transcript);
      setStage("summarizing");

      const summarizeResponse = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: data.transcript,
        }),
        signal,
      });

      const summaryData = await summarizeResponse.json();
      if (signal.aborted) return;

      if (!summarizeResponse.ok) {
        throw new Error(summaryData.error || "Gagal membuat ringkasan");
      }

      setResult(summaryData.result);
      setStage("done");
    } catch (err) {
      if (signal.aborted) return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setStage("error");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleBack = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage("idle");
    setFile(null);
    setTranscript("");
    setResult("");
    setError("");
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a"],
    },
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
  });

  if (stage === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-6xl font-semibold tracking-tight">
            MeetMind
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Upload meeting audio and instantly generate AI-powered summaries,
            action items, and key decisions.
          </p>
        </div>

        <div className="w-full max-w-2xl space-y-6">
          <div
            {...getRootProps()}
            className={`
              cursor-pointer rounded-2xl border border-dashed p-10 transition-all
              ${
                isDragActive
                  ? "border-white bg-zinc-800"
                  : "border-zinc-700 bg-zinc-900/50"
              }
            `}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center justify-center text-center">
              {file ? (
                <>
                  <FileAudio className="mb-4 h-10 w-10 text-white" />

                  <p className="mb-2 text-lg font-medium text-white">
                    {file.name}
                  </p>

                  <p className="text-sm text-zinc-400">
                    Ready for transcription
                  </p>
                </>
              ) : (
                <>
                  <Upload className="mb-4 h-10 w-10 text-zinc-400" />

                  <p className="mb-2 text-lg font-medium text-white">
                    Drop your meeting audio here
                  </p>

                  <p className="text-sm text-zinc-500">
                    Supports MP3, WAV, and M4A
                    {MAX_UPLOAD_MB > 0 ? ` · max ${MAX_UPLOAD_MB}MB` : ""}
                  </p>
                </>
              )}
            </div>
          </div>

          {file && (
            <button
              onClick={handleTranscribe}
              className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200"
            >
              Generate Transcript
            </button>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <button
        onClick={handleBack}
        className="flex w-fit items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Upload audio lain
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row">
        <ResultBox title="Transcript">
          {transcript ? (
            <p className="whitespace-pre-wrap leading-7 text-zinc-300">
              {transcript}
            </p>
          ) : stage === "error" ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <LoadingState label="Mentranskrip audio..." />
          )}
        </ResultBox>

        <ResultBox title="AI Summary">
          {result ? (
            <pre className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
              {result}
            </pre>
          ) : stage === "summarizing" ? (
            <LoadingState label="Merangkum transkrip..." />
          ) : stage === "error" && transcript ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              Menunggu transkrip selesai
            </div>
          )}
        </ResultBox>
      </div>
    </div>
  );
}
