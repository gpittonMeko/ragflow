// web/src/hooks/agent-chat-hooks/useFetchAgentAvatar.ts
import { useState, useEffect } from 'react';

interface UseFetchAgentAvatar {
    data: { avatar?: string } | undefined;
    loading: boolean;
    error: any; // Puoi definire un tipo più specifico per l'errore
}

export const useFetchAgentAvatar = (agentId: string): UseFetchAgentAvatar => {
    const [data, setData] = useState<{ avatar?: string }>();
    const [loading, setLoading] = useState<boolean>(true); // Inizia caricamento a true
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!agentId) {
            setLoading(false);
            return; // Nessun agentId, non fare la chiamata
        }

        const fetchAvatar = async () => {
            setLoading(true); // Inizia caricamento
            setError(null); // Resetta errori precedenti
            try {
                // **MODIFICA QUESTO ENDPOINT SE NECESSARIO. VERIFICA API PER INFO AGENTE E AVATAR!**
                const response = await fetch(`/api/v1/agents/${agentId}`, { // Esempio endpoint - DA VERIFICARE!
                    headers: {
                        'Authorization': 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm' // **INSERISCI LA TUA API KEY!**
                    },
                });
                if (!response.ok) {
                    throw new Error(`Errore HTTP! status: ${response.status}`);
                }
                const responseData = await response.json();
                if (responseData.code === 0 && responseData.data) {
                    setData({ avatar: responseData.data.avatar || undefined }); // Assumi che la risposta abbia un campo 'avatar'
                } else {
                    setError(responseData.message || "Errore nel recupero avatar agente");
                }
            } catch (error) {
                setError(error);
            } finally {
                setLoading(false); // Fine caricamento, sia successo o errore
            }
        };

        fetchAvatar();
    }, [agentId]);

    return { data, loading, error };
};