// web/src/hooks/agent-chat-hooks/useSendAgentMessage.ts
import { useState, useRef, useCallback } from 'react';
import { MessageType } from '@/constants/chat';
import { v4 as uuidv4 } from 'uuid';

interface Message {
    id: string;
    role: MessageType;
    content: string;
    doc_ids?: string[];
    reference?: any; // Define a type for reference if needed
    loading?: boolean;
    error?: boolean;
}

interface UseSendAgentMessage {
    value: string;
    loading: boolean;
    sendLoading: boolean;
    derivedMessages: Message[];
    ref: React.RefObject<HTMLDivElement>;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    handlePressEnter: (e?: React.KeyboardEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLButtonElement>) => void;
    regenerateMessage: (messageId: string) => void;
    removeMessageById: (messageId: string) => void;
}

export const useSendAgentMessage = (agentId: string): UseSendAgentMessage => {
    const [value, setValue] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [sendLoading, setSendLoading] = useState<boolean>(false);
    const [derivedMessages, setDerivedMessages] = useState<Message[]>([]); // Stato per la history dei messaggi
    const ref = useRef<HTMLDivElement>(null);
    const [sessionId, setSessionId] = useState<string | null>(null); // Stato per session_id

    // Funzione per creare la sessione agente (chiamata API)
    const createAgentSession = useCallback(async () => {
        if (!agentId) {
            console.error("Agent ID non fornito.");
            return null;
        }
        try {
            const response = await fetch(`/api/v1/agents/${agentId}/sessions`, { // **ENDPOINT CORRETTO**
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm' // **INSERISCI LA TUA API KEY!**
                },
                body: JSON.stringify({}) // Body vuoto o con parametri "Begin" se necessari
            });
            const data = await response.json();
            if (data.code === 0 && data.data && (data.data.id || data.data.session_id)) {
                const newSessionId = data.data.id || data.data.session_id;
                setSessionId(newSessionId);
                console.log("Sessione agente creata con ID:", newSessionId);
                // **INIZIALIZZA LA HISTORY DEI MESSAGGI CON IL MESSAGGIO DI BENVENUTO DELL'AGENTE**
                setDerivedMessages([
                    {
                        id: uuidv4(),
                        role: MessageType.Assistant,
                        content: data.data.message?.[0]?.content || "Ciao! Come posso aiutarti?", // Usa messaggio iniziale API o default
                    }
                ]);
                return newSessionId;
            } else {
                console.error("Errore nella creazione sessione agente:", data);
                return null;
            }
        } catch (error) {
            console.error("Errore chiamata API creazione sessione:", error);
            return null;
        }
    }, [agentId]);

    // Funzione per inviare il messaggio utente e ottenere la completion (chiamata API)
    const sendAgentCompletion = useCallback(async (messageContent: string) => {
        if (!agentId) {
            console.error("Agent ID non disponibile per la completion.");
            return;
        }
        if (!sessionId) {
            console.error("Session ID non disponibile. La sessione deve essere creata prima.");
            return;
        }

        setSendLoading(true);
        const newUserMessage: Message = {
            id: uuidv4(),
            role: MessageType.User,
            content: messageContent,
            doc_ids: [],
        };
        setDerivedMessages(prevMessages => [...prevMessages, newUserMessage]);
        setValue('');

        try {
            const response = await fetch(`/api/v1/agents/${agentId}/completions`, { // **ENDPOINT CORRETTO**
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm' // **INSERISCI LA TUA API KEY!**
                },
                body: JSON.stringify({
                    question: messageContent,
                    stream: false,
                    session_id: sessionId,
                }),
            });
            const data = await response.json();
            setSendLoading(false);

            if (data.code === 0 && data.data) {
                const assistantMessage: Message = {
                    id: uuidv4(),
                    role: MessageType.Assistant,
                    content: data.data.answer || "Risposta vuota dall'agente",
                    reference: data.data.reference,
                };
                setDerivedMessages(prevMessages => [...prevMessages, assistantMessage]);
            } else {
                console.error("Errore nella completion agente:", data);
                const errorAssistantMessage: Message = {
                    id: uuidv4(),
                    role: MessageType.Assistant,
                    content: "**Errore nella risposta dell'agente.** Riprova più tardi.",
                    error: true,
                };
                setDerivedMessages(prevMessages => [...prevMessages, errorAssistantMessage]);
            }
        } catch (error) {
            console.error("Errore chiamata API completion agente:", error);
            setSendLoading(false);
            const errorAssistantMessage: Message = {
                id: uuidv4(),
                role: MessageType.Assistant,
                content: "**Errore di comunicazione con il server.** Riprova più tardi.",
                error: true,
            };
            setDerivedMessages(prevMessages => [...prevMessages, errorAssistantMessage]);
        }
    }, [agentId, sessionId]);

    // Gestione input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValue(e.target.value);
    }, []);

    // Gestione pressione Enter o click su pulsante di invio
    const handlePressEnter = useCallback(
        (e?: React.KeyboardEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLButtonElement>) => {
            e?.preventDefault();
            const messageContent = value.trim();
            if (!messageContent) return;

            if (!sessionId) {
                // Se non c'è session_id, crea la sessione e poi invia il messaggio
                setLoading(true); // Mostra spinner di caricamento creazione sessione
                createAgentSession().then(newSessionId => {
                    setLoading(false); // Nascondi spinner creazione sessione
                    if (newSessionId) {
                        sendAgentCompletion(messageContent); // Invia messaggio solo se sessione creata
                    } else {
                        console.error("Impossibile creare la sessione agente, messaggio non inviato.");
                        // Gestisci errore creazione sessione (es. messaggio all'utente)
                    }
                });
            } else {
                sendAgentCompletion(messageContent); // Invia messaggio se sessione esiste già
            }
        },
        [value, sessionId, agentId, createAgentSession, sendAgentCompletion]
    );


    const regenerateMessage = useCallback((messageId: string) => {
        // Implementa la logica di rigenerazione del messaggio se necessario (opzionale per ora)
        console.log("Regenerate message:", messageId);
    }, []);

    const removeMessageById = useCallback((messageId: string) => {
        setDerivedMessages(prevMessages => prevMessages.filter(msg => msg.id !== messageId));
    }, []);


    return {
        value,
        loading,
        sendLoading,
        derivedMessages,
        ref,
        handleInputChange,
        handlePressEnter,
        regenerateMessage,
        removeMessageById,
    };
};