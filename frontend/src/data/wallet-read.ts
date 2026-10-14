/** One automatic retry. A single Arc blip should not leave the wallet on the error screen. */
export function shouldRetryWalletRead(attempt: number, message: string): boolean {
  return attempt === 0 && /could not be completed|temporarily unavailable|rate limit|Network reads are busy/i.test(message);
}
