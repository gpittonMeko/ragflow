// File: src/pages/login-iframe-bridge.tsx
import React, { useEffect, useState } from 'react';

const btnStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)',
  color: 'inherit',
  borderRadius: 12,
  padding: '10px 14px',
  cursor: 'pointer'
};

export default function LoginIframeBridge() {
  const [insideIframe, setInsideIframe] = useState(false);

  useEffect(() => {
    const inFrame = window.top !== window.self;
    setInsideIframe(inFrame);

    if (!inFrame) {
      // fuori dall'iframe → usa la pagina di login reale
      window.location.replace('/sgai-access-login'); // oppure '/login-next'
      return;
    }

    // dentro iframe → prova a usare un token locale o chiedilo al parent
    const t =
      localStorage.getItem('Authorization') ||
      localStorage.getItem('access_token');
    if (t) {
      try { window.parent.postMessage({ type: 'ragflow-token', token: t }, '*'); } catch {}
    } else {
      try { window.parent.postMessage({ type: 'shared-needs-token' }, '*'); } catch {}
    }
  }, []);

  if (!insideIframe) return null;

  const reloadHere = () => {
    // Torna alla share (conserva eventuale shared_id nella query)
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('shared_id');
    const extra = shared ? `?shared_id=${shared}` : '';
    window.location.replace(`/chat/share${extra}`);
  };

  const askAuthThenReload = () => {
    try { window.parent.postMessage({ type: 'shared-needs-token' }, '*'); } catch {}
    setTimeout(reloadHere, 700);
  };

  const toHome = () => { window.location.href = '/'; };

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      padding:24, textAlign:'center'
    }}>
      <div style={{
        background:'rgba(255,255,255,0.08)', backdropFilter:'blur(8px)',
        padding:24, borderRadius:16, maxWidth:560, width:'100%'
      }}>
        <h1 style={{margin:'0 0 8px'}}>Serve l’autorizzazione</h1>
        <p style={{margin:'0 0 16px', opacity:.85}}>
          Non riusciamo a caricare la chat: proviamo a ricaricare o a ottenere il token dal sito principale.
        </p>
        <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
          <button style={btnStyle} onClick={reloadHere}>Ricarica</button>
          <button style={btnStyle} onClick={askAuthThenReload}>Acquisisci autorizzazione</button>
          <button style={btnStyle} onClick={toHome}>Home</button>
        </div>
      </div>
    </div>
  );
}
