import { loadStripe } from '@stripe/stripe-js';
import { Button, Spin } from 'antd';
import {
  CheckCircle,
  CreditCard,
  Download,
  Mail,
  Shield,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'umi';
import styles from './index.less';

const STRIPE_PK =
  'pk_live_51RkiUSBo6bKd1aEWDjFk1pcLrwyqKH2Z5W7HMYfs41Zl018725OsU5bEImNUR4RgwMIYFuZwdTktddU3ydAL8cYY00TBKXJ0di';
const stripePromise = loadStripe(STRIPE_PK);

const getBaseURL = () => {
  const envBase = process.env.UMI_APP_API_BASE as string | undefined;
  if (envBase) {
    const url = new URL(envBase);
    url.protocol = window.location.protocol;
    return url.origin + url.pathname.replace(/\/$/, '');
  }
  return `${window.location.protocol}//${window.location.hostname}/oauth`;
};
const baseURL = getBaseURL();

interface SubscriptionData {
  plan: 'free' | 'premium';
  email: string;
  stripe_customer_id?: string;
  subscription_id?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}

const SubscriptionPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    null,
  );
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${baseURL}/api/subscription/info`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        toast.error('Devi essere loggato per vedere gli abbonamenti');
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const data = await res.json();
      setSubscription(data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati abbonamento');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setActionLoading(true);
    try {
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe non caricato');

      const res = await fetch(`${baseURL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selected_plan: 'premium' }),
      });

      if (res.status === 401) {
        toast.error('Devi accedere con Google prima di procedere');
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Errore backend Stripe');

      const { sessionId } = payload;
      if (!sessionId) throw new Error('sessionId assente nel payload');

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw new Error(error.message);
    } catch (error: any) {
      toast.error(error.message || "Errore durante l'upgrade");
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        "Sei sicuro di voler cancellare l'abbonamento? Potrai continuare ad usare Premium fino alla fine del periodo già pagato.",
      )
    ) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${baseURL}/api/subscription/cancel`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore cancellazione');

      toast.success('Abbonamento cancellato con successo');
      await fetchSubscriptionData();
    } catch (error: any) {
      toast.error(error.message || 'Errore durante la cancellazione');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${baseURL}/api/subscription/portal`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore portale Stripe');

      window.location.href = data.url;
    } catch (error: any) {
      toast.error(error.message || 'Errore apertura portale');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.subscriptionContainer}>
        <div className={styles.loadingContainer}>
          <Spin size="large" />
          <p>Caricamento dati abbonamento...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className={styles.subscriptionContainer}>
        <div className={styles.errorContainer}>
          <p>Errore nel caricamento dei dati</p>
          <Button onClick={() => navigate('/')}>Torna alla Home</Button>
        </div>
      </div>
    );
  }

  const isPremium = subscription.plan === 'premium';
  const isFree = subscription.plan === 'free';

  return (
    <div className={styles.subscriptionContainer}>
      <button onClick={() => navigate('/')} className={styles.backButton}>
        ← Torna alla Home
      </button>

      <div className={styles.header}>
        <h1>Gestione Abbonamento</h1>
        <p className={styles.subtitle}>
          Gestisci il tuo piano e le impostazioni di pagamento
        </p>
      </div>

      <div className={styles.content}>
        <div className={styles.currentPlanCard}>
          <div className={styles.planHeader}>
            <div className={styles.planInfo}>
              <h2>Piano Attuale</h2>
              <span
                className={isPremium ? styles.badgePremium : styles.badgeFree}
              >
                {isPremium ? 'PREMIUM' : 'FREE'}
              </span>
            </div>
            {isPremium ? (
              <CheckCircle className={styles.iconPremium} size={48} />
            ) : (
              <Shield className={styles.iconFree} size={48} />
            )}
          </div>

          <div className={styles.planDetails}>
            <div className={styles.detailRow}>
              <Mail size={20} />
              <span>
                <strong>Email:</strong> {subscription.email}
              </span>
            </div>

            {isPremium && subscription.current_period_end && (
              <div className={styles.detailRow}>
                <CreditCard size={20} />
                <span>
                  <strong>Rinnovo:</strong>{' '}
                  {new Date(subscription.current_period_end).toLocaleDateString(
                    'it-IT',
                  )}
                </span>
              </div>
            )}

            {subscription.cancel_at_period_end && (
              <div className={styles.cancelNotice}>
                <XCircle size={20} />
                <span>
                  L&apos;abbonamento è stato cancellato e terminerà il{' '}
                  {new Date(
                    subscription.current_period_end!,
                  ).toLocaleDateString('it-IT')}
                </span>
              </div>
            )}
          </div>

          <div className={styles.planFeatures}>
            <h3>Cosa include il tuo piano:</h3>
            <ul>
              {isFree && (
                <>
                  <li>✅ 5 generazioni giornaliere</li>
                  <li>✅ Accesso base alla knowledge base</li>
                  <li>✅ Ricerca semplice sentenze</li>
                  <li>❌ Generazioni illimitate</li>
                  <li>❌ Ricerca avanzata</li>
                  <li>❌ Supporto prioritario</li>
                </>
              )}
              {isPremium && (
                <>
                  <li>✅ Generazioni illimitate</li>
                  <li>✅ Accesso completo alla knowledge base</li>
                  <li>✅ Ricerca avanzata e semantica</li>
                  <li>✅ Analisi documenti complessi</li>
                  <li>✅ Supporto prioritario via WhatsApp</li>
                  <li>✅ Accesso anticipato nuove funzioni</li>
                </>
              )}
            </ul>
          </div>

          <div className={styles.actions}>
            {isFree && (
              <Button
                type="primary"
                size="large"
                onClick={handleUpgrade}
                loading={actionLoading}
                className={styles.upgradeButton}
              >
                🚀 Passa a Premium
              </Button>
            )}

            {isPremium && (
              <>
                <Button
                  size="large"
                  onClick={handleManageBilling}
                  loading={actionLoading}
                  icon={<CreditCard />}
                >
                  Gestisci Pagamenti
                </Button>

                {!subscription.cancel_at_period_end && (
                  <Button
                    danger
                    size="large"
                    onClick={handleCancelSubscription}
                    loading={actionLoading}
                    icon={<XCircle />}
                  >
                    Cancella Abbonamento
                  </Button>
                )}

                <Button
                  size="large"
                  onClick={() =>
                    window.open(`${baseURL}/api/subscription/invoice`, '_blank')
                  }
                  icon={<Download />}
                >
                  Scarica Fatture
                </Button>
              </>
            )}
          </div>
        </div>

        {isFree && (
          <div className={styles.upgradeCard}>
            <h3>Perché passare a Premium?</h3>
            <div className={styles.benefitsList}>
              <div className={styles.benefit}>
                <CheckCircle className={styles.benefitIcon} />
                <div>
                  <strong>Nessun limite</strong>
                  <p>Genera tutte le risposte che vuoi, 24/7</p>
                </div>
              </div>
              <div className={styles.benefit}>
                <CheckCircle className={styles.benefitIcon} />
                <div>
                  <strong>Ricerca Avanzata</strong>
                  <p>Trova precedenti giurisprudenziali in secondi</p>
                </div>
              </div>
              <div className={styles.benefit}>
                <CheckCircle className={styles.benefitIcon} />
                <div>
                  <strong>Supporto Prioritario</strong>
                  <p>Risposte immediate via WhatsApp</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPage;
