import React, { useState, useEffect } from 'react';
import styles from './index.less';
import { GoogleOAuthProvider, GoogleLogin, CredentialResponse } from '@react-oauth/google';

// Usa il tuo client ID Google dal tuo screenshot
const GOOGLE_CLIENT_ID = "872236618020-3len9toeui389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com";

// Tipizzazione piano prezzi
type Plan = 'free' | 'standard' | 'premium';

interface User {
  email: string;
  plan: Plan;
  usedGenerations: number;
  generationLimit: number;
  token: string; // token id di google
}

const PresentationPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [remainingGenerations, setRemainingGenerations] = useState<number>(5); // default free limit
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  // Gestisce login con Google OAuth
  const onGoogleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      alert('Autenticazione fallita');
      return;
    }
    try {
      // Invia token ID al backend per validazione e logica piano
      const res = await fetch('http://localhost:5000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });
      if (!res.ok) throw new Error("Errore autenticazione backend");
      const data = await res.json();
      // data contiene user.email, user.plan, usedGenerations, generationLimit, token
      const loggedUser: User = {
        email: data.email,
        plan: data.plan,
        usedGenerations: data.usedGenerations,
        generationLimit: data.generationLimit,
        token: credentialResponse.credential,
      };
      setUser(loggedUser);
      setRemainingGenerations(loggedUser.generationLimit - loggedUser.usedGenerations);
      setIsAuthorized(true);
    } catch (e) {
      alert('Errore autenticazione ' + e);
    }
  };

  const onGoogleLoginError = () => {
    alert('Login fallito');
    setIsAuthorized(false);
    setUser(null);
  };

  // Funzione simulata che tenta di generare, controlla limiti
  const handleGenerate = async () => {
    if (!user) {
      alert('Devi autenticarti');
      return;
    }
    if (user.plan !== 'premium' && remainingGenerations <= 0) {
      alert('Hai raggiunto il limite di generazioni per il tuo piano. Effettua un upgrade.');
      return;
    }
    // Simula chiamata backend per registrare generazione
    const res = await fetch('http://localhost:5000/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({ }),
    });
    if (!res.ok) {
      alert('Errore durante la generazione');
      return;
    }
    const data = await res.json();
    setRemainingGenerations(data.remainingGenerations);
    alert('Generazione completata, rimangono ' + data.remainingGenerations);
  };

  // Funzione simulata upgrade piano pagamento
  const handleUpgrade = async (amount: number) => {
    if (!user) {
      alert('Devi autenticarti per aggiornare il piano');
      return;
    }
    const res = await fetch('http://localhost:5000/api/upgrade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`
      },
      body: JSON.stringify({ amount })
    });
    if (!res.ok) {
      alert('Errore aggiornamento piano');
      return;
    }
    const data = await res.json();
    setUser(u => u ? {...u, plan: data.plan, generationLimit: data.generationLimit} : null);
    setRemainingGenerations(data.generationLimit - (user?.usedGenerations || 0));
    alert(`Upgrade effettuato! Piano: ${data.plan}`);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className={styles.pageContainer} style={{textAlign:'center'}}>
        {!isAuthorized ? (
          <>
            <h2>Accedi per usare SGAI</h2>
            <GoogleLogin
              onSuccess={onGoogleLoginSuccess}
              onError={onGoogleLoginError}
              useOneTap
            />
          </>
        ) : (
          <>
            <h2>Benvenuto {user?.email}</h2>
            <p>Piano attuale: <strong>{user?.plan}</strong></p>
            <p>Generazioni rimanenti: <strong>{user?.plan === 'premium' ? '∞' : remainingGenerations}</strong></p>
            <button onClick={handleGenerate}>Genera Risposta AI</button>
            <div style={{marginTop:'20px'}}>
              <h3>Aggiorna piano:</h3>
              <button onClick={() => handleUpgrade(49.99)}>Upgrade a Standard (49,99€)</button>
              <button onClick={() => handleUpgrade(69.99)} style={{marginLeft:'10px'}}>Upgrade a Premium (69,99€)</button>
            </div>
          </>
        )}
      </div>
    </GoogleOAuthProvider>
  );
};

export default PresentationPage;