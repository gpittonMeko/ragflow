import React, { useEffect, useState } from 'react';

const Success: React.FC = () => {
  const [msg, setMsg] = useState('Verifica pagamento in corso…');
  const [email, setEmail] = useState<string | null>(null);

  // stesso baseURL usato altrove: https://sgailegal.com/oauth
  const baseURL =
    (process.env.UMI_APP_API_BASE as string | undefined) ||
    `${window.location.origin}/oauth`;

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('session_id');
        if (!sid) {
          setMsg('session_id assente nell’URL');
          return;
        }

        const res = await fetch(`${baseURL}/api/stripe/verify-session?session_id=${encodeURIComponent(sid)}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (res.ok && data?.ok) {
          setEmail(data.email || null);
          setMsg('Pagamento verificato. Piano PREMIUM attivato ✅');

          // segna localmente che l’upgrade è andato a buon fine
          localStorage.setItem('sgai-upgraded', '1');
          if (data.email) localStorage.setItem('sgai-upgraded-email', data.email);

          // opzionale: torna alla home dopo qualche secondo
          setTimeout(() => {
            window.location.href = '/';
          }, 2500);
        } else {
          setMsg(`Verifica non riuscita: ${data?.status || data?.error || 'errore'}`);
        }
      } catch (e: any) {
        setMsg(`Errore di rete durante la verifica: ${e?.message || e}`);
      }
    })();
  }, []);

  return (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <h1>Pagamento</h1>
      <p>{msg}</p>
      {email ? <p>Email: <b>{email}</b></p> : null}
    </div>
  );
};

export default Success;
