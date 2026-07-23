"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionProps {
  items: { question: string; answer: string }[];
  className?: string;
}

export function Accordion({ items, className }: AccordionProps) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={cn("divide-y divide-line rounded-2xl border border-line bg-surface-1", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-zinc-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-xl"
            >
              {item.question}
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {isOpen && <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-400">{item.answer}</p>}
          </div>
        );
      })}
    </div>
  );
}
