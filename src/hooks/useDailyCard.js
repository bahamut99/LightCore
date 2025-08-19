// src/hooks/useDailyCard.js
import { useEffect, useState, useCallback } from 'react';

/**
 * Minimal state hook for showing the "daily card" after a log is created.
 * No JSX here (so .js is fine). UI lives in DailyCard.jsx.
 *
 * Usage:
 *   const { isOpen, card, open, close } = useDailyCard();
 *   // programmatic open: open(payload)
 *   // or dispatch a DOM event from anywhere:
 *   // window.dispatchEvent(new CustomEvent('dailyCard:show', { detail: payload }));
 */
export default function useDailyCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [card, setCard] = useState(null);

  const open = useCallback((payload) => {
    setCard(payload || null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    function onShow(evt) {
      open(evt?.detail || null);
    }
    window.addEventListener('dailyCard:show', onShow);
    return () => window.removeEventListener('dailyCard:show', onShow);
  }, [open]);

  return { isOpen, card, open, close };
}

