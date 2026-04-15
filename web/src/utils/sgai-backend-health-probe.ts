/** Se l’app RAGFlow non risponde (EC2 spenta, CF 52x, nginx 5xx), torna al sito marketing */
const SGAI_HOME_FALLBACK = 'https://home.sgailegal.com/';

const PRODUCTION_HOSTS = new Set([
  'sgailegal.com',
  'www.sgailegal.com',
  'app.sgailegal.com',
]);

function isSgaiProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  return PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());
}

let probeStarted = false;

/**
 * GET leggero su /v1/user/login (supportato dal backend anche senza body).
 * Prima si limitava a 502–504: Cloudflare usa 520–524, quindi il redirect non partiva.
 */
export function startSgaiBackendHealthProbe(): void {
  if (!isSgaiProductionHost() || probeStarted) return;
  probeStarted = true;

  const controller = new AbortController();
  const timeoutMs = 12000;
  const tid = window.setTimeout(() => controller.abort(), timeoutMs);

  void (async () => {
    try {
      const res = await fetch(`${window.location.origin}/v1/user/login`, {
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      window.clearTimeout(tid);
      const s = res.status;
      if (s >= 500 || s === 404) {
        window.location.replace(SGAI_HOME_FALLBACK);
      }
    } catch {
      window.clearTimeout(tid);
      window.location.replace(SGAI_HOME_FALLBACK);
    }
  })();
}
