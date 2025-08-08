import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, history } from 'umi';

const SuccessPage: React.FC = () => {
  const { search } = useLocation();
  const [status, setStatus] = useState<'checking'|'ok'|'pending'|'error'>('checking');
  const token = useMemo(() => localStorage.getItem('sgai-google-token'), []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const sid = params.get('session_id');
    console.log('[Stripe] success session_id:', sid);

    let tries = 0;
    const maxTries = 20; // ~40s
    const tick = async () => {
      tries++;
      try {
        const headers: Record<string,string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/quota', { headers, credentials: 'include' });
        const data = await res.json();
        if (res.ok && data?.plan === 'premium') {
          setStatus('ok');
          setTimeout(() => history.push('/'), 1500);
          return;
        }
        if (tries < maxTries) {
          setStatus('pending');
          setTimeout(tick, 2000);
        } else {
          setStatus('error');
        }
      } catch {
        if (tries < maxTries) {
          setTimeout(tick, 2000);
        } else {
          setStatus('error');
        }
      }
    };
    tick();
  }, [search, token]);

  return (
    <div style={{minHeight:'60vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,textAlign:'center'}}>
      {status === 'checking' && (<><h1>Conferma pagamento…</h1><p>Verifico il tuo piano.</p></>)}
      {status === 'pending'  && (<><h1>Quasi fatto…</h1><p>Attendo il webhook di Stripe (alcuni secondi).</p></>)}
      {status === 'ok'       && (<><h1>Premium attivo ✅</h1><p>Reindirizzo alla home…</p></>)}
      {status === 'error'    && (<>
        <h1>Pagamento ricevuto</h1>
        <p>Non ho ancora ricevuto la conferma. Prova a tornare alla home:<br/>il piano si aggiornerà automaticamente appena arriva il webhook.</p>
        <button onClick={() => history.push('/')}>Vai alla home</button>
      </>)}
    </div>
  );
};

export default SuccessPage;
