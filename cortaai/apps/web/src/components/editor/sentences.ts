// Groups word-level transcript into sentences (shared by timeline + text panel).

import type { Cut, TranscriptWord } from "@/lib/types";

export interface Sentence {
  key: string;
  text: string;
  start: number; // absolute seconds (source video)
  end: number;
  words: TranscriptWord[];
}

export function groupSentences(cut: Cut): Sentence[] {
  const sentences: Sentence[] = [];
  let current: TranscriptWord[] = [];
  for (const w of cut.transcript) {
    current.push(w);
    if (/[.!?]$/.test(w.word)) {
      sentences.push(makeSentence(current));
      current = [];
    }
  }
  if (current.length > 0) sentences.push(makeSentence(current));
  return sentences;
}

function makeSentence(words: TranscriptWord[]): Sentence {
  return {
    key: `${words[0].start}`,
    text: words.map((w) => w.word).join(" "),
    start: words[0].start,
    end: words[words.length - 1].end,
    words,
  };
}
