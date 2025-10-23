import { CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './index.less';

interface IProps {
  phoneNumber?: string;
  position?: { x: number; y: number };
}

const WhatsAppSupport = ({
  phoneNumber = '3288216708',
  position = { x: 20, y: 20 },
}: IProps) => {
  console.log('[WhatsAppSupport] Component rendering...');
  const [isVisible, setIsVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentPosition, setCurrentPosition] = useState(position);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - currentPosition.x,
        y: e.clientY - currentPosition.y,
      });
    },
    [currentPosition],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Limita la posizione entro i bordi della finestra
      const maxX = window.innerWidth - 60; // 60px = larghezza del bottone
      const maxY = window.innerHeight - 60; // 60px = altezza del bottone

      setCurrentPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Aggiungi event listeners per il drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleWhatsAppClick = useCallback(() => {
    const message = encodeURIComponent(
      'Ciao! Ho bisogno di assistenza con SGAI.',
    );
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  }, [phoneNumber]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
  }, []);

  if (!isVisible) {
    console.log('[WhatsAppSupport] Component not visible');
    return null;
  }

  console.log(
    '[WhatsAppSupport] Rendering component at position:',
    currentPosition,
  );

  return (
    <div
      className={styles.whatsappSupport}
      style={{
        position: 'fixed',
        left: `${currentPosition.x}px`,
        top: `${currentPosition.y}px`,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'grab',
        backgroundColor: 'red', // DEBUG: colore di debug
        width: '60px',
        height: '60px',
        border: '2px solid blue',
      }}
      onMouseDown={handleMouseDown}
    >
      <Tooltip title="Trascina per spostare • Clicca per WhatsApp">
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<MessageOutlined />}
          onClick={handleWhatsAppClick}
          className={styles.whatsappButton}
        />
      </Tooltip>

      <Button
        type="text"
        shape="circle"
        size="small"
        icon={<CloseOutlined />}
        onClick={handleClose}
        className={styles.closeButton}
      />
    </div>
  );
};

export default WhatsAppSupport;
