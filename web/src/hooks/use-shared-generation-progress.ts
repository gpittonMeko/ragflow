import type { IAnswer } from '@/interfaces/database/chat';
import { useEffect, useMemo, useRef, useState } from 'react';

export type StreamingAnswer = IAnswer & { running_status?: boolean };

const PROGRESS_CAP = 88;

/**
 * Progress bar for shared / embed chat: combines SSE milestones (reference chunks,
 * streamed answer length, running_status) with a slow asymptotic creep so the bar
 * never looks stuck, without relying on a long fake linear timer.
 */
export function useSharedGenerationProgress(
  sendLoading: boolean,
  isGenerating: boolean,
  answer: StreamingAnswer,
  callbacks?: { onBusyStart?: () => void; onBusyEnd?: () => void },
) {
  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
  const floorRef = useRef(0);
  const wasBusyRef = useRef(false);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const busy = sendLoading || isGenerating;

  const phaseLabel = useMemo(() => {
    if (!barVisible) return '';
    const chunks = answer?.reference?.chunks?.length ?? 0;
    const textLen = answer?.answer?.trim()?.length ?? 0;
    if (progress >= 88) return 'Completamento';
    if (textLen > 0) return 'Generazione della risposta';
    if (chunks > 0) return 'Preparazione della risposta dagli atti recuperati';
    if (progress < 14) return 'Connessione al servizio';
    return 'Recupero delle fonti dalla knowledge base';
  }, [answer, progress, barVisible]);

  useEffect(() => {
    if (busy) {
      if (!wasBusyRef.current) {
        floorRef.current = 8;
        setProgress(8);
        setBarVisible(true);
        cbRef.current?.onBusyStart?.();
      }
      wasBusyRef.current = true;
    } else {
      if (wasBusyRef.current) {
        cbRef.current?.onBusyEnd?.();
        setProgress(100);
        const t1 = window.setTimeout(() => setBarVisible(false), 650);
        const t2 = window.setTimeout(() => {
          setProgress(0);
          floorRef.current = 0;
        }, 1200);
        wasBusyRef.current = false;
        return () => {
          window.clearTimeout(t1);
          window.clearTimeout(t2);
        };
      }
      wasBusyRef.current = false;
    }
    return undefined;
  }, [busy]);

  useEffect(() => {
    if (!busy) return;
    const chunks = answer?.reference?.chunks?.length ?? 0;
    const textLen = answer?.answer?.trim()?.length ?? 0;
    let floor = floorRef.current;
    if (isGenerating) floor = Math.max(floor, 14);
    if (chunks > 0) floor = Math.max(floor, 32);
    if (textLen > 0) floor = Math.max(floor, 48);
    if (textLen > 120) floor = Math.max(floor, 58);
    if (textLen > 500) floor = Math.max(floor, 72);
    if (textLen > 2000) floor = Math.max(floor, 80);
    floorRef.current = floor;
  }, [answer, busy, isGenerating]);

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const floor = floorRef.current;
        if (p >= PROGRESS_CAP) return PROGRESS_CAP;
        if (p < floor) return Math.min(floor, p + 6);
        const headroom = PROGRESS_CAP - p;
        const increment = Math.max(0.12, headroom * 0.022);
        return Math.min(PROGRESS_CAP, p + increment);
      });
    }, 110);
    return () => window.clearInterval(id);
  }, [busy]);

  return { progress, barVisible, phaseLabel };
}
