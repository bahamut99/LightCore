import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Connected Services (extensible)
 * - Header + divider, then single provider row (Google Health + toggle).
 * - Near-live steps with smart polling (20s active / 60s idle), midnight rollover, focus refresh.
 * - Toggle animates before redirect to Google.
 * - Uses scoped CSS classes (lc-gh-*) already in style.css.
 */

export default function Integrations() {
  // connection + data
  const [connected, setConnected] = useState(false);
  const [steps, setSteps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // toggle UX (let animation show before redirect)
  const [pendingAuth, setPendingAuth] = useState(false);

  // session + timers
  const sessionRef = useRef(null);
  const lastStepChangeAt = useRef(0);
  const activeTimer = useRef(null);
  const hourlyTimer = useRef(null);
  const midnightTimer = useRef(null);
  const dayTicker = useRef(null);

  // user timezone for backend
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );

  // -------- init: check connection, start polling --------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      sessionRef.current = sessionData?.session || null;
      if (!sessionRef.current) {
        if (!cancelled) {
          setConnected(false);
          setSteps(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("user_integrations")
        .select("provider")
        .eq("provider", "google-health")
        .maybeSingle();

      const isConnected = !!data && !error;
      if (!cancelled) {
        setConnected(isConnected);
        if (isConnected) {
          fetchStepsNow({ liveWindow: 10 });
          setupMidnightTick();
          setupVisibilityHandler();
        }
      }
    })();

    return () => {
      cancelled = true;
      clearAllTimers();
      removeVisibilityHandler();
    };
  }, []);

  // -------- fetching + scheduling --------
  async function fetchStepsNow(opts = {}) {
    if (!sessionRef.current) return;

    const token = sessionRef.current.access_token;
    const liveWindow = typeof opts.liveWindow === "number" ? opts.liveWindow : 10;

    setLoading(true);
    setErrMsg("");

    try {
      const res = await fetch(
        `/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(
          tz
        )}&liveWindow=${liveWindow}&_=${Date.now()}`, // cache buster
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      const json = await res.json();

      if (res.ok && typeof json.steps === "number") {
        setSteps((prev) => {
          if (prev !== json.steps) lastStepChangeAt.current = Date.now();
          return json.steps;
        });
      } else if (!res.ok && (res.status === 404 || json?.error === "Google Health not connected")) {
        setConnected(false);
        clearAllTimers();
      } else {
        setErrMsg(json?.error || "Failed to fetch steps.");
      }
    } catch {
      setErrMsg("Network error getting steps.");
    } finally {
      setLoading(false);
      scheduleNextPoll();
    }
  }

  function scheduleNextPoll() {
    if (!connected) return;

    // Faster cadence: 20s when steps changed in last 5 min, else 60s
    const now = Date.now();
    const active = now - (lastStepChangeAt.current || 0) < 5 * 60 * 1000;
    const nextMs = active ? 20 * 1000 : 60 * 1000;

    if (activeTimer.current) clearTimeout(activeTimer.current);
    activeTimer.current = setTimeout(() => fetchStepsNow({ liveWindow: 10 }), nextMs);

    // Hourly safety net
    if (hourlyTimer.current) clearInterval(hourlyTimer.current);
    hourlyTimer.current = setInterval(() => fetchStepsNow({ liveWindow: 15 }), 60 * 60 * 1000);
  }

  function setupMidnightTick() {
    const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const next = new Date(localNow);
    next.setDate(localNow.getDate() + 1);
    next.setHours(0, 0, 5, 0); // ~5s after midnight local
    const msToNext = Math.max(1000, next - localNow);

    if (midnightTimer.current) clearTimeout(midnightTimer.current);
    midnightTimer.current = setTimeout(() => {
      fetchStepsNow({ liveWindow: 10 });
      if (dayTicker.current) clearInterval(dayTicker.current);
      dayTicker.current = setInterval(() => fetchStepsNow({ liveWindow: 10 }), 24 * 60 * 60 * 1000);
    }, msToNext);
  }

  function setupVisibilityHandler() {
    const onVis = () => {
      if (!document.hidden) fetchStepsNow({ liveWindow: 10 }); // instant refresh on focus
    };
    document.addEventListener("visibilitychange", onVis);
    setupVisibilityHandler._remover = onVis;
  }
  function removeVisibilityHandler() {
    const onVis = setupVisibilityHandler._remover;
    if (onVis) document.removeEventListener("visibilitychange", onVis);
  }
  function clearAllTimers() {
    if (activeTimer.current) clearTimeout(activeTimer.current);
    if (hourlyTimer.current) clearInterval(hourlyTimer.current);
    if (midnightTimer.current) clearTimeout(midnightTimer.current);
    if (dayTicker.current) clearInterval(dayTicker.current);
    activeTimer.current = hourlyTimer.current = midnightTimer.current = dayTicker.current = null;
  }

  // -------- toggle handlers --------
  const handleToggle = async (checked) => {
    if (!sessionRef.current) {
      const { data: sessionData } = await supabase.auth.getSession();
      sessionRef.current = sessionData?.session || null;
      if (!sessionRef.current) return;
    }
    const token = sessionRef.current.access_token;

    if (checked) {
      setPendingAuth(true);
      setErrMsg("");
      try {
        const start = await fetch("/.netlify/functions/google-auth", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await start.json();
        if (start.ok && json?.authUrl) {
          setTimeout(() => window.location.assign(json.authUrl), 150);
        } else {
          setPendingAuth(false);
          setErrMsg(json?.error || "Could not start Google authorization.");
        }
      } catch {
        setPendingAuth(false);
        setErrMsg("Network error starting Google authorization.");
      }
    } else {
      clearAllTimers();
      setLoading(true);
      setErrMsg("");
      try {
        const res = await fetch("/.netlify/functions/delete-integration", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ provider: "google-health" }),
          cache: "no-store",
        });
        if (res.ok) {
          setConnected(false);
          setSteps(null);
        } else {
          const j = await res.json().catch(() => ({}));
          setErrMsg(j?.error || "Failed to disconnect.");
        }
      } catch {
        setErrMsg("Network error disconnecting.");
      } finally {
        setLoading(false);
        setPendingAuth(false);
      }
    }
  };

  // -------- UI elements --------
  const Toggle = ({ checked, onChange, disabled }) => (
    <button
      type="button"
      className={`lc-gh-toggle ${checked ? "on" : ""}`}
      aria-pressed={checked}
      aria-disabled={disabled ? "true" : undefined}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="lc-gh-knob" />
    </button>
  );

  const GoogleGlyph = () => (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18" style={{ display: "block" }}>
      <path fill="#EA4335" d="M24 9.5c3.94 0 7.5 1.52 10.24 4l6.82-6.82C36.94 2.23 30.77 0 24 0 14.62 0 6.62 5.38 2.9 13.14l7.9 6.14C12.6 13.3 17.86 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24c0-1.56-.14-3.06-.41-4.5H24v9h12.7c-.55 2.98-2.24 5.5-4.77 7.19l7.3 5.66C43.93 37.78 46.5 31.3 46.5 24z"/>
      <path fill="#FBBC05" d="M10.8 27.28A14.47 14.47 0 0 1 10 24c0-1.14.19-2.24.52-3.28l-7.9-6.14A23.88 23.88 0 0 0 0 24c0 3.86.9 7.5 2.52 10.72l8.28-7.44z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.89-5.83l-7.3-5.66c-2.05 1.38-4.67 2.19-8.59 2.19-6.14 0-11.4-3.8-13.2-9.78l-7.9 6.14C6.62 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );

  const checked = pendingAuth ? true : !!connected;

  return (
    <div className="card">
      {/* Header + divider */}
      <div className="lc-gh-header">
        <h3 className="lc-gh-title">Connected Services</h3>
      </div>
      <hr />

      {/* Provider row */}
      <div className="lc-gh-right" style={{ marginTop: 10, marginBottom: 6 }}>
        <GoogleGlyph />
        <span className="lc-gh-label">Google Health</span>
        <div style={{ marginLeft: "auto" }}>
          <Toggle
            checked={checked}
            disabled={loading}
            onChange={(next) => handleToggle(next)}
          />
        </div>
      </div>

      {/* Steps block (no extra text) */}
      {connected && (
        <div className="lc-gh-body">
          <div className="lc-gh-rows">
            <div>
              <div className="lc-gh-subtle">STEPS TODAY</div>
              <div className="lc-gh-number">
                {loading && steps == null ? "…" : (steps ?? 0).toLocaleString()}
              </div>
            </div>
            {errMsg ? <div className="lc-gh-hint lc-gh-warn">{errMsg}</div> : <div />}
          </div>
        </div>
      )}
    </div>
  );
}
