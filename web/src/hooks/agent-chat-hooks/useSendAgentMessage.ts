// web/src/hooks/agent-chat-hooks/useSendAgentMessage.ts
import React, { useState, useRef, useCallback } from 'react';
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

export const useSendAgentMessage = (agentId: string, onFirstGeneration?: () => void): UseSendAgentMessage => {
    const [value, setValue] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [sendLoading, setSendLoading] = useState<boolean>(false);
    const [derivedMessages, setDerivedMessages] = useState<Message[]>([]); // Stato per la history dei messaggi
    const ref = useRef<HTMLDivElement>(null);
    const [sessionId, setSessionId] = useState<string | null>(null); // Stato per session_id
    const [hasGeneratedFirstMessage, setHasGeneratedFirstMessage] = useState<boolean>(false); // Flag per tracciare prima generazione

    // Funzione per creare la sessione agente (chiamata API)
    const createAgentSession = useCallback(async (retryCount = 0): Promise<string | null> => {
        if (!agentId) {
            console.error("Agent ID non fornito.");
            return null;
        }
        
        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1); // Delay incrementale: 1s, 2s, 3s
        
        try {
            console.log(`Tentativo creazione sessione agente (${retryCount + 1}/${maxRetries + 1})`);
            
            const response = await fetch(`/api/v1/agents/${agentId}/sessions`, { // **ENDPOINT CORRETTO**
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm' // **INSERISCI LA TUA API KEY!**
                },
                body: JSON.stringify({}) // Body vuoto o con parametri "Begin" se necessari
            });
            
            console.log("Session creation response status:", response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Session creation response data:", data);
            
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
                if (retryCount < maxRetries) {
                    console.log(`Retry in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return createAgentSession(retryCount + 1);
                }
                return null;
            }
        } catch (error) {
            console.error("Errore chiamata API creazione sessione:", error);
            if (retryCount < maxRetries) {
                console.log(`Retry in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return createAgentSession(retryCount + 1);
            }
            return null;
        }
    }, [agentId]);


    // Funzione per inviare il messaggio utente e ottenere la completion (chiamata API) - **DEFINIZIONE CORRETTA (UNA SOLA VOLTA)**
    const sendAgentCompletion = useCallback(async (messageContent: string, currentSessionId: string | null, retryCount = 0) => { // **ACCEPT session ID as argument**
        if (!agentId) {
            console.error("Agent ID non disponibile per la completion.");
            return;
        }
        if (!currentSessionId) { // **USE currentSessionId here**
            console.error("Session ID non disponibile. La sessione deve essere creata prima.");
            return;
        }

        const maxRetries = 2;
        const retryDelay = 1000 * (retryCount + 1); // Delay incrementale: 1s, 2s

        setSendLoading(true);
        const newUserMessage: Message = {
            id: uuidv4(),
            role: MessageType.User,
            content: messageContent,
            doc_ids: [],
        };
        
        // Aggiungi il messaggio utente alla history
        setDerivedMessages(prevMessages => {
            const updatedMessages = [...prevMessages, newUserMessage];
            return updatedMessages;
        });
        setValue('');

        try {
            // Prepara la history dei messaggi per l'API
            const currentMessages = derivedMessages;
            const messagesForAPI = [...currentMessages, newUserMessage].map(msg => ({
                role: msg.role,
                content: msg.content,
                doc_ids: msg.doc_ids || []
            }));

            console.log(`Agent Completion Request (${retryCount + 1}/${maxRetries + 1}):`, {
                agentId,
                sessionId: currentSessionId,
                messageContent,
                messagesCount: messagesForAPI.length,
                messages: messagesForAPI
            });

            const response = await fetch(`/api/v1/agents/${agentId}/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm' // **INSERISCI LA TUA API KEY!**
                },
                body: JSON.stringify({
                    question: messageContent,
                    stream: false,
                    session_id: currentSessionId, // **USE currentSessionId here**
                    messages: messagesForAPI, // **INVIA LA HISTORY DEI MESSAGGI**
                }),
            });
            
            console.log("Agent Completion Response Status:", response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Agent Completion Response Data:", data);
            setSendLoading(false);

            if (data.code === 0 && data.data) {
                const assistantMessage: Message = {
                    id: uuidv4(),
                    role: MessageType.Assistant,
                    content: data.data.answer || "Risposta vuota dall'agente",
                    reference: data.data.reference,
                };
                setDerivedMessages(prevMessages => [...prevMessages, assistantMessage]);
                
                // Chiama il callback per la prima generazione
                if (!hasGeneratedFirstMessage && onFirstGeneration) {
                    setHasGeneratedFirstMessage(true);
                    onFirstGeneration();
                }
            } else {
                console.error("Errore nella completion agente:", data);
                if (retryCount < maxRetries) {
                    console.log(`Retry completion in ${retryDelay}ms...`);
                    setSendLoading(false);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return sendAgentCompletion(messageContent, currentSessionId, retryCount + 1);
                }
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
            if (retryCount < maxRetries) {
                console.log(`Retry completion in ${retryDelay}ms...`);
                setSendLoading(false);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return sendAgentCompletion(messageContent, currentSessionId, retryCount + 1);
            }
            setSendLoading(false);
            const errorAssistantMessage: Message = {
                id: uuidv4(),
                role: MessageType.Assistant,
                content: "**Errore di comunicazione con il server.** Riprova più tardi.",
                error: true,
            };
            setDerivedMessages(prevMessages => [...prevMessages, errorAssistantMessage]);
        }
    }, [agentId, hasGeneratedFirstMessage, onFirstGeneration, derivedMessages]); // Aggiunto derivedMessages alle dipendenze


    // Gestione input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValue(e.target.value);
    }, []);

    const handlePressEnter = useCallback(
        (e?: React.KeyboardEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLButtonElement>) => {
            e?.preventDefault?.();
            const messageContent = value.trim();
            if (!messageContent) return;

            if (!sessionId) {
                // Se non c'è session_id, crea sessione poi invia messaggio
                setLoading(true);
                createAgentSession().then(newSessionId => {
                    setLoading(false);
                    if (newSessionId) {
                        setSessionId(newSessionId); // **SET SESSION ID HERE, IMMEDIATELY AFTER CREATION**
                        sendAgentCompletion(messageContent, newSessionId); // **PASS newSessionId to sendAgentCompletion**
                    } else {
                        console.error("Impossibile creare la sessione agente, messaggio non inviato.");
                        // Handle session creation error
                    }
                });
            } else {
                sendAgentCompletion(messageContent, sessionId); // **PASS existing sessionId**
            }
        },
        [value, sessionId, agentId, createAgentSession, sendAgentCompletion],
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