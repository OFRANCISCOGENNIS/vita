import Link from "next/link";
import { Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg", className)}
      aria-label="CortaAí — página inicial"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-glow">
        <Scissors className="h-4 w-4 text-white" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight text-white">
        Corta<span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Aí</span>
      </span>
    </Link>
  );
}
