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
  return text;
}
