/* Frame: sign-in, navigation, header, desk (start page), leaderboard, instructor projector, footer */
(function () {
  const LT = window.LT, C = window.LT_CONFIG;
  const { esc, $, $$, el, toast } = LT.ui;
  const params = new URLSearchParams(location.search);
  const TEACHER = params.has("teacher");

  /* ---------------- Sign-in: name + Neptun code ---------------- */
  function join() {
    return new Promise(resolve => {
      const saved = LT.api.store.get("kl_join", null);
      const urlSession = (params.get("s") || "").trim().toUpperCase();
      if (TEACHER) { resolve({ session: urlSession || (saved && saved.session) || C.SESSION, team: null }); return; }
      if (saved && saved.team && saved.neptun && (!urlSession || urlSession === saved.session)) { resolve(saved); return; }
      const m = el(`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="jt">
        <div class="eyebrow" style="color:var(--brand-2);font-weight:800;font-size:.74rem;letter-spacing:.1em;text-transform:uppercase">${esc(C.COURSE)}</div>
        <h2 id="jt" style="margin-top:4px">Sign in to the Kestrel lab</h2>
        <p class="muted">Everybody works individually. Only your name appears on the leaderboard and the projector, never your Neptun code.</p>
        <div class="field"><label for="jn">Full name</label><input type="text" id="jn" maxlength="40" placeholder="e.g. Anna Kovács" value="${esc((saved && saved.team) || "")}" autocomplete="name"></div>
        <div class="field"><label for="jk">Neptun code</label><input type="text" id="jk" maxlength="6" placeholder="6 characters" value="${esc((saved && saved.neptun) || "")}" autocomplete="off" style="text-transform:uppercase;font-family:var(--mono)"></div>
        <details class="mini"><summary>Session code</summary><div class="field"><input type="text" id="js" value="${esc(urlSession || (saved && saved.session) || C.SESSION)}" autocomplete="off"><small>Change it only if your instructor tells you to.</small></div></details>
        <div class="btn-row"><button class="btn primary" id="jok">Sign in</button></div>
      </div></div>`);
      document.body.appendChild(m);
      const go = () => {
        const session = $("#js").value.trim().toUpperCase().replace(/\s+/g, "");
        const team = $("#jn").value.trim().replace(/\s+/g, " ");
        const neptun = $("#jk").value.trim().toUpperCase();
        if (team.length < 4 || !/\s/.test(team)) { toast("Please give your full name (first and last name).", "err"); return; }
        if (!/^[A-Z0-9]{6}$/.test(neptun)) { toast("The Neptun code has 6 letters and/or digits.", "err"); return; }
        if (!session) { toast("The session code is missing.", "err"); return; }
        const j = { session, team, neptun };
        LT.api.store.set("kl_join", j);
        m.remove(); resolve(j);
      };
      $("#jok").onclick = go;
      $("#jk").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      setTimeout(() => $("#jn").focus(), 50);
    });
  }

  /* ---------------- Header ---------------- */
  function header() {
    const chip = $(".team-chip");
    function render() {
      const st = LT.api.state, s = LT.api.status;
      const dot = s.mode === "online" ? "" : s.mode === "local" ? "helyi" : "off";
      const modeTxt = s.mode === "online" ? "live connection" : s.mode === "local" ? "local mode" : "offline" + (s.queued ? ` (${s.queued} queued)` : "");
      if (TEACHER) {
        chip.innerHTML = `<span class="chip"><span class="status-dot ${dot}"></span>${modeTxt}</span><span class="chip">Session: <b>${esc(LT.api.session)}</b></span>`;
        return;
      }
      const me = st && st.leaderboard ? st.leaderboard.find(r => r.team === LT.api.team) : null;
      chip.innerHTML = `<span class="chip" title="${esc(s.error || "")}"><span class="status-dot ${dot}"></span>${modeTxt}</span>
        <span class="chip">${esc(LT.api.team)}: <b>${me ? me.points : 0} pts</b>${me ? ` · #${me.rank}` : ""}</span>
        <button class="link-btn" id="signout">sign out</button>`;
      $("#signout").onclick = () => { if (confirm("Sign out? Your submissions are kept; sign in again with the same name and Neptun code.")) { LT.api.store.set("kl_join", { session: LT.api.session }); location.reload(); } };
    }
    LT.api.onState(render); LT.api.onStatus(render);
    let prev = null;
    LT.api.onState(st => {
      const me = st.leaderboard && st.leaderboard.find(r => r.team === LT.api.team);
      if (!me) return;
      if (prev !== null && me.points > prev) toast(`+${me.points - prev} points! Total: ${me.points}.`, "pont");
      prev = me.points;
    });
  }

  /* ---------------- Navigation ---------------- */
  const VIEWS = ["start", "a", "b", "leaderboard"];
  const inited = {};
  function route() {
    let v = (location.hash || "#start").slice(1);
    if (TEACHER) v = "teacher";
    if (!TEACHER && !VIEWS.includes(v)) v = "start";
    $$(".view").forEach(s => s.classList.toggle("active", s.id === "v-" + v));
    $$("nav.tabs a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + v));
    if (!inited[v]) {
      inited[v] = true;
      const root = $("#v-" + v);
      try {
        if (v === "start") desk(root);
        else if (v === "leaderboard") leaderboard(root);
        else if (v === "teacher") teacher(root);
        else LT.missions[v](root);
      } catch (e) {
        console.error(e);
        root.innerHTML = `<div class="note bad">Error while loading this view: ${esc(e.message)}</div>`;
      }
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- Desk (start page) ---------------- */
  const TASKS = {
    a: { n: 1, title: "Session A · Network design", q: "How many DCs should Kestrel run in 2030, and where?", method: "Forecasting ML · k-means · MILP · LLM as modeller",
      steps: [["Guess", "a_guess", "v"], ["Own", "a_own"], ["Forecast", "a_fc", "v"], ["k-means", "a_kq", "v"], ["AI", "a_ai"], ["Memo", "a_dec"]] },
    b: { n: 2, title: "Session B · Vehicle routing", q: "Which truck goes where on Friday morning?", method: "Travel-time ML · clustering · heuristics · AI-written code",
      steps: [["Guess", "b_guess", "v"], ["Own", "b_own"], ["ML", "b_tt", "v"], ["Cluster", "b_cq", "v"], ["AI code", "b_heur"], ["Memo", "b_dec"]] }
  };
  function desk(root) {
    const P = window.LT_POINTS;
    root.innerHTML = `
      <div class="desk-hero">
        <div class="eyebrow">Weeks 8–9 · Kestrel Home &amp; Garden Ltd. (fictional)</div>
        <h2>Network &amp; routing lab</h2>
        <p>Kestrel makes garden furniture, planters and tools in two plants (Szolnok and Zalaegerszeg) and supplies 20 regional hubs of garden-centre and DIY chains. Today everything goes through one big DC in Ecser, next to Budapest. In two 90-minute sessions you redesign the <b>network</b> for 2030 and then plan the <b>daily delivery routes</b>. On the way you will train machine-learning models, run an optimisation solver, and use AI in two advanced ways: as a <b>modeller</b> that talks to a solver, and as a <b>programmer</b> that writes heuristics you test and race against each other.</p>
      </div>

      <div class="section-title">Sessions</div>
      <div class="desk-grid" id="tiles" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))"></div>

      <div class="section-title">How it works</div>
      <details class="box"><summary><span class="ikon">⚙</span><span>The rhythm of every session<small>Guess, solve it yourself, learn the method, let the machine and the AI try, decide</small></span></summary><div class="tartalom">
        <ol class="tight">
          <li><b>Guess:</b> before calculating anything, you guess the result. A correct guess earns points.</li>
          <li><b>Your own solution:</b> you solve the problem by hand and submit it. The best solutions compete.</li>
          <li><b>Machine learning:</b> you train and test models on Kestrel's data and see how they change the plan.</li>
          <li><b>Algorithm:</b> the solver or the heuristics give the benchmark.</li>
          <li><b>AI:</b> not just “ask the chatbot”: the AI writes a formal model or working code, and the page tests it.</li>
          <li><b>Decision:</b> you write a short recommendation memo.</li>
        </ol>
        <div class="note info"><b>Important rule:</b> guesses and your own solution can be submitted <b>once</b>. The later steps open only afterwards, so your own thinking is not anchored to what the machine or the AI says.</div>
        <p>Every step has a <b>“Method”</b> box. Open it whenever you want the details: the model in mathematical form, how the algorithm works step by step, and what its limits are.</p>
      </div></details>
      <details class="box"><summary><span class="ikon">★</span><span>Points<small>Guesses, quizzes, contests, AI tasks</small></span></summary><div class="tartalom">
        <table><tbody>
          <tr><td>Correct guess</td><td class="n">+5</td></tr>
          <tr><td>Correct quiz answer</td><td class="n">+3</td></tr>
          <tr><td>Contest (by rank): own network, own routes, AI heuristic</td><td class="n">${P.RANK.join(" / ")} / ${P.RANK_REST}</td></tr>
          <tr><td>AI task with your own judgement</td><td class="n">+4</td></tr>
          <tr><td>Decision memo</td><td class="n">+2</td></tr>
        </tbody></table>
        <small>Contest points change live: if someone submits a better solution, you slide down.</small>
      </div></details>
      <details class="box"><summary><span class="ikon">✦</span><span>Using AI in this lab<small>Two patterns that go beyond chatting</small></span></summary><div class="tartalom">
        <p>You can use the university <b>Copilot</b>, or <b>Gemini</b>, <b>Claude</b> or <b>ChatGPT</b>; the buttons open them in a new tab. Kestrel and all its data are <b>fictional</b>, so pasting them is fine. Never paste real company or personal data.</p>
        <div class="prompt-magy">
          <div class="pm-sor"><span class="pm-resz">Session A</span><span><b>LLM as a modeller.</b> Language models are poor at optimisation arithmetic, but good at turning a messy business text into a precise specification. The AI translates the CEO's memo into a JSON constraint specification; the page validates it against a schema, passes it to a real MILP solver and checks every field. This is the pattern behind “function calling” and “tool use”.</span></div>
          <div class="pm-sor"><span class="pm-resz">Session B</span><span><b>LLM as a programmer.</b> The AI writes a routing heuristic as JavaScript code. Your browser runs it in a sandbox on two delivery days, scores it, and you send the results back to the AI to improve the code. This is a small version of “LLM-driven algorithm discovery” (research systems such as FunSearch or Evolution of Heuristics work like this at scale).</span></div>
        </div>
        <p>In both cases the AI output is an <b>input to be verified</b>, never the decision. The points go to your checking and your judgement.</p>
      </div></details>
      <details class="box"><summary><span class="ikon">i</span><span>Sign-in and technical notes<small>Connection, session, sign-out</small></span></summary><div class="tartalom">
        <ul class="tight">
          <li>Signed in as <b>${esc(LT.api.team || "")}</b>, session <b>${esc(LT.api.session)}</b>.</li>
          <li>The green dot in the header means a live connection. If it drops, your submissions are queued and sent automatically.</li>
          <li>Your work is stored in this browser. On another computer, sign in with the same name and Neptun code: your submitted results are kept.</li>
        </ul>
      </div></details>`;
    function tiles() {
      const my = LT.ui.my;
      $("#tiles", root).innerHTML = ["a", "b"].map(k => {
        const f = TASKS[k];
        return `<a class="tile" style="--c:var(--m${f.n})" href="#${k}">
          <div class="num">${esc(f.method)}</div>
          <h3>${esc(f.title)}</h3><p>${esc(f.q)}</p>
          <div class="allapot">${f.steps.map(([n, id, v]) => { const ok = v ? my.get("vote_" + id) : LT.ui.done(id); return `<span class="chk ${ok ? "on" : ""}">${ok ? "✓ " : ""}${n}</span>`; }).join("")}</div>
        </a>`;
      }).join("");
    }
    tiles();
    document.addEventListener("kl-change", tiles);
    LT.api.onState(tiles);
  }

  /* ---------------- Leaderboard ---------------- */
  function lbRows(list, me) {
    if (!list.length) return `<small>No points yet.</small>`;
    return list.map(r => {
      const per = { 1: 0, 2: 0 };
      Object.keys(r.detail || {}).forEach(a => { const k = LT.actMission(a); if (per[k] !== undefined) per[k] += r.detail[a]; });
      return `<div class="lb-row ${r.team === me ? "me" : ""}"><span class="medal ${r.rank <= 3 ? "m" + r.rank : ""}">${r.rank}</span>
        <div><div class="t">${esc(r.team)}</div><div class="br">${[1, 2].map(k => `${LT.MISSIONS[k].name}: ${per[k]}`).join(" · ")}</div></div>
        <div class="p">${r.points}</div></div>`;
    }).join("");
  }
  const f = () => LT.core.fmt;
  const BOARDS = [["a_own", "€k/yr", v => f().num(v, 1)], ["b_own", "€/day", v => f().num(v)], ["b_heur", "€/2 days", v => f().num(v)]];
  function leaderboard(root) {
    root.innerHTML = `
      <div class="mission-head mh-0"><div class="eyebrow">Live leaderboard</div><h2>Who is leading?</h2>
      <p>Refreshes every few seconds. In the contests the points depend on your rank, so a better submission moves everybody else's points too.</p></div>
      <div class="grid g2">
        <div class="card"><h3>Overall</h3><div id="lb"></div></div>
        <div>${BOARDS.map(b => `<div class="card"><h3>${esc(LT.ACT[b[0]].title)}</h3><div id="b-${b[0]}"></div></div>`).join("")}</div>
      </div>`;
    LT.api.onState(st => { $("#lb", root).innerHTML = lbRows(st.leaderboard || [], LT.api.team); });
    BOARDS.forEach(b => LT.ui.board($("#b-" + b[0], root), b[0], { unit: b[1], fmt: b[2] }));
  }

  /* ---------------- Instructor projector ---------------- */
  function teacher(root) {
    const link = location.origin + location.pathname + "?s=" + encodeURIComponent(LT.api.session);
    const voteIds = Object.keys(LT.ACT).filter(id => ["guess", "quiz"].includes(LT.ACT[id].type));
    root.innerHTML = `
      <div class="grid g2">
        <div class="card big-lb"><h2>Leaderboard</h2><div id="tlb"></div></div>
        <div>
          <div class="card join-box"><div class="muted">Sign in on the student computers:</div>
            <div class="code">${esc(LT.api.session)}</div>
            <div style="word-break:break-all"><a href="${esc(link)}" target="_blank">${esc(link)}</a></div>
            <div class="btn-row no-print"><button class="btn small" id="cpl">Copy link</button>
            <label class="btn small"><input type="checkbox" id="auto" style="margin:0"> auto-rotate panels</label></div>
          </div>
          <div class="card"><h3>Participants (<span id="tdb">0</span>)</h3><div id="tteams" class="pill-row"></div></div>
        </div>
      </div>
      <div class="card"><div class="btn-row" id="tsel"></div><div id="tbody"></div></div>`;
    $("#cpl", root).onclick = () => LT.ui.copy(link).then(() => toast("Link copied"));
    const panels = [
      { id: "contest", label: "Contests" },
      ...voteIds.map(id => ({ id, label: LT.ACT[id].title })),
      { id: "ai", label: "AI judgements" },
      { id: "code", label: "AI heuristics (code)" },
      { id: "dec", label: "Decision memos" }
    ];
    let cur = "contest";
    $("#tsel", root).innerHTML = panels.map(p => `<button class="btn small" data-p="${p.id}">${esc(p.label)}</button>`).join("");
    $$("#tsel button", root).forEach(b => b.onclick = () => { cur = b.dataset.p; render(LT.api.state); });
    let autoT = null;
    $("#auto", root).onchange = e => {
      clearInterval(autoT);
      if (e.target.checked) autoT = setInterval(() => { const i = panels.findIndex(p => p.id === cur); cur = panels[(i + 1) % panels.length].id; render(LT.api.state); }, 12000);
    };
    function results(st, act, unit, fv) {
      const list = (st.results && st.results[act]) || [];
      return `<h3>${esc(LT.ACT[act].title)}</h3>` + (list.length ? `<table><thead><tr><th>#</th><th>Participant</th><th class="n">${unit}</th><th>Solution</th><th class="n">Pts</th></tr></thead><tbody>${list.map(r =>
        `<tr><td><span class="medal ${r.rank <= 3 ? "m" + r.rank : ""}">${r.rank}</span></td><td>${esc(r.team)}</td><td class="n">${fv(r.value)}</td><td><small>${act === "b_heur" ? "code: see the “AI heuristics (code)” panel" : esc(String(r.text).split("\n")[0].slice(0, 120))}</small></td><td class="n">${r.points}</td></tr>`).join("")}</tbody></table>` : "<small>No submissions yet.</small>");
    }
    function textList(st, ids) {
      return ids.map(a => {
        const list = (st.texts && st.texts[a]) || [];
        return `<h3>${esc(LT.ACT[a].title)} (${list.length})</h3>` + (list.length ? list.map(t => {
          const [refl] = String(t.text).split(/\n\n--- The AI/);
          return `<div class="route" style="--c:var(--m${LT.ACT[a].m})"><b>${esc(t.team)}</b> ${t.option ? `<span class="tag">${esc(t.option)}</span>` : ""}<div>${esc(refl)}</div></div>`;
        }).join("") : "<small>No submissions yet.</small>");
      });
    }
    function render(st) {
      if (!st) return;
      $("#tlb", root).innerHTML = lbRows(st.leaderboard || [], null);
      $("#tdb", root).textContent = (st.teams || []).length;
      $("#tteams", root).innerHTML = (st.teams || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
      $$("#tsel button", root).forEach(b => b.classList.toggle("primary", b.dataset.p === cur));
      const body = $("#tbody", root);
      if (cur === "contest") {
        body.innerHTML = `<div class="grid g3">${BOARDS.map(b => `<div>${results(st, b[0], b[1], b[2])}</div>`).join("")}</div>`;
      } else if (LT.ACT[cur] && LT.ACT[cur].options) {
        const a = LT.ACT[cur], c = (st.votes && st.votes[cur]) || {};
        const max = Math.max(1, ...Object.values(c));
        body.innerHTML = `<h2>${esc(a.title)}</h2><p style="font-size:1.15rem">${a.question}</p><div class="bars">${a.options.map(o =>
          `<div class="bar ${a.right === o.id ? "right" : ""}"><span style="font-size:1.05rem">${o.label}</span><div class="track" style="height:28px"><div class="fill" style="width:${100 * (c[o.id] || 0) / max}%"></div></div><span class="cnt" style="font-size:1.1rem">${c[o.id] || 0}</span></div>`).join("")}</div>
          ${a.type === "quiz" ? `<details><summary>Right answer and explanation</summary><p>${a.explain}</p></details>` : `<small>Students see the right answer on their own screen after the calculation.</small>`}`;
      } else if (cur === "ai") {
        body.innerHTML = `<div class="grid g2e">${textList(st, ["a_ai", "b_ai"]).map(p => `<div class="routes">${p}</div>`).join("")}</div>`;
      } else if (cur === "code") {
        const list = (st.results && st.results.b_heur) || [];
        body.innerHTML = `<h2>AI-designed heuristics</h2><p>The best code of every participant (lower cost is better). Open one to discuss it with the class.</p>` + (list.length ? list.map(r =>
          `<details class="mini"><summary><b>#${r.rank} ${esc(r.team)}</b> · ${f().eur(r.value)} for two days</summary><pre class="prompt-box">${esc(r.text)}</pre></details>`).join("") : "<small>No submissions yet.</small>");
      } else if (cur === "dec") {
        body.innerHTML = `<div class="grid g2e">${textList(st, ["a_dec", "b_dec"]).map(p => `<div class="routes">${p}</div>`).join("")}</div>`;
      }
    }
    LT.api.onState(render);
  }

  /* ---------------- Footer ---------------- */
  function footer() {
    const fo = el(`<footer class="lab">
      <div><b>Instructor:</b> ${esc(C.INSTRUCTOR)} · ${esc(C.COURSE)}<br>${esc(C.INSTITUTION)}</div>
      <div class="ai-info"><b>Note on AI use:</b> this page was built with the help of AI tools (large language models), under the instructor's supervision, review and final approval. Kestrel Home &amp; Garden Ltd. and all its data are fictional and for teaching only.</div>
    </footer>`);
    document.body.insertBefore(fo, $(".toasts") || null);
  }

  /* ---------------- Boot ---------------- */
  async function boot() {
    if (TEACHER) document.body.classList.add("tanar");
    $(".logo small").textContent = `${C.COURSE} · Instructor: ${C.INSTRUCTOR}`;
    if (C.LOGO_URL) {
      const img = el(`<img class="logo-img" alt="MATE" src="${esc(C.LOGO_URL)}">`);
      img.onload = () => { const m = $(".logo-mark"); if (m) m.remove(); };
      img.onerror = () => img.remove();
      $(".logo").prepend(img);
    }
    footer();
    const j = await join();
    LT.api.start(j.session, j.team, TEACHER, j.neptun);
    header();
    if (TEACHER) $("nav.tabs").classList.add("hidden");
    window.addEventListener("hashchange", route);
    route();
  }
  LT.missions = LT.missions || {};
  document.addEventListener("DOMContentLoaded", boot);
})();
