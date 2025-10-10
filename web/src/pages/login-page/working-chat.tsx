import { useTheme } from '@/components/theme-provider';
import React, { useEffect } from 'react';
import ChatContainer from '../chat/share/large';

interface WorkingChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
}

const WorkingChat: React.FC<WorkingChatProps> = ({
  agentId,
  className,
  style,
}) => {
  const { theme } = useTheme();

  // Simula i parametri URL che ChatContainer si aspetta
  useEffect(() => {
    // Salva i parametri URL originali
    const originalSearch = window.location.search;
    const originalPathname = window.location.pathname;

    // Imposta i parametri che ChatContainer si aspetta
    const newSearch = `?shared_id=${agentId}&from=agent&visible_avatar=1`;
    const newPathname = '/chat/share';

    // Aggiorna l'URL senza ricaricare la pagina
    window.history.replaceState({}, '', newPathname + newSearch);

    // Cleanup: ripristina i parametri originali quando il componente viene smontato
    return () => {
      window.history.replaceState({}, '', originalPathname + originalSearch);
    };
  }, [agentId]);

  return (
    <div className={className} style={style}>
      <ChatContainer theme={theme} />
    </div>
  );
};

export default WorkingChat;
