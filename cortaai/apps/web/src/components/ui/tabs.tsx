"use client";

import { cn } from "@/lib/utils";

interface TabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1", className)}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            value === tab.id
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow"
              : "text-zinc-400 hover:text-white",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
