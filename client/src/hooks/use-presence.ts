import { useEffect, useRef, useState, useCallback } from "react";

interface Viewer {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  lastSeen: number;
}

interface SSEEvent {
  type: string;
  viewers?: Viewer[];
  comment?: any;
  commentId?: number;
  assignment?: any;
}

export function usePresence(analysisId: number | undefined) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!analysisId) return;
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const es = new EventSource(`/api/analyses/${analysisId}/presence`);
      eventSourceRef.current = es;

      es.onopen = () => {
        reconnectAttemptRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);
          if (data.type === "presence" && data.viewers) {
            setViewers(data.viewers);
          } else {
            setEvents(prev => [data, ...prev].slice(0, 50));
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        if (!unmountedRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          reconnectAttemptRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        fetch(`/api/analyses/${analysisId}/presence/heartbeat`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
      }, 20000);
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [analysisId]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { viewers, events, clearEvents };
}
