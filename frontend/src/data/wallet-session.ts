const PAUSED = "pqtabs.paused";

export function walletSessionPaused(): boolean {
  try {
    return window.sessionStorage.getItem(PAUSED) === "1";
  } catch {
    return false;
  }
}

export function pauseWalletSession(): void {
  window.sessionStorage.setItem(PAUSED, "1");
}

export function resumeWalletSession(): void {
  window.sessionStorage.removeItem(PAUSED);
}
