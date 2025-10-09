import React from 'react';
import { useLocation, useNavigate } from 'umi';
import ChatContainer from '../chat/share/large';

interface EmbeddedChatProps {
  agentId: string;
  className?: string;
  style?: React.CSSProperties;
}

const EmbeddedChat: React.FC<EmbeddedChatProps> = ({
  agentId,
  className,
  style,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Simula l'URL con i parametri necessari per ChatContainer
  React.useEffect(() => {
    const currentParams = new URLSearchParams(location.search);
    if (!currentParams.get('shared_id')) {
      const newParams = new URLSearchParams({
        shared_id: agentId,
        from: 'agent',
        visible_avatar: '1',
      });
      // Aggiorna solo i search params, non cambiare pathname
      navigate(
        { search: `?${newParams.toString()}` },
        { replace: true, state: location.state },
      );
    }
  }, [agentId, location, navigate]);

  return (
    <div className={className} style={style}>
      <ChatContainer theme="dark" />
    </div>
  );
};

export default EmbeddedChat;
