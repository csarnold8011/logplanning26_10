/* Shared UI elements: votes, contest boards, AI cards, one-time submissions,
   gates (locking), method boxes and small chart helpers */
(function () {
  const LT = (window.LT = window.LT || {});
  const C = window.LT_CONFIG;
  const fmt = () => LT.core.fmt;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function toast(msg, type) {
    let box = $(".toasts");
    if (!box) { box = el('<div class="toasts" aria-live="polite"></div>'); document.body.appendChild(box); }
    const t = el(`<div class="toast ${type || ""}">${esc(msg)}</div>`);
    box.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  // The student's own store, bound to the session and the Neptun code
  const my = {
    key: k => "kl_my_" + LT.api.session + "_" + (LT.api.neptun || LT.api.team) + "_" + k,
    get(k, d) { return LT.api.store.get(my.key(k), d); },
    set(k, v) { LT.api.store.set(my.key(k), v); changed(); },
    put(k, v) { LT.api.store.set(my.key(k), v); } // without the change event
  };
  function changed() { setTimeout(() => document.dispatchEvent(new Event("kl-change")), 0); }

  // Has the student already submitted this activity? (local flag OR the server says so)
  function done(id) {
    if (my.get("done_" + id)) return true;
    const st = LT.api.state;
    if (st && st.results && st.results[id] && st.results[id].some(r => r.team === LT.api.team)) return true;
    if (st && st.texts && st.texts[id] && st.texts[id].some(r => r.team === LT.api.team)) return true;
    return false;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = el("<textarea></textarea>"); ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
      ta.remove(); return ok;
    }
  }

  async function submit(ev, okMsg) {
    const r = await LT.api.submit(ev);
    if (r.ok) toast(okMsg || "Submitted");
    else if (r.queued) toast("No connection: your submission is queued and will be sent automatically.", "err");
    changed();
    return r;
  }

  /* ---------------- Gate: a block opens only when its conditions are met ----------------
     conds: [{ ok: () => bool, text: "Submit your guess first." }]                          */
  function gate(block, conds, onOpen) {
    const msg = el(`<div class="zar-uzenet" role="status"></div>`);
    block.prepend(msg);
    let open = null;
    function refresh() {
      const missing = conds.filter(f => !f.ok());
      const now = missing.length === 0;
      block.classList.toggle("zarolt", !now);
      msg.innerHTML = now ? "" : `<span class="lakat" aria-hidden="true">🔒</span><div><b>This step is still locked.</b><br>${missing.map(f => esc(f.text)).join("<br>")}</div>`;
      msg.classList.toggle("hidden", now);
      block.querySelectorAll("button, textarea, input, select, a.ai-link").forEach(x => {
        if (x.closest(".zar-uzenet")) return;
        if (!now) { if (!x.dataset.lockWas) x.dataset.lockWas = x.disabled ? "1" : "0"; x.disabled = true; x.setAttribute("tabindex", "-1"); }
        else if (x.dataset.lockWas !== undefined) { x.disabled = x.dataset.lockWas === "1"; delete x.dataset.lockWas; x.removeAttribute("tabindex"); }
      });
      if (now && open === false && onOpen) onOpen();
      open = now;
    }
    document.addEventListener("kl-change", refresh);
    LT.api.onState(refresh);
    refresh();
    return refresh;
  }

  /* ---------------- Vote / guess / quiz ----------------
     Every mode can be submitted once.
     mode: "guess"   – the right answer is revealed later (reveal), points only then
           "quiz"    – instant feedback and points
           "opinion" – no right answer, only the distribution                      */
  function vote(container, cfg) {
    const id = cfg.id;
    const root = el(`<div class="vote" data-vote="${esc(id)}"></div>`);
    container.appendChild(root);
    let sel = new Set((my.get("vote_" + id) || "").split("|").filter(Boolean));
    let revealed = my.get("rev_" + id) || null;

    function render() {
      const st = LT.api.state;
      const counts = (st && st.votes && st.votes[id]) || {};
      const total = Object.values(counts).reduce((s, v) => s + v, 0);
      const voted = !!my.get("vote_" + id);
      const right = cfg.mode === "quiz" ? cfg.right : revealed ? revealed.right : null;
      root.innerHTML = `
        <p class="kerdes">${cfg.question}</p>
        <div class="vote-opts">${cfg.options.map(o => {
          let c = sel.has(o.id) ? "sel" : "";
          if (right !== null && right !== undefined && voted) { if (o.id === right) c += " right"; else if (sel.has(o.id)) c += " wrong"; }
          return `<button class="vote-opt ${c}" data-o="${esc(o.id)}" ${voted ? "disabled" : ""}>${o.label}${o.sub ? `<br><small>${o.sub}</small>` : ""}</button>`;
        }).join("")}</div>
        ${!voted ? `<div class="btn-row"><button class="btn primary" data-send ${sel.size !== 1 ? "disabled" : ""}>${cfg.mode === "quiz" ? "Lock in my answer" : cfg.mode === "guess" ? "Lock in my guess" : "Lock in my choice"}</button><small>Cannot be changed after submission.</small></div>` : ""}
        <div class="vote-res"></div>`;
      const res = $(".vote-res", root);
      if (voted) {
        let h = "";
        if (cfg.mode === "guess" && !revealed) h += `<div class="note info"><b>Guess locked in.</b> You will see the right answer after the calculation in a later step.</div>`;
        if (right !== null && right !== undefined && cfg.mode !== "opinion") {
          const ok = sel.has(right);
          h += `<div class="note ${ok ? "ok" : "bad"}"><b>${ok ? "Correct! +" + (cfg.points || 0) + " points." : "Not this time."}</b> ${cfg.explain ? (typeof cfg.explain === "function" ? cfg.explain() : cfg.explain) : ""}</div>`;
        }
        const max = Math.max(1, ...Object.values(counts));
        h += `<details class="mini" ${cfg.mode === "opinion" ? "open" : ""}><summary>How did the group vote? (${total})</summary><div class="bars">${cfg.options.map(o => {
          const n = counts[o.id] || 0;
          const cls = (sel.has(o.id) ? "mine " : "") + (right === o.id ? "right" : "");
          return `<div class="bar ${cls}"><span>${o.label.replace(/<[^>]+>/g, "")}</span><div class="track"><div class="fill" style="width:${100 * n / max}%"></div></div><span class="cnt">${n}</span></div>`;
        }).join("")}</div><small>The gold bar is your choice.</small></details>`;
        res.innerHTML = h;
      } else {
        $$(".vote-opt", root).forEach(b => b.onclick = () => { sel = new Set([b.dataset.o]); render(); });
        const sb = $("[data-send]", root);
        if (sb) sb.onclick = send;
      }
    }

    async function send() {
      if (my.get("vote_" + id)) return;
      const option = [...sel].join("|");
      const pts = cfg.mode === "quiz" ? (sel.has(cfg.right) ? cfg.points || 0 : 0) : 0;
      my.set("vote_" + id, option);
      my.set("done_" + id, true);
      render();
      await submit({ activity: id, kind: "vote", option, points: pts }, cfg.mode === "quiz" ? (pts ? `Correct: +${pts} points` : "Answer recorded") : cfg.mode === "guess" ? "Guess recorded" : "Choice recorded");
    }

    LT.api.onState(render);
    render();
    return {
      async reveal(right) {
        if (revealed) { render(); return revealed; }
        const v = my.get("vote_" + id);
        revealed = { right, time: Date.now() };
        my.put("rev_" + id, revealed);
        render();
        if (v) {
          const pts = v.split("|").includes(right) ? cfg.points || 0 : 0;
          await submit({ activity: id + "_eval", kind: "bonus", points: pts }, pts ? `Your guess was right: +${pts} points` : "Your guess missed, but now you can see why.");
        }
        changed();
        return revealed;
      },
      get voted() { return !!my.get("vote_" + id); }
    };
  }
  const voted = id => () => !!my.get("vote_" + id);

  /* ---------------- Contest board for one activity ---------------- */
  function board(container, activity, opts) {
    opts = opts || {};
    const root = el(`<div class="board"></div>`);
    container.appendChild(root);
    function render(st) {
      const list = (st && st.results && st.results[activity]) || [];
      if (!list.length) { root.innerHTML = `<small>No results submitted yet.</small>`; return; }
      const me = LT.api.team;
      const top = list.slice(0, opts.max || 8);
      const mine = list.find(r => r.team === me);
      if (mine && !top.includes(mine)) top.push(mine);
      root.innerHTML = `<table><thead><tr><th>#</th><th>Participant</th><th class="n">${esc(opts.unit || "Result")}</th><th class="n">Points</th></tr></thead><tbody>${top.map(r =>
        `<tr class="${r.team === me ? "me" : ""}"><td><span class="medal ${r.rank <= 3 ? "m" + r.rank : ""}">${r.rank}</span></td><td>${esc(r.team)}${opts.detail && r.text ? `<br><small>${esc(r.text)}</small>` : ""}</td><td class="n">${opts.fmt ? opts.fmt(r.value) : r.value}</td><td class="n">${r.points}</td></tr>`
      ).join("")}</tbody></table><small>${list.length} participant(s) submitted. Points depend on your rank and change live.</small>`;
    }
    LT.api.onState(render);
    return root;
  }

  /* ---------------- One-time text submission (decision memo) ---------------- */
  function textBox(container, cfg) {
    const id = cfg.id;
    const root = el(`<div class="szoveg-bekuldes"></div>`);
    container.appendChild(root);
    function render() {
      const isDone = done(id);
      const txt = my.get("text_" + id, "");
      root.innerHTML = isDone
        ? `<div class="fact-text">${esc(txt || "(submitted)")}</div><div class="btn-row"><span class="done-mark">✓ Submitted (final).</span></div>`
        : `<textarea data-t placeholder="${esc(cfg.placeholder || "")}" style="min-height:${cfg.height || 110}px">${esc(txt)}</textarea>
           <div class="btn-row"><button class="btn accent" data-s>${esc(cfg.button || "Submit")}</button><small>${cfg.points ? "+" + cfg.points + " points. " : ""}Cannot be changed after submission.</small><span class="muted" data-n></span></div>`;
      if (isDone) return;
      const ta = $("[data-t]", root);
      const n = () => { const w = (ta.value.trim().match(/\S+/g) || []).length; $("[data-n]", root).textContent = w + " words"; };
      ta.addEventListener("input", () => { my.put("text_" + id, ta.value); n(); });
      n();
      $("[data-s]", root).onclick = async () => {
        const t = ta.value.trim(), w = (t.match(/\S+/g) || []).length;
        if (w < (cfg.minWords || 15)) { toast(`Please write at least ${cfg.minWords || 15} words.`, "err"); return; }
        if (!confirm("Submit now? It cannot be changed afterwards.")) return;
        my.set("text_" + id, t);
        my.set("done_" + id, true);
        render();
        await submit({ activity: id, kind: "text", text: t, points: cfg.points || 0, option: cfg.option ? cfg.option() : "" }, cfg.okMsg || "Submitted");
      };
    }
    render();
    document.addEventListener("kl-change", () => { if (done(id) && root.querySelector("[data-t]")) render(); });
  }

  /* ---------------- AI card ----------------
     The student copies the prompt into an AI assistant of their choice, pastes the answer back,
     the page checks it, then the student submits a short professional judgement.            */
  function aiCard(container, cfg) {
    const id = cfg.id;
    const root = el(`<div class="card ai-card"></div>`);
    container.appendChild(root);
    const steps = cfg.steps || [
      ["Copy the prompt.", "The button fills it with the current data."],
      ["Paste it", "into the AI of your choice, then paste the full answer back here."],
      ["Check it:", "the page validates and recomputes what the AI claims."],
      ["Judge it:", "what did it get right, what did it get wrong, would you accept it?"]
    ];
    root.innerHTML = `
      <div class="step"><span class="step-badge ai">${esc(cfg.badge || "AI challenge")}</span><h3>${cfg.title}</h3><span class="pts">+${cfg.points || 4} points for your judgement</span></div>
      ${cfg.intro ? `<p>${cfg.intro}</p>` : ""}
      <div class="lepes-sor">${steps.map((s, i) => `<div class="lepes"><span class="sz">${i + 1}</span><div><b>${s[0]}</b> ${s[1]}</div></div>`).join("")}</div>
      <div class="btn-row">
        <button class="btn ai" data-copy>Copy prompt</button>
        ${(C.AI_LINKS || []).map(l => `<a class="btn small ai-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join("")}
      </div>
      <details class="mini" data-pdet><summary>Show the prompt</summary><div class="prompt-box" data-prompt></div></details>
      ${cfg.why ? `<details class="mini"><summary>Why is the prompt written this way?</summary><div class="prompt-magy">${cfg.why.map(m => `<div class="pm-sor"><span class="pm-resz">${esc(m[0])}</span><span>${m[1]}</span></div>`).join("")}</div></details>` : ""}
      <div class="field" style="margin-top:12px"><label>${esc(cfg.answerLabel || "The AI's answer")}</label>
        <textarea data-ans placeholder="Paste the AI's complete answer here…" style="min-height:${cfg.answerHeight || 120}px"></textarea></div>
      <div class="btn-row"><button class="btn primary" data-check>${esc(cfg.checkLabel || "Check")}</button></div>
      <div data-eval></div>
      <div data-extra></div>
      <div data-refl class="hidden">
        <div class="field"><label>Your professional judgement <span class="hint">(at least 2 sentences: what was right, what was wrong, would you accept it?)</span></label>
          <div class="btn-row" style="margin:0 0 6px"><label class="hint" for="ai-src-${esc(id)}">Which AI did you use?</label>
            <select id="ai-src-${esc(id)}" data-src style="width:auto">${(C.AI_LINKS || []).map(l => `<option>${esc(l.name)}</option>`).join("")}<option>Other</option></select></div>
          <textarea data-reflt style="min-height:90px"></textarea></div>
        <div class="btn-row"><button class="btn accent" data-send>Submit judgement</button><small>Cannot be changed after submission.</small></div>
      </div>
      <div data-done></div>`;
    const ans = $("[data-ans]", root), evalBox = $("[data-eval]", root);
    ans.value = my.get("ai_" + id, "");
    let last = null;
    $("[data-copy]", root).onclick = async () => {
      const p = cfg.prompt();
      $("[data-prompt]", root).textContent = p;
      const ok = await copy(p);
      toast(ok ? "Prompt copied. Paste it into the AI!" : "Copy failed: open “Show the prompt” and copy it by hand.", ok ? "" : "err");
    };
    $("[data-pdet]", root).addEventListener("toggle", () => { $("[data-prompt]", root).textContent = cfg.prompt(); });
    $("[data-check]", root).onclick = async () => {
      my.put("ai_" + id, ans.value);
      if (ans.value.trim().length < 10) { evalBox.innerHTML = `<div class="note warn">Paste the AI's answer first.</div>`; return; }
      try {
        last = await cfg.check(ans.value, root);
        evalBox.innerHTML = last.html;
        if (last.after) last.after(evalBox);
        if (!done(id)) $("[data-refl]", root).classList.remove("hidden");
      } catch (e) {
        console.error(e);
        evalBox.innerHTML = `<div class="note bad"><b>The answer could not be read.</b> ${esc(e.message || "")} Ask the AI to answer exactly in the requested format.</div>`;
      }
    };
    function showDone() {
      if (!done(id)) return;
      $("[data-refl]", root).classList.add("hidden");
      $("[data-done]", root).innerHTML = `<div class="note ok"><b>Judgement submitted (final).</b> ${esc(my.get("refl_" + id, ""))}</div>`;
    }
    $("[data-send]", root).onclick = async () => {
      const refl = $("[data-reflt]", root).value.trim();
      if (refl.length < 40) { toast("Write at least two sentences of your own judgement.", "err"); return; }
      if (!confirm("Submit now? It cannot be changed afterwards.")) return;
      const src = $("[data-src]", root).value;
      my.set("refl_" + id, refl);
      my.set("done_" + id, true);
      showDone();
      await submit({
        activity: id, kind: "text", value: last && last.value !== undefined ? last.value : "",
        option: (src + ": " + (last ? last.summary || "" : "")).slice(0, 380), points: cfg.points || 4,
        text: refl + "\n\n--- The AI's (" + src + ") answer ---\n" + ans.value.slice(0, 3500)
      }, `AI judgement submitted: +${cfg.points || 4} points`);
    };
    showDone();
    if (cfg.gate) gate(root, cfg.gate);
    return root;
  }

  /* ---------------- Small SVG charts ---------------- */
  function hbars(data, opts) {
    opts = opts || {};
    const w = 560, rowH = 26, lw = opts.labelW || 170, h = data.length * rowH + 8;
    const max = Math.max(...data.map(d => d.value), 1e-9);
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || "chart")}">${data.map((d, i) => {
      const bw = (w - lw - 90) * d.value / max;
      return `<text x="${lw - 8}" y="${i * rowH + 18}" text-anchor="end" font-size="12">${esc(d.label)}</text>
        <rect x="${lw}" y="${i * rowH + 5}" width="${Math.max(bw, 1)}" height="${rowH - 9}" rx="4" fill="${d.color || "var(--m1)"}"></rect>
        <text x="${lw + bw + 6}" y="${i * rowH + 18}" font-size="12" font-weight="600">${esc(opts.fmt ? opts.fmt(d.value) : d.value)}</text>`;
    }).join("")}</svg>`;
  }
  // Simple line chart: series [{name, color, points:[{x,y}], dash}]
  function lines(series, opts) {
    opts = opts || {};
    const w = opts.w || 560, h = opts.h || 220, L = 48, R = 12, T = 12, B = 30;
    const xs = series.flatMap(s => s.points.map(p => p.x)), ys = series.flatMap(s => s.points.map(p => p.y));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = opts.y0 !== undefined ? opts.y0 : Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.08 || 1; y0 = opts.y0 !== undefined ? y0 : y0 - pad; y1 += pad;
    const X = x => L + (w - L - R) * (x - x0) / ((x1 - x0) || 1), Y = y => T + (h - T - B) * (1 - (y - y0) / ((y1 - y0) || 1));
    const ticks = 4;
    let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || "line chart")}">`;
    for (let i = 0; i <= ticks; i++) {
      const v = y0 + (y1 - y0) * i / ticks;
      s += `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"></line><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" style="fill:var(--ink-3)">${esc(opts.yfmt ? opts.yfmt(v) : Math.round(v))}</text>`;
    }
    [...new Set(xs)].sort((a, b) => a - b).forEach(x => (s += `<text x="${X(x)}" y="${h - 10}" text-anchor="middle" font-size="10.5" style="fill:var(--ink-3)">${esc(opts.xfmt ? opts.xfmt(x) : x)}</text>`));
    if (opts.vline !== undefined) s += `<line x1="${X(opts.vline)}" x2="${X(opts.vline)}" y1="${T}" y2="${h - B}" stroke="var(--ink-3)" stroke-dasharray="4 4"></line>`;
    series.forEach(se => {
      s += `<polyline points="${se.points.map(p => X(p.x) + "," + Y(p.y)).join(" ")}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2.4}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""} stroke-linejoin="round"></polyline>`;
      if (se.dots !== false) se.points.forEach(p => (s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${se.color}"></circle>`));
    });
    s += "</svg>";
    if (opts.legend !== false) s += `<div class="legend">${series.map(se => `<span><i style="background:${se.color}"></i>${esc(se.name)}</span>`).join("")}</div>`;
    return s;
  }

  function kpi(label, value, delta, goodWhenDown, unit, ref) {
    let d = "";
    if (delta !== undefined && delta !== null && isFinite(delta)) {
      const good = goodWhenDown ? delta < 0 : delta > 0;
      d = `<div class="d ${Math.abs(delta) < 0.05 ? "" : good ? "up-good" : "up-bad"}">${delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} ${fmt().num(Math.abs(delta), 1)}${unit || "%"} ${esc(ref || "vs. baseline")}</div>`;
    }
    return `<div class="kpi"><div class="l">${label}</div><div class="v">${value}</div>${d}</div>`;
  }

  function step(badge, cls, title, pts) {
    return `<div class="step"><span class="step-badge ${cls}">${badge}</span><h3>${title}</h3>${pts ? `<span class="pts">${pts}</span>` : ""}</div>`;
  }
  // Collapsible methodology box
  function method(title, sub, html, icon) {
    return `<details class="box modszer"><summary><span class="ikon">${icon || "Σ"}</span><span>${title}<small>${sub}</small></span></summary><div class="tartalom">${html}</div></details>`;
  }

  LT.ui = { esc, $, $$, el, toast, my, done, copy, submit, gate, vote, voted, board, textBox, aiCard, hbars, lines, kpi, step, method, changed };
})();
