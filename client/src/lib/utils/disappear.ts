const DISAPPEAR_KEY = 'mwt:disappear';

export function getDisappearAfter(pin: string): number {
  try { return parseInt(localStorage.getItem(`${DISAPPEAR_KEY}:${pin}`) ?? '0') || 0; } catch { return 0; }
}
export function setDisappearAfter(pin: string, seconds: number): void {
  try { localStorage.setItem(`${DISAPPEAR_KEY}:${pin}`, String(seconds)); } catch {}
}
