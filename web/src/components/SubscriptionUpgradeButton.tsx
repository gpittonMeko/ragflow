import React from 'react';

interface Props {
  googleToken: string;
  userPlan: string;
}

const SubscriptionUpgradeButton: React.FC<Props> = ({ googleToken, userPlan }) => {
  if (!googleToken || userPlan === "premium") return null;

  const onClick = async () => {
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${googleToken}`
        }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Errore durante la creazione del checkout");
      }
    } catch (err) {
      alert("Errore Stripe: " + err);
    }
  };

  return (
    <button
      onClick={onClick}
      style={{
        margin: "20px auto",
        padding: "14px 32px",
        fontSize: 18,
        borderRadius: 8,
        background: "#7e22ce",
        color: "#fff",
        border: "none",
        width: "100%",
        maxWidth: 360
      }}
    >
      🔓 Sblocca Generazioni illimitate a 69€/mese
    </button>
  );
};

export default SubscriptionUpgradeButton;