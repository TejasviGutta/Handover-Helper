import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

// Escape % and _ so an email is matched exactly by ilike.
const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

// Looks up the signed-in user, their role, and whether they are the
// departing employee on any handover.
// status: "loading" | "signed-out" | "ready"
export function useRole() {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    role: null,
    isDeparting: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (!user) {
        if (!cancelled) {
          setState({
            status: "signed-out",
            user: null,
            role: null,
            isDeparting: false,
          });
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, email, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const role = profile?.role ?? null;

      // Departing employee check: does their email (or name) appear as
      // `departing_employee` on any handover? If RLS hides the rows, this
      // simply returns nothing and access stays closed.
      let isDeparting = false;
      const names = [profile?.email ?? user.email, profile?.full_name].filter(
        Boolean,
      );
      for (const name of names) {
        const { data: rows } = await supabase
          .from("handovers")
          .select("id")
          .ilike("departing_employee", escapeLike(name.trim()))
          .limit(1);
        if (rows && rows.length > 0) {
          isDeparting = true;
          break;
        }
      }

      if (!cancelled) setState({ status: "ready", user, role, isDeparting });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
