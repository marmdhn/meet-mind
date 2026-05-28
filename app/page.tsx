import { UploadBox } from "@/components/upload-box";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex h-screen flex-col gap-6 overflow-hidden bg-zinc-950 p-10 text-white">
      <Image
        className="mx-auto"
        src="/logo.svg"
        alt="Logo"
        width={75}
        height={40}
        priority
      />
      <div className="mx-auto flex min-h-0 w-full max-w-10xl flex-1 flex-col">
        <UploadBox />
      </div>
      <div className="text-center text-sm text-zinc-400">
        Created by{" "}
        <a
          href="https://marmdhn.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          MARMDHN
        </a>
      </div>
    </main>
  );
}
