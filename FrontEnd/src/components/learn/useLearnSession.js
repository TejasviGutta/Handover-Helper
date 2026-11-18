import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";

export default function useLearnSession() {
  const [session, setSession] = useState({ checking: true, user: null, error: false });
  useEffect(() => {
    let active = true;
    let revision = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      revision += 1;
      if (active) setSession({ checking: false, user: next?.user ?? null, error: false });
    });
    const initialRevision = revision;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && revision === initialRevision) {
        setSession({ checking: false, user: error ? null : data.session?.user ?? null, error: Boolean(error) });
      }
    }).catch(() => {
      if (active && revision === initialRevision) setSession({ checking: false, user: null, error: true });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return session;
}
