/** A single block that should stay intact: a table, a heading, or a list item. */
function keepBlock(block: string): boolean {
  return /\|/.test(block) || /^#{1,6}\s/.test(block) || /^(\d+\.\s|[-*]\s)/.test(block);
}

/** Split a one-line answer into paragraphs at sentence boundaries. Tables and lists stay as they are. */
function readableParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed || keepBlock(trimmed)) return trimmed;
      const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
      return sentences.length > 1 ? sentences.join("\n\n") : trimmed;
    })
    .filter((block) => block.length > 0)
    .join("\n\n");
}

/** Turn a one-line model answer into markdown a person can read. */
export function answerMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  text = text.replace(/[ \t]+(\d{1,2})\.\s+/g, "\n\n$1. ");
  text = text.replace(/[ \t]+(In short[,:])/gi, "\n\n$1");
  const title = text.match(/^\*\*([^*]+)\*\*\s*/);
  if (title && title[1].trim().length > 0 && title[1].trim().length < 140) {
    text = `## ${title[1].trim()}\n\n${text.slice(title[0].length).trim()}`;
  }
  return readableParagraphs(text);
}

/**
 * A model answer that stops at the output limit ends mid-sentence.
 * A complete answer ends with a sentence mark, a closing bracket or quote, a table row, or a closing emphasis mark.
 */
export function answerIncomplete(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  return !/[.!?)"'`*\]|\u201d\u2019]$/.test(text);
}
