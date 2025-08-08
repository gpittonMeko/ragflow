import React, { useEffect } from 'react';

const baseURL =
  (process.env.UMI_APP_API_BASE as string | undefined) ||
  `${window.location.origin}/oauth`;

const SuccessPage: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');

    (async () => {
      try {
        const res = await fetch(`${baseURL}/api/stripe/verify-session?session_id=${encodeURIComponent(sid ?? '')}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        console.log('[verify-session]', res.status, data);

        if (data?.ok) {
          localStorage.setItem('sgai-upgraded', '1');
          if (data.email) localStorage.setItem('sgai-upgraded-email', data.email);
        }
      } catch (e) {
        console.warn('[verify-session] errore', e);
      } finally {
        window.location.replace('/');
      }
    })();
  }, []);

  return <div style={{color:'#fff', padding:'2rem'}}>Sto aggiornando il tuo account…</div>;
};

export default SuccessPage;
