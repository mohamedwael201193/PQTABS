/** A failed price check names the cause and states that nothing was signed or broadcast. */
export function priceCheckFailure(detail: string | undefined, rewritten: string): string {
  if (detail && /rate limit|429/i.test(detail)) {
    return "Arc is rate limiting reads. Try again in a moment. Nothing was signed. Nothing was broadcast.";
  }
  const text = rewritten || "The price could not be checked against this capability. Nothing was signed. Nothing was broadcast.";
  if (/nothing was broadcast/i.test(text)) return text;
  if (/nothing was signed/i.test(text)) return `${text} Nothing was broadcast.`;
  return `${text} Nothing was signed. Nothing was broadcast.`;
}
