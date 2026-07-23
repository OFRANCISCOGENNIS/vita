// Thin re-export: sentence grouping moved to lib/sentences so the cut
// generation pipeline (lib/smart-cuts) can share it with the editor UI.

import { groupWords, type SpeechSentence } from "@/lib/sentences";
import type { Cut } from "@/lib/types";

export type Sentence = SpeechSentence;

export function groupSentences(cut: Cut): Sentence[] {
  return groupWords(cut.transcript);
}
