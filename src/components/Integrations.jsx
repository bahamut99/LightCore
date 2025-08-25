import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Integrations.jsx — Connected Services card (self-contained)
 *
 * - No external CSS class collisions (inline-styled toggle).
 * - Works in two modes:
 *    1) Controlled (parent passes googleConnected, steps, isLoadingSteps, onToggleGoogle)
 *    2) Uncontrolled (component discovers connection, handles auth, and polls steps itself)
 * - Smart polling: 45s when actively changing, 3m otherwise, hourly safety tick,
 *   refresh on tab focus, and a midnight tick (5s after local midnight).
 */

export default function Integrations(props) {
  const {
    googleConnected: controlledConnected,
    steps: controlledSteps,
    isLoadingSteps: controlledLoading,
    onToggleGoogle, // function(nextBool)
  } = props;

  // Internal state (used only when props are not provided)
  const [connected, setConnected] = useState(false);
  const [steps, setSteps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // Are we controlled by parent?
  const usingControlled =
    typeof controlledConnected === "boolean" ||
    typeof controlledSteps === "number" ||
    typeof controlledLoading === "boolean" ||
    typeof onToggleGoogle === "function";

  // Derived view values
  const viewConnected = usingControlled ? controlledConnected : connected;
  const viewSteps =
    usingControlled && typeof controlledSteps === "number"
      ? controlledSteps
      : steps;
  const viewLoading = usingControlled ? !!controlledLoading : loading;

  // Helpers
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );
  const sessionRef = useRef(null);

  // Timers
  const activeTimer = useRef(null);
  const hourlyTimer = useRef(null);
  const midnightTimer = useRef(null);
  const dayTicker = useRef(null);
  const lastStepChangeAt = useRef(0);

  // -------- Uncontrolled mode: discover connection and kick off polling --------
  useEffect(() => {
    if (usingControlled) return;

    let cancelled = false;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      sessionRef.current = sessionData?.session || null;
      if (!sessionRef.current) {
        if (!cancelled) setConnected(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_integrations")
        .select("provider")
        .eq("provider", "google-health")
        .maybeSingle();

      if (!cancelled) {
        const isConnected = !!data && !error;
        setConnected(isConnected);
        if (isConnected) {
          fetchStepsNow();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingControlled]);

  // -------- Fetch steps with smart scheduling (uncontrolled only) --------
  async function fetchStepsNow(opts = {}) {
    if (usingControlled) return;
    if (!sessionRef.current) return;

    const token = sessionRef.current.access_token;
    const liveWindow = typeof opts.liveWindow === "number" ? opts.liveWindow : 10;

    setLoading(true);
    setErrMsg("");

    try {
      const res = await fetch(
        `/.netlify/functions/fetch-health-data?tz=${encodeURIComponent(
          tz
        )}&liveWindow=${liveWindow}`,
        { headers: { Authorization: `Bearer ${token}` } }
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
    if (usingControlled || !connected) return;

    // If steps changed within 5 minutes → poll sooner; else slower.
    const now = Date.now();
    const active = now - (lastStepChangeAt.current || 0) < 5 * 60 * 1000;
    const nextMs = active ? 45 * 1000 : 3 * 60 * 1000;

    if (activeTimer.current) clearTimeout(activeTimer.current);
    activeTimer.current = setTimeout(() => fetchStepsNow({ liveWindow: 10 }), nextMs);

    if (hourlyTimer.current) clearInterval(hourlyTimer.current);
    hourlyTimer.current = setInterval(() => fetchStepsNow({ liveWindow: 15 }), 60 * 60 * 1000);
  }

  function setupMidnightTick() {
    if (usingControlled) return;
    const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const next = new Date(localNow);
    next.setDate(localNow.getDate() + 1);
    next.setHours(0, 0, 5, 0); // fetch ~5s after midnight
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
      if (!document.hidden) fetchStepsNow({ liveWindow: 10 });
    };
    document.addEventListener("visibilitychange", onVis);
    setupVisibilityHandler._remover = onVis; // store remover
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

  // -------- Toggle handlers --------
  const handleToggle = async (e) => {
    const next = e.target.checked;

    if (usingControlled && typeof onToggleGoogle === "function") {
      onToggleGoogle(next);
      return;
    }

    // Uncontrolled internal flow:
    if (!sessionRef.current) {
      const { data: sessionData } = await supabase.auth.getSession();
      sessionRef.current = sessionData?.session || null;
      if (!sessionRef.current) return;
    }
    const token = sessionRef.current.access_token;

    if (next) {
      setErrMsg("");
      try {
        const start = await fetch("/.netlify/functions/google-auth", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await start.json();
        if (start.ok && json?.authUrl) {
          window.location.href = json.authUrl;
        } else {
          setErrMsg(json?.error || "Could not start Google authorization.");
        }
      } catch {
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
        });
        if (res.ok) {
          setConnected(false);
          setSteps(null);
        } else {
          const j = await res.json().catch(() => ({}));
          setErrMsg(j?.error || "Failed to disconnect.");
          setConnected(true); // keep it on if backend didn’t remove it
        }
      } catch {
        setErrMsg("Network error disconnecting.");
        setConnected(true);
      } finally {
        setLoading(false);
      }
    }
  };

  // -------- Inline-styled toggle (no class collisions) --------
  const Toggle = ({ checked, onChange }) => {
    const trackStyle = {
      width: 44,
      height: 24,
      borderRadius: 9999,
      background: checked ? "#22c55e" : "#334155",
      position: "relative",
      cursor: "pointer",
      transition: "background-color 150ms ease",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
    };
    const knobStyle = {
      position: "absolute",
      top: 3,
      left: checked ? 23 : 3,
      width: 18,
      height: 18,
      borderRadius: 9999,
      background: "#fff",
      transition: "left 150ms ease",
      boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
    };
    return (
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange({ target: { checked: !checked } })}
        style={trackStyle}
        title={checked ? "Disconnect Google Health" : "Connect Google Health"}
      >
        <span style={knobStyle} />
      </button>
    );
  };

  // -------- Render --------
  return (
    <div className="card">
      {/* Header */}
      <div className="card-header flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Connected Services</h3>
        <div className="flex items-center gap-3">
          <img
            src="https://www.gstatic.com/images/branding/product/2x/google_g_48dp.png"
            alt="Google"
            width="18"
            height="18"
            style={{ opacity: 0.9 }}
          />
          <span className="text-slate-200">Google Health</span>
          <Toggle checked={!!viewConnected} onChange={handleToggle} />
        </div>
      </div>

      {/* Body */}
      <div className="card-content mt-3">
        {!viewConnected ? (
          <p className="text-slate-400 text-sm">
            Connect to Google Health to show your daily steps.
          </p>
        ) : (
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-wide">Steps Today</div>
              <div className="text-slate-100 text-2xl font-bold">
                {viewLoading && viewSteps == null ? "…" : (viewSteps ?? 0).toLocaleString()}
              </div>
            </div>
            {viewLoading ? (
              <div className="text-slate-500 text-xs">Updating…</div>
            ) : (
              <div className="text-slate-500 text-xs">
                {errMsg ? <span className="text-amber-300">{errMsg}</span> : "Live (≈10 min window)"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
