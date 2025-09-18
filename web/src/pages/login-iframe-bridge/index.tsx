// File: src/pages/login-iframe-bridge.tsx
import React, { useEffect } from 'react';

export default function LoginIframeBridge() {
  // Se non è in iframe → vai alla pagina di login “vera”
  useEffect(() => {
    if (window.top === window.self) {
      window.location.replace('/sgai-access-login');
      return;
    }
    // Dentro iframe: invia token al parent o chiedilo (silenziosamente)
    const t = localStorage.getItem('Authorization') || localStorage.getItem('access_token');
    try {
      if (t) window.parent.postMessage({ type: 'ragflow-token', token: t }, '*');
      else window.parent.postMessage({ type: 'shared-needs-token' }, '*');
    } catch {}
  }, []);

  // Ricarica l’intera pagina del parent; fallback: ricarica questa share
  const reloadAll = () => {
    try {
      window.top!.location.replace(String(window.top!.location.href));
    } catch {
      const params = new URLSearchParams(window.location.search);
      const shared = params.get('shared_id');
      window.location.replace(`/chat/share${shared ? `?shared_id=${shared}` : ''}`);
    }
  };

  return (
    <>
      <style>{`
        .sga-wrap{display:flex;justify-content:center;align-items:center;padding:6px;width:100%}
        .sga-card{width:min(196px,100%);box-sizing:border-box;border:1px solid rgba(255,255,255,.16);
          background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.035));
          backdrop-filter:blur(6px);border-radius:14px;padding:10px;text-align:center;
          box-shadow:0 4px 14px rgba(0,0,0,.14), inset 0 0 0 1px rgba(255,255,255,.05)}
        .sga-btn{width:100%;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
          gap:8px;padding:11px 12px;border-radius:12px;font-size:13.5px;line-height:1.1;cursor:pointer;
          color:inherit;border:1px solid rgba(255,255,255,.28);
          background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.12));
          box-shadow:0 6px 16px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.08);
          transition:transform .08s ease, box-shadow .12s ease, filter .12s ease, border-color .12s ease}
        .sga-btn:hover{filter:brightness(1.06);box-shadow:0 9px 20px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.1)}
        .sga-btn:active{transform:scale(.985)}
        .sga-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(99,102,241,.35), 0 8px 18px rgba(0,0,0,.2)}
      `}</style>

      <div className="sga-wrap">
        <div className="sga-card">
          <button
            onClick={reloadAll}
            className="sga-btn"
            aria-label="Ricarica"
            title="Ricarica"
          >
            Accedi alla Chat
          </button>
        </div>
      </div>
    </>
  );
}
