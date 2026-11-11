/* Connection to the live aggregator (Apps Script), or local mode if there is no URL
   or the connection drops. Submissions are queued and retried later. */
(function () {
  const LT = (window.LT = window.LT || {});
  const C = window.LT_CONFIG;
  const listeners = [], statusListeners = [];
  let state = null, session = null, team = null, neptun = null, timer = null;
  const status = { mode: C.API_URL ? "online" : "local", queued: 0, last: null, error: null };

  const clientId = (() => {
    try {
      let c = localStorage.getItem("kl_client");
      if (!c) { c = Math.random().toString(36).slice(2, 10); localStorage.setItem("kl_client", c); }
      return c;
    } catch (e) { return "anon"; }
  })();

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: not critical */ } }
  };
  const localKey = () => "kl_events_" + session;
  const queueKey = () => "kl_queue_" + session;

  function setStatus(p) {
    Object.assign(status, p);
    statusListeners.forEach(f => { try { f(status); } catch (e) { console.error(e); } });
  }
  function emit(st) {
    if (!st || st.ok === false) return;
    state = st;
    listeners.forEach(f => { try { f(state); } catch (e) { console.error(e); } });
  }
  function localState() { return Object.assign(window.ltAggregate(store.get(localKey(), [])), { session, local: true }); }

  async function fetchState() {
    if (!session) return;
    if (!C.API_URL) { emit(localState()); setStatus({ last: Date.now() }); return; }
    try {
      const r = await fetch(C.API_URL + "?action=state&session=" + encodeURIComponent(session) + "&_=" + Date.now());
      const j = await r.json();
      if (j.ok === false) throw new Error(j.error || "error");
      emit(j);
      setStatus({ mode: "online", last: Date.now(), error: null });
      flushQueue();
    } catch (e) {
      setStatus({ mode: "offline", error: String(e.message || e) });
    }
  }

  async function post(ev) {
    const r = await fetch(C.API_URL, { method: "POST", body: JSON.stringify({ action: "submit", event: ev }) });
    const j = await r.json();
    if (j.ok === false) throw new Error(j.error || "error");
    return j;
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !C.API_URL) return;
    const q = store.get(queueKey(), []);
    if (!q.length) return;
    flushing = true;
    try {
      while (q.length) {
        const j = await post(q[0]);
        q.shift(); store.set(queueKey(), q);
        emit(j);
      }
    } catch (e) { /* next time */ }
    flushing = false;
    setStatus({ queued: store.get(queueKey(), []).length });
  }

  async function submit(ev) {
    setTimeout(() => document.dispatchEvent(new Event("kl-change")), 0);
    const full = Object.assign({ session, team, client: neptun || clientId, ts: Date.now() }, ev);
    if (!C.API_URL) {
      const all = store.get(localKey(), []);
      all.push(full); store.set(localKey(), all);
      emit(localState());
      return { ok: true, local: true };
    }
    try {
      const j = await post(full);
      emit(j);
      setStatus({ mode: "online", last: Date.now(), error: null });
      return { ok: true };
    } catch (e) {
      const q = store.get(queueKey(), []); q.push(full); store.set(queueKey(), q);
      setStatus({ mode: "offline", queued: q.length, error: String(e.message || e) });
      return { ok: false, queued: true };
    }
  }

  function start(sess, tm, isTeacher, np) {
    session = sess; team = tm; neptun = np || null;
    setStatus({ queued: store.get(queueKey(), []).length });
    if (timer) clearInterval(timer);
    fetchState();
    timer = setInterval(() => { if (!document.hidden) fetchState(); }, isTeacher ? C.POLL_TEACHER : C.POLL_STUDENT);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchState(); });
    // In local mode other tabs (e.g. the instructor view on the same computer) see changes too
    window.addEventListener("storage", ev => { if (!C.API_URL && ev.key === localKey()) emit(localState()); });
  }

  LT.api = {
    start, submit, refresh: fetchState, store, clientId,
    onState(f) { listeners.push(f); if (state) f(state); },
    onStatus(f) { statusListeners.push(f); f(status); },
    get state() { return state; },
    get status() { return status; },
    get session() { return session; },
    get team() { return team; },
    get neptun() { return neptun; }
  };
})();
