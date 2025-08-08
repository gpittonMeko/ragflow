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
        // 1) Dì al backend di verificare la sessione e promuovere l’utente
        // Sostituisci il path qui sotto con quello che hai (se diverso):
        const res = await fetch(`${baseURL}/api/stripe/verify-session?session_id=${sid ?? ''}`, {
          credentials: 'include',
        });

        // 2) Metti un flag per forzare il refresh quota quando torniamo
        localStorage.setItem('sgai-upgraded', '1');
      } catch (e) {
        // non bloccare il redirect anche se fallisce qui
      } finally {
        // 3) Torna alla pagina principale
        window.location.replace('/');
      }
    })();
  }, []);

  return <div style={{color:'#fff', padding:'2rem'}}>Sto aggiornando il tuo account…</div>;
};

export default SuccessPage;
