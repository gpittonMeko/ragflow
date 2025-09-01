import React, { useEffect, useMemo, useState } from 'react';

const css = `
:root{
  --bg: #0e1116;
  --card: rgba(23,26,33,.75);
  --fg: #e7e7e7;
  --muted: #9aa0a6;
  --accent: #31d2a1;
  --accent-2: #7c5cff;
  --danger: #ff6363;
  --ring: rgba(124,92,255,.35);
  --radius: 16px;
}
@media (prefers-color-scheme: light) {
  :root{ --bg:#f6f7fb; --card:#fff; --fg:#14171f; --muted:#6b7280; --ring:rgba(124,92,255,.15);}
}
*{box-sizing:border-box}
html,body,#root{height:100%}
.page{
  min-height:100%;
  margin:0; color:var(--fg);
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(124,92,255,.20), transparent 50%),
    radial-gradient(800px 500px at 110% 10%, rgba(49,210,161,.18), transparent 50%),
    var(--bg);
  display:flex; align-items:center; justify-content:center; padding:24px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";
}
.card{
  width:100%; max-width:720px; background:var(--card); backdrop-filter: blur(10px);
  border:1px solid rgba(255,255,255,.08); border-radius:var(--radius);
  box-shadow: 0 10px 40px rgba(0,0,0,.35);
  overflow:hidden;
}
.header{ display:flex; align-items:center; gap:10px; padding:18px 22px; border-bottom:1px solid rgba(255,255,255,.06) }
.logo{ display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px }
.logo svg{ width:24px; height:24px }
.body{ padding:26px 22px }
h1{ margin:.2rem 0 0 0; font-size:1.15rem }
p{ margin:.55rem 0; color:var(--muted) }
.status{
  display:flex; align-items:center; gap:10px; padding:14px 16px; border-radius:12px;
  background: rgba(124,92,255,.10); border:1px solid var(--ring);
}
.spinner{
  width:18px; height:18px; border-radius:50%; border:3px solid rgba(255,255,255,.25);
  border-top-color:var(--accent-2); animation:spin 900ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.check{
  width:20px;height:20px;border-radius:50%;
  background:linear-gradient(135deg,var(--accent),#17b27f);
  display:grid;place-items:center; box-shadow:0 0 0 6px rgba(49,210,161,.18);
  animation:pop .25s ease-out;
}
@keyframes pop { from{ transform:scale(.7); opacity:.4 } to{ transform:scale(1); opacity:1 } }
.controls{ display:flex; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap }
.btn{
  appearance:none; border:0; cursor:pointer; border-radius:12px; padding:12px 16px;
  background: linear-gradient(135deg, var(--accent-2), #5c79ff);
  color:white; font-weight:600; box-shadow:0 8px 24px rgba(92,121,255,.35);
  transition: transform .05s ease, filter .15s ease;
}
.btn:hover{ filter:brightness(1.06) }
.btn:active{ transform: translateY(1px) }
.muted{ color:var(--muted) }
code{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; padding:2px 6px; background:rgba(255,255,255,.06); border-radius:8px}
`;

type Status = 'loading' | 'ok' | 'error';

const SuccessPage: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string>('');
  const [left, setLeft] = useState<number>(3);

  const baseURL = useMemo(() => {
    // stesso base URL usato altrove
    return (window.location.origin + '/oauth').replace(/\/+$/, '/oauth');
  }, []);

  const redirectTo = useMemo(() => `${window.location.origin}/`, []);
  const title = status === 'loading'
    ? 'Verifica pagamento in corso…'
    : status === 'ok'
    ? 'Pagamento verificato. Piano PREMIUM attivato ✅'
    : 'Si è verificato un problema';
  const subtitle = status === 'loading'
    ? 'Per favore attendi qualche istante.'
    : status === 'ok'
    ? 'Stiamo collegando il tuo account…'
    : 'Non siamo riusciti a confermare il pagamento.';

  useEffect(() => {
    // styling globale (tema)
    document.documentElement.setAttribute('data-theme', 'dark');

    (async () => {
      try {
        // leggi session_id da query o hash
        const params = new URLSearchParams(location.search);
        let sid = params.get('session_id');
        if (!sid && location.hash.includes('session_id=')) {
          const q = location.hash.split('?')[1] || '';
          sid = new URLSearchParams(q).get('session_id');
        }
        if (!sid) {
          setStatus('error');
          setErrMsg('session_id assente nell’URL.');
          return;
        }

        const res = await fetch(
          `${baseURL}/api/stripe/verify-session?session_id=${encodeURIComponent(sid)}`,
          { credentials: 'include' },
        );
        const data = await res.json();

        if (res.ok && data?.ok) {
          try {
            localStorage.setItem('sgai-upgraded', '1');
            if (data.email) localStorage.setItem('sgai-upgraded-email', data.email);
          } catch {}
          if (data.email) setEmail(data.email);
          setStatus('ok');
        } else {
          const reason = data?.status || data?.error || 'errore';
          setErrMsg(`Verifica non riuscita: ${reason}`);
          setStatus('error');
        }
      } catch (e: any) {
        setErrMsg(`Errore di rete: ${e?.message || String(e)}`);
        setStatus('error');
      }
    })();
  }, [baseURL]);

  // countdown e redirect quando OK
  useEffect(() => {
    if (status !== 'ok') return;
    setLeft(3);
    const i = setInterval(() => setLeft((v) => v - 1), 1000);
    const t = setTimeout(() => { window.location.href = redirectTo; }, 3000);
    return () => { clearInterval(i); clearTimeout(t); };
  }, [status, redirectTo]);

  return (
    <div className="page">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="card" role="status" aria-live="polite">
        <div className="header">
          <div className="logo" aria-label="SGAI">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="9.5" opacity=".35"/>
              <path d="M7 12h10a5 5 0 1 1-1.47-3.53" />
            </svg>
            <span>SGAI — Pagamento</span>
          </div>
        </div>

        <div className="body">
          <div className="status" id="status">
            {status === 'loading' ? (
              <div className="spinner" aria-hidden="true" />
            ) : status === 'ok' ? (
              <div className="check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
            ) : (
              <div style={{width:18,height:18}} />
            )}
            <div>
              <div id="title">{title}</div>
              <div id="sub" className="muted">{subtitle}</div>
            </div>
          </div>

          {status === 'ok' && (
            <div style={{marginTop:8}}>
              <p><strong>Piano PREMIUM attivato.</strong> Benvenuto! 🎉</p>
              {email && (
                <p className="muted">Email collegata: <b>{email}</b></p>
              )}
              <div className="controls">
                <button className="btn" onClick={() => (window.location.href = redirectTo)}>
                  Vai subito alla home
                </button>
                <span className="muted">Reindirizzo tra <code>{left}</code>…</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div style={{color:'var(--danger)', marginTop:8}}>
              <p><strong>Verifica non riuscita.</strong></p>
              <p className="muted">{errMsg || 'Se il pagamento è andato a buon fine, aggiorna la pagina o contattaci.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuccessPage;
