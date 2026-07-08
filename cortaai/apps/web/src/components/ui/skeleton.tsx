import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-xl bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:400px_100%]",
        className,
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4">
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-2 h-3 w-2/5" />
    </div>
  );
}
