// File: src/pages/login-iframe-bridge.tsx
import React, { useEffect, useMemo } from 'react';

export default function LoginIframeBridge() {
  // Se non è in iframe → vai alla pagina di login “vera”
  useEffect(() => {
    if (window.top === window.self) {
      window.location.replace('/sgai-access-login');
      return;
    }
    // Dentro iframe: invia token al parent o chiedilo
    const t = localStorage.getItem('Authorization') || localStorage.getItem('access_token');
    try {
      if (t) window.parent.postMessage({ type: 'ragflow-token', token: t }, '*');
      else window.parent.postMessage({ type: 'shared-needs-token' }, '*');
    } catch {}
  }, []);

  // Mostra Authorization (o access_token) troncato
  const token = useMemo(
    () => localStorage.getItem('Authorization') || localStorage.getItem('access_token') || '',
    []
  );
  const short = token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '—';

  // Ricarica l’intera pagina (parent). Fallback: ricarica questa view /share
  const reloadAll = () => {
    try { window.top?.location.reload(); } catch {}
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('shared_id');
    window.location.replace(`/chat/share${shared ? `?shared_id=${shared}` : ''}`);
  };

  return (
    <div style={{ display:'flex', justifyContent:'center', padding:6 }}>
      <div style={{
        width:'min(180px, 100%)',  // 👈 pensato per iframe da ~200px
        border:'1px solid rgba(255,255,255,.14)',
        background:'rgba(255,255,255,.06)',
        backdropFilter:'blur(4px)',
        borderRadius:10,
        padding:8,
        textAlign:'center',
        fontSize:12,
        lineHeight:1.2
      }}>
        <div style={{ opacity:.9, marginBottom:6 }}>
          Authorization: <code style={{ fontSize:11 }}>{short}</code>
        </div>
        <button
          onClick={reloadAll}
          style={{
            border:'1px solid rgba(255,255,255,.2)',
            background:'rgba(255,255,255,.1)',
            color:'inherit',
            borderRadius:10,
            padding:'6px 10px',
            cursor:'pointer',
            fontSize:12,
            width:'100%'
          }}
          aria-label="Ricarica tutta la pagina"
        >
          Ricarica tutta la pagina
        </button>
      </div>
    </div>
  );
}
