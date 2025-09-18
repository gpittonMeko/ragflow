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
      // preferisci un full replace per evitare cache di history/redirect
      window.top!.location.replace(String(window.top!.location.href));
    } catch {
      const params = new URLSearchParams(window.location.search);
      const shared = params.get('shared_id');
      window.location.replace(`/chat/share${shared ? `?shared_id=${shared}` : ''}`);
    }
  };

  return (
    <div style={{
      display:'flex', justifyContent:'center', alignItems:'center',
      padding:6, width:'100%'
    }}>
      <div style={{
        width:'min(180px, 100%)',   // 👈 perfetto per iframe ~200px
        border:'1px solid rgba(255,255,255,.16)',
        background:'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
        backdropFilter:'blur(4px)',
        borderRadius:12,
        padding:8,
        textAlign:'center'
      }}>
        <button
          onClick={reloadAll}
          style={{
            width:'100%',
            border:'1px solid rgba(255,255,255,.22)',
            background:'linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.10))',
            color:'inherit',
            borderRadius:10,
            padding:'8px 10px',
            cursor:'pointer',
            fontSize:12,
            lineHeight:1,
            boxShadow:'0 4px 10px rgba(0,0,0,.12), inset 0 0 0 1px rgba(255,255,255,.06)',
            transition:'transform .08s ease, box-shadow .12s ease'
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          aria-label="Ricarica"
          title="Ricarica"
        >
          Ricarica
        </button>
      </div>
    </div>
  );
}
