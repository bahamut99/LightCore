// src/hooks/useDailyCard.js
import { useCallback, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import DailyLogCard from '../components/DailyLogCard.jsx';

export default function useDailyCard() {
  const [entry, setEntry] = useState(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((row) => {
    if (!row) return;
    setEntry(row);
    setOpen(true);
  }, []);

  const showFromId = useCallback(async (id) => {
    if (!id) return;
    const { data, error } = await supabase
      .from('daily_logs')
      .select(
        'id, created_at, clarity_score, immune_score, physical_readiness_score, tags, ai_notes'
      )
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      setEntry(data);
      setOpen(true);
    }
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const Card = useMemo(
    () => (props) =>
      <DailyLogCard entry={open ? entry : null} onClose={hide} {...props} />,
    [open, entry, hide]
  );

  return { show, showFromId, hide, Card, isOpen: open, entry };
}
