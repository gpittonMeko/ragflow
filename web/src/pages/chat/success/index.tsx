// SuccessPage.tsx
import React, { useEffect } from 'react';

// usa SEMPRE il dominio “ufficiale” dell’API
const API_ORIGIN = 'https://sgailegal.com';
const baseURL = `${API_ORIGIN}/oauth`;

const SuccessPage: React.FC = () => {
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('session_id') || '';

    (async () => {
      try {
        const res = await fetch(
          `${baseURL}/api/stripe/verify-session?session_id=${encodeURIComponent(sid)}`,
          { credentials: 'include' }
        );
        const json = await res.json().catch(() => ({}));
        if (json?.email) localStorage.setItem('sgai-upgraded-email', json.email);

        // flag letta poi dalla home
        localStorage.setItem('sgai-upgraded', '1');
      } catch {}
      finally {
        // TORNA SEMPRE al dominio, NON all’IP
        window.location.replace('https://sgailegal.com/');
      }
    })();
  }, []);

  return <div style={{color:'#fff', padding:'2rem'}}>Sto aggiornando il tuo account…</div>;
};

export default SuccessPage;
