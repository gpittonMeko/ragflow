import { CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './index.less';

interface IProps {
  phoneNumber?: string;
  position?: { x: number; y: number };
}

const WhatsAppSupport = ({ phoneNumber = '3288216708', position }: IProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Default: bottom-LEFT (20px from left edge, 80px from bottom)
  const getDefaultPosition = () => {
    if (position) return position;
    return { x: 20, y: window.innerHeight - 80 };
  };

  const [currentPosition, setCurrentPosition] = useState(getDefaultPosition());

  // Funzione generica per gestire l'inizio del drag (mouse o touch)
  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true);
      setDragStart({
        x: clientX - currentPosition.x,
        y: clientY - currentPosition.y,
      });
    },
    [currentPosition],
  );

  // Funzione generica per gestire il movimento (mouse o touch)
  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging) return;

      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;

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

  // Handler per mouse
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleDragStart(e.clientX, e.clientY);
    },
    [handleDragStart],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    },
    [handleDragMove],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handler per touch
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleDragStart(touch.clientX, touch.clientY);
    },
    [handleDragStart],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      }
    },
    [handleDragMove],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Aggiungi event listeners per il drag (mouse e touch)
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

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

  if (!isVisible) return null;

  return (
    <div
      className={styles.whatsappSupport}
      style={{
        position: 'fixed',
        left: `${currentPosition.x}px`,
        top: `${currentPosition.y}px`,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', // Previene lo scroll durante il drag
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
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
