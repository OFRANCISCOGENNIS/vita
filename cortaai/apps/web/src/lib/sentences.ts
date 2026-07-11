// Groups a word-level transcript into sentences. Lives in lib/ (framework-free)
// so both the editor UI and the cut-generation pipeline can share it.

import type { TranscriptWord } from "./types";

export interface SpeechSentence {
  key: string;
  text: string;
  start: number; // absolute seconds (source video)
  end: number;
  words: TranscriptWord[];
}

/** Max gap between words before we force a sentence break (unpunctuated ASR). */
const MAX_WORD_GAP_SECONDS = 0.9;
/** Hard cap so run-on unpunctuated speech still yields usable sentences. */
const MAX_WORDS_PER_SENTENCE = 25;

export function groupWords(words: TranscriptWord[]): SpeechSentence[] {
  const sentences: SpeechSentence[] = [];
  let current: TranscriptWord[] = [];
  for (const w of words) {
    const prev = current[current.length - 1];
    if (prev && w.start - prev.end > MAX_WORD_GAP_SECONDS) {
      sentences.push(makeSentence(current));
      current = [];
    }
    current.push(w);
    if (/[.!?…]$/.test(w.word) || current.length >= MAX_WORDS_PER_SENTENCE) {
      sentences.push(makeSentence(current));
      current = [];
    }
  }
  if (current.length > 0) sentences.push(makeSentence(current));
  return sentences;
}

function makeSentence(words: TranscriptWord[]): SpeechSentence {
  return {
    key: `${words[0].start}`,
    text: words.map((w) => w.word).join(" "),
    start: words[0].start,
    end: words[words.length - 1].end,
    words,
  };
}
