/* Session B: daily delivery routes (capacitated VRP with time windows).
   Own plan → travel-time ML → reality check → clustering → classic heuristics
   → AI-written heuristic contest (sandboxed code, two days) → decision memo */
(function () {
  const LT = (window.LT = window.LT || {});
  LT.missions = LT.missions || {};
  const RC = ["#005f92", "#a1772b", "#007548", "#f08681", "#00afa9", "#38ac55", "#008cc7", "#6f6f6f"];
  // label placement around dense Budapest: w = left, e = right, s = below, n = above (default)
  const LP = { G01: "w", G02: "w", G03: "e", G04: "s", G05: "w", G06: "n", G07: "w", G08: "w", G09: "w", G10: "e", G11: "w", G12: "e", G13: "e", G14: "e", G15: "n", G16: "s", G17: "w", G18: "s", G19: "w", G20: "n", G21: "n", G22: "e", G23: "n", G24: "n" };
  const short = n => n.replace(/^Bp [IVX]+ /, "");

  LT.missions.b = function (root) {
    const { esc, $, $$, my, done, vote, voted, board, textBox, gate, step, kpi, submit, toast, method, lines, copy } = LT.ui;
    const D = LT.data, { T, V, K, P: PR, fmt: f } = LT.core;
    const VP = D.VRP;
    const I1 = V.instance("d1"), I2 = V.instance("d2");
    const ownDone = () => done("b_own");
    const nn1 = V.nearest(I1), nnE = V.evaluate(I1, nn1, "dispatcher");
    let cw = null;
    const getCw = () => (cw = cw || {
      disp: V.improve(I1, V.savings(I1, "dispatcher"), "dispatcher"),
      tree: V.improve(I1, V.savings(I1, "tree"), "tree"),
      tree2: V.improve(I2, V.savings(I2, "tree"), "tree")
    });

    root.innerHTML = `
      <div class="mission-head mh-2"><div class="eyebrow">Session B · Vehicle routing · 90 minutes</div>
        <h2>Friday, 06:00, Ecser DC. Which truck goes where?</h2>
        <p>Spring season: ${I1.stores.length} garden centres in and around Budapest ordered ${I1.totalPal} pallets for Friday. The stores inside Budapest can only receive goods until 09:30 (city truck restrictions and opening hours), right in the morning rush hour. The dispatcher plans with a simple rule of thumb: <i>“a truck does 50 km/h”</i>. Can you plan better, and can machine learning and AI help?</p></div>

      <div class="card">
        <h3>The rules</h3>
        <div class="grid g2e">
          <ul class="tight">
            <li>Truck: <b>${VP.cap} pallets</b>, ${f.eur(VP.fixDay)} per day fixed, ${f.eur(VP.perKm, 2)} per km</li>
            <li>Departure 06:00; unloading ${VP.serviceBase} min + ${VP.servicePerPallet} min per pallet</li>
            <li>Back after 14:30: overtime ${f.eur(VP.overtime)} per hour</li>
          </ul>
          <ul class="tight">
            <li>Every store has a <b>delivery window</b>. Early: the truck waits. Late (after the window closes): ${f.eur(VP.latePenalty)} penalty per store (chain penalty and redelivery)</li>
            <li>A truck carries at most ${VP.cap} pallets; every store is visited exactly once</li>
          </ul>
        </div>
        <div class="note info"><b>Daily cost</b> = trucks × fixed cost + km × km cost + late stores × penalty + overtime hours × overtime rate. This is what the contests measure.</div>
        <details class="mini"><summary>Friday's orders and windows</summary><div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Store</th><th class="n">Pallets</th><th>Window</th><th class="n">Urban share</th></tr></thead><tbody>
          ${I1.stores.map(s => `<tr><td>${s.id} ${esc(s.name)}</td><td class="n">${s.d1}</td><td>${s.win[0]}–${s.win[1]}</td><td class="n">${s.urb}</td></tr>`).join("")}</tbody></table></div></details>
      </div>

      ${method("Method: the vehicle routing problem with time windows", "Formulation, why it is hard, how the page evaluates a plan", `
        <h4>1. The problem</h4>
        <p>This is a <b>capacitated vehicle routing problem with time windows</b> (CVRPTW): several trucks, each with a capacity limit, start and end at the depot, and every customer must be served once within its time window. It generalises the travelling salesman problem, so it is <b>NP-hard</b>: one truck visiting 19 stores already has 19! ≈ 1.2 × 10<sup>17</sup> possible orders.</p>
        <h4>2. As a mathematical model (sketch)</h4>
        <div class="keplet">
          <div class="sor"><span class="cimke">Decisions</span><div><div class="mat"><i>x<sub>ijk</sub></i> ∈ {0,1}, &nbsp; <i>t<sub>i</sub></i> ≥ 0</div><div class="szoveg">Does truck k drive directly from i to j; at what time does service start at store i.</div></div></div>
          <div class="sor"><span class="cimke">Objective</span><div><div class="mat">min Σ<sub>k</sub> F·(truck k used) + Σ<sub>ijk</sub> c·km<sub>ij</sub>·x<sub>ijk</sub> + penalties</div><div class="szoveg">Fixed cost of the trucks, distance cost, lateness and overtime.</div></div></div>
          <div class="sor"><span class="cimke">Constraints</span><div><div class="mat">every store visited once · flow conservation · Σ load ≤ ${VP.cap} · t<sub>j</sub> ≥ t<sub>i</sub> + service<sub>i</sub> + travel<sub>ij</sub>(t<sub>i</sub>) if i → j</div><div class="szoveg">The last constraint links routing and time: the travel time depends on when you leave (rush hour!). This makes the problem time-dependent.</div></div></div>
        </div>
        <p>Exact solvers handle such models up to roughly 50–100 customers with advanced techniques (branch-and-price). Real companies with hundreds of stops use <b>heuristics</b> and <b>metaheuristics</b> (e.g. Google OR-Tools, commercial route planners).</p>
        <h4>3. How the page evaluates a plan</h4>
        <ul class="tight">
          <li>Distances: road ≈ ${VP.roadFactor} × straight line.</li>
          <li>Time: departure 06:00; travel time from the chosen <b>travel-time model</b> (first the dispatcher's 50 km/h, later the machine-learning model); early arrival waits for the window to open; then unloading.</li>
          <li>Validity: every store exactly once, no truck above ${VP.cap} pallets.</li>
          <li>Lower bound on trucks: ⌈${I1.totalPal} / ${VP.cap}⌉ = ${Math.ceil(I1.totalPal / VP.cap)}.</li>
        </ul>`)}

      <div class="card" id="b-guess">${step("1 · Guess", "tipp", "How many trucks?", "+5 points if right")}</div>

      <div class="card" id="b-own">
        ${step("2 · Your own plan", "verseny", "Build Friday's routes", "contest: lowest daily cost")}
        <p><b>Click the stores</b> in the order the truck visits them. “+ New route” starts the next truck. Click a store that is already on a route to take it off. Click a route card to make it the active one. Arrival times use the dispatcher's planning rule (<b>50 km/h</b>), exactly as Kestrel plans today. You can <b>submit once</b>.</p>
        <div class="grid g2">
          <div>
            <div class="map-wrap"><div id="b-map"></div>
              <div class="legend"><span>■ Ecser DC</span><span><i style="background:var(--ink-3);border-radius:50%"></i>not yet on a route</span><span>number in circle: pallets</span><span>⏰ window closes</span><span>2/3: route 2, stop 3</span></div></div>
            <div class="btn-row" id="b-buttons"></div>
          </div>
          <div>
            <div id="b-kpi"></div>
            <div class="routes" id="b-routes"></div>
            <div id="b-err"></div>
            <div class="btn-row" id="b-send-row"></div>
            <h4>Route contest</h4><div id="b-board"></div>
          </div>
        </div>
      </div>

      <div class="card" id="b-ml">
        ${step("3 · Machine learning", "kviz", "How long does a trip really take?", "+5 points if your guess is right")}
        <p>Kestrel's trucks have telematics. The log holds <b>${T.log().length} past trips</b> between stores: distance, the <b>urban share</b> of the trip (0 = open road, 1 = inner city), the <b>departure hour</b>, and the measured minutes. We split it randomly: ${T.train().length} trips to <b>train</b> the models, ${T.test().length} trips held back to <b>test</b> them.</p>
        <details class="mini"><summary>A look at the data</summary><div id="b-log"></div></details>
        <div id="b-tt-guess"></div>
        <div id="b-ml-block" style="margin-top:10px">
          <div class="btn-row"><button class="btn primary" id="b-ml-run">Train and test the models</button></div>
          <div id="b-ml-out"></div>
        </div>
      </div>

      ${method("Method: regression trees and how to test a model", "Linear regression, CART, train/test split, MAE, depth and overfitting, feature engineering", `
        <h4>1. Linear regression on the raw features</h4>
        <p>minutes = b<sub>0</sub> + b<sub>1</sub>·km + b<sub>2</sub>·urban + b<sub>3</sub>·hour. Fitted by least squares. It assumes every feature adds a fixed amount, independently of the others. But in reality an urban kilometre at 8:00 is much slower than an urban kilometre at 11:00 or a rural kilometre at 8:00: the effects <b>interact</b>, and the hour effect is not a straight line (a peak, not a slope).</p>
        <h4>2. Regression tree (CART)</h4>
        <p>The tree predicts the <b>pace</b> (minutes per km) and multiplies it by the distance. It is grown greedily:</p>
        <ol class="tight">
          <li>Try every feature and every threshold (e.g. “urban share ≤ 0.62”, “hour ≤ 9.45”).</li>
          <li>Pick the split that reduces the squared error of the pace the most (each side predicts its own average).</li>
          <li>Repeat inside each side, until the maximum <b>depth</b> is reached or a group gets too small (here min. 12 trips).</li>
        </ol>
        <p>The result is a set of readable if-then rules, and it discovers the interaction “urban AND rush hour” by itself, because a split on hour can happen inside the urban branch only.</p>
        <h4>3. Testing</h4>
        <div class="keplet-sor">MAE = average |predicted minutes − actual minutes|</div>
        <p>A model must be judged on trips it has <b>not seen</b> during training (the test set). The training error always falls as the tree gets deeper; the test error falls, then flattens or rises: the deep tree starts memorising noise. That is <b>overfitting</b>, and the depth is a <b>hyperparameter</b> chosen on held-out data.</p>
        <h4>4. Could the linear model be rescued?</h4>
        <p>Yes, with <b>feature engineering</b>: add km × urban, km × rush-hour, km × urban × rush-hour as new features. A good analyst would do that, but must know which interactions to add. The tree finds them from the data. In practice, gradient-boosted trees (many small trees added up, e.g. XGBoost or LightGBM) are the standard tool for travel-time and ETA prediction.</p>
        <h4>5. Limits</h4>
        <ul class="tight"><li>The model predicts an <b>average</b>; individual trips still vary (the remaining noise).</li><li>It only knows conditions that appear in the log (no road works, no snow).</li></ul>`, "ƒ")}

      <div class="card" id="b-cl">
        ${step("4 · Clustering", "algo", "Cluster first, route second")}
        <p>A classic two-phase idea: first split the stores into one group per truck, then find a good order inside each group. Two ways to form the groups: the <b>sweep</b> method (turn a ray around the depot like a radar and cut a new group when the truck is full) and <b>k-means</b> on the store locations (from session A). The routes are timed with the ML travel-time model.</p>
        <div class="btn-row"><button class="btn primary" id="b-cl-run">Run sweep and k-means</button></div>
        <div id="b-cl-out"></div>
        <div id="b-cq" style="margin-top:12px"></div>
      </div>

      <div class="card" id="b-heu">
        ${step("5 · Heuristics", "algo", "Classic routing heuristics, with and without ML travel times")}
        <p>Now the benchmark algorithms: the dispatcher's <b>nearest neighbour</b>, and <b>Clarke–Wright savings with local search</b>, once planned with the 50 km/h rule and once with the ML travel times. Every plan is then evaluated on the ML model and on <b>reality</b> (the expected true travel times, which the page knows because it generated the data).</p>
        <div class="btn-row"><button class="btn primary" id="b-heu-run">Run the heuristics</button></div>
        <div id="b-heu-out"></div>
      </div>

      ${method("Method: construction heuristics and local search", "Nearest neighbour, Clarke–Wright savings, 2-opt, relocate, metaheuristics", `
        <h4>1. Nearest neighbour</h4>
        <p>From the current position always drive to the closest unvisited store that still fits in the truck; when nothing fits, return and start the next truck. Fast and intuitive, but <b>greedy</b>: early easy choices leave long trips at the end, and it ignores time windows completely.</p>
        <h4>2. Clarke–Wright savings</h4>
        <p>Start with one truck per store (depot → store → depot). For every pair of stores compute the saving of serving them on one trip:</p>
        <div class="keplet-sor">s(i, j) = d(depot, i) + d(depot, j) − d(i, j)</div>
        <p>Go through the pairs from the largest saving down, and merge two routes if i and j are at route ends, the merged load fits, and the full cost (including lateness and overtime under the chosen travel-time model) goes down.</p>
        <h4>3. Local search</h4>
        <ul class="tight"><li><b>2-opt:</b> reverse a segment of a route; this removes crossing edges.</li><li><b>Relocate:</b> move one store to another position or another truck if the total cost falls and capacity allows.</li></ul>
        <p>Repeat until no move improves: a <b>local optimum</b>. Metaheuristics (simulated annealing, tabu search, adaptive large neighbourhood search) accept occasional worse moves to escape local optima; this is what industrial route planners do.</p>
        <h4>4. Why the travel-time model matters</h4>
        <p>Every heuristic optimises the cost <b>as computed by its time model</b>. If the model says the morning ring road takes 18 minutes but it really takes 55, the “optimal” plan arrives late. Better predictions are often worth more than a better algorithm.</p>`, "⇄")}

      <div class="card ai-card" id="b-ai">
        ${step("6 · AI as programmer", "ai", "Let the AI write a routing heuristic, then race it", "contest: lowest cost over two days")}
        <p>The page contains a small route-building engine. It fills one truck at a time: at every step it looks at all stores that still fit in the truck and asks a <b>scoring function</b> which one to visit next (the <b>lowest score wins</b>). If every candidate gets a non-finite score (e.g. <code>Infinity</code>), the truck returns and the next one starts. The nearest-neighbour rule is simply <code>return c.km;</code>. Your task: get an AI to write a better <code>score(c, s)</code>.</p>
        <details class="mini" open><summary>What the scoring function receives</summary><div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Field</th><th>Meaning</th></tr></thead><tbody>
          <tr><td><code>c.km</code>, <code>c.min</code></td><td>distance and predicted travel minutes (ML model) from the current position to the candidate</td></tr>
          <tr><td><code>c.arrive</code>, <code>c.open</code>, <code>c.close</code></td><td>predicted arrival and the window, in minutes after midnight (e.g. 570 = 09:30)</td></tr>
          <tr><td><code>c.slack</code>, <code>c.wait</code>, <code>c.late</code></td><td>close − arrive (negative = late); waiting minutes if early; true if it would be late</td></tr>
          <tr><td><code>c.pallets</code>, <code>c.service</code>, <code>c.finish</code></td><td>pallets, unloading minutes, the time we would leave the store</td></tr>
          <tr><td><code>c.kmToDepot</code>, <code>c.minToDepot</code></td><td>distance and minutes from the candidate back to the DC</td></tr>
          <tr><td><code>c.urban</code>, <code>c.angle</code>, <code>c.id</code></td><td>urban share 0–1, compass angle from the DC in degrees, store ID</td></tr>
          <tr><td><code>s.clock</code>, <code>s.load</code>, <code>s.room</code></td><td>current time, pallets already on this truck, free space</td></tr>
          <tr><td><code>s.route</code>, <code>s.stopsInRoute</code>, <code>s.atDepot</code></td><td>truck number, stops so far, true at the start of a route</td></tr>
          <tr><td><code>s.storesLeft</code>, <code>s.palletsLeft</code>, <code>s.trucksMin</code>, <code>s.shiftEnd</code></td><td>what is still to deliver, the minimum trucks still needed, 870 (= 14:30)</td></tr>
        </tbody></table></div></details>
        <div class="lepes-sor">
          <div class="lepes"><span class="sz">1</span><div><b>Copy the prompt</b> and paste it into an AI.</div></div>
          <div class="lepes"><span class="sz">2</span><div><b>Paste the code</b> it writes into the editor and run it in the sandbox.</div></div>
          <div class="lepes"><span class="sz">3</span><div><b>Iterate:</b> copy the feedback prompt with your results, get an improved version.</div></div>
          <div class="lepes"><span class="sz">4</span><div><b>Submit</b> your best version to the contest (as many times as you like; the best counts).</div></div>
        </div>
        <div class="btn-row">
          <button class="btn ai" id="b-ai-p1">Copy prompt (round 1)</button>
          ${(window.LT_CONFIG.AI_LINKS || []).map(l => `<a class="btn small ai-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join("")}
        </div>
        <details class="mini" id="b-ai-pdet"><summary>Show the round-1 prompt</summary><div class="prompt-box" id="b-ai-ptext"></div></details>
        <details class="mini"><summary>Why is the prompt written this way?</summary><div class="prompt-magy">
          <div class="pm-sor"><span class="pm-resz">Interface contract</span><span>The exact function signature and every field with its unit. Code that does not match the interface cannot run, so the contract must be unambiguous.</span></div>
          <div class="pm-sor"><span class="pm-resz">Objective in money</span><span>The AI gets the cost parameters, so it can weigh a late delivery (${f.eur(VP.latePenalty)}) against extra kilometres (${f.eur(VP.perKm, 2)}/km) and an extra truck (${f.eur(VP.fixDay)}).</span></div>
          <div class="pm-sor"><span class="pm-resz">No instance data</span><span>It sees a summary, not the store list: the heuristic should work on any day. The contest runs it on Friday AND Monday to reward rules that generalise.</span></div>
          <div class="pm-sor"><span class="pm-resz">Constraints on code</span><span>Pure function, no state, no external calls: it must run in a sandbox, fast, thousands of times.</span></div>
          <div class="pm-sor"><span class="pm-resz">Feedback loop</span><span>The round-2 prompt sends back measured results (cost, late stores, routes). The AI improves on evidence, not on its own guesses: a small version of LLM-driven algorithm search.</span></div>
        </div></details>
        <div class="field" style="margin-top:12px"><label for="b-code">Heuristic code <span class="hint">(paste the AI's answer; the page extracts <code>function score(c, s)</code>)</span></label>
          <textarea id="b-code" class="code-area" spellcheck="false"></textarea></div>
        <div class="btn-row">
          <button class="btn primary" id="b-run">Run in sandbox (Friday + Monday)</button>
          <button class="btn small" id="b-load-nn">Load: nearest neighbour</button>
          <button class="btn small" id="b-load-urg">Load: most urgent first</button>
        </div>
        <div id="b-run-out"></div>
        <div id="b-hist"></div>
        <h4 style="margin-top:14px">AI heuristic contest</h4><div id="b-heur-board"></div>
        <div style="margin-top:14px"><h4>Your judgement <span class="pts">+4 points</span></h4>
          <p class="muted">At least 3 sentences: which AI, how many rounds, what idea made the difference, where did the code fail or surprise you, would you trust it in production without the sandbox tests?</p>
          <div id="b-ai-refl"></div></div>
      </div>

      ${method("Method: AI-designed heuristics", "LLMs as code generators inside a search loop; sandboxing; overfitting to one instance", `
        <h4>1. The idea</h4>
        <p>Writing a good dispatching rule by hand takes expertise and trial and error. Recent research lets a language model generate the rule as code, evaluates it automatically on test instances, and feeds the scores back so the model proposes better variants. DeepMind's <b>FunSearch</b> (2023) found new constructions in mathematics and better bin-packing heuristics this way; methods such as <b>Evolution of Heuristics (EoH)</b> and <b>ReEvo</b> apply the same loop to routing and scheduling problems. Today you are the loop: you run the evaluation and decide what to send back.</p>
        <div class="method-flow">
          <div><b>Generate</b>The LLM writes score(c, s) from the interface contract.</div>
          <div><b>Sandbox</b>The code runs isolated (Web Worker, no network, time limit).</div>
          <div><b>Evaluate</b>The routes are scored with the same cost function on two days.</div>
          <div><b>Feedback</b>Scores and failure details go back to the LLM.</div>
          <div><b>Select</b>Keep the best version; repeat.</div>
        </div>
        <h4>2. Why two days?</h4>
        <p>A rule tuned to Friday's map (e.g. “visit G06 first”) can look brilliant on Friday and fail on Monday. Evaluating on several instances is the heuristic-design version of the <b>train/test split</b>. Research systems use dozens of instances for the same reason.</p>
        <h4>3. Why a sandbox?</h4>
        <p>Never run AI-written code with access to your data or network. Here the code runs in a Web Worker without network access, gets only frozen copies of the data, and is stopped after a few seconds. In a company the same principle applies: AI-generated code is reviewed and tested before it touches production systems.</p>
        <h4>4. What a construction rule cannot do</h4>
        <p>It decides one step at a time and never revises. Even a perfect rule usually stays behind Clarke–Wright plus local search. Real systems combine both: a good construction rule as the start, local search or metaheuristics to polish.</p>`, "λ")}

      <div class="card" id="b-dec-card">
        ${step("7 · Decision", "algo", "Your routing recommendation", "+2 points")}
        <p>Three to five sentences for the logistics manager: which planning method and which travel-time model should Kestrel use, how many trucks, what does a day cost, how many stores are served on time, and what changes in the dispatcher's work?</p>
        <div id="b-dec"></div>
      </div>`;

    /* ================= Map ================= */
    const proj = LT.core.projector(47.47, 19.26), SC = 6;
    const Pp = p => { const q = proj(p); return { x: q.x * SC, y: q.y * SC }; };
    function mapSvg(inst, rs, o) {
      o = o || {};
      const dep = Pp(D.DEPOT);
      let s = `<svg viewBox="-335 -235 670 455" role="img" aria-label="Stores around Budapest and the routes">`;
      const danube = [[47.80, 19.00], [47.78, 19.13], [47.70, 19.08], [47.60, 19.06], [47.50, 19.05], [47.40, 19.03], [47.30, 18.95], [47.15, 18.97], [47.08, 18.93]];
      s += `<polyline points="${danube.map(([lat, lon]) => { const q = Pp({ lat, lon }); return q.x + "," + q.y; }).join(" ")}" fill="none" stroke="#7fb2d6" stroke-width="7" stroke-opacity=".45" stroke-linejoin="round" pointer-events="none"></polyline>`;
      const bp = Pp({ lat: 47.497, lon: 19.04 });
      s += `<circle cx="${bp.x}" cy="${bp.y}" r="${13 * SC}" fill="var(--ink-3)" fill-opacity=".07" stroke="var(--ink-3)" stroke-dasharray="3 4" stroke-opacity=".4" pointer-events="none"></circle><text x="${bp.x}" y="${bp.y - 13 * SC - 4}" text-anchor="middle" font-size="9.5" style="fill:var(--ink-3)">Budapest</text>`;
      const where = {}, lateSet = new Set(o.late || []);
      (o.clusters ? o.clusters : rs).forEach((r, k) => {
        if (!r.length) return;
        if (!o.clusters) {
          const pts = [dep].concat(r.map(id => Pp(inst.nodes[inst.idx[id]])), [dep]);
          s += `<polyline points="${pts.map(q => q.x + "," + q.y).join(" ")}" fill="none" stroke="${RC[k % RC.length]}" stroke-width="${k === o.active ? 4 : 2.6}" stroke-opacity=".85" stroke-linejoin="round" pointer-events="none"></polyline>`;
        }
        r.forEach((id, i) => (where[id] = { k, i }));
      });
      if (o.centers) o.centers.forEach((c, m) => { const q = Pp(c); s += `<text x="${q.x}" y="${q.y + 7}" text-anchor="middle" font-size="22" font-weight="800" style="fill:${RC[m % RC.length]}" stroke="var(--panel)" stroke-width="2" paint-order="stroke">✚</text>`; });
      for (const st of inst.stores) {
        const q = Pp(st), w = where[st.id], c = w ? RC[w.k % RC.length] : "var(--ink-3)", pal = st[inst.day], lp = LP[st.id] || "n";
        const lx = { w: -16, e: 16 }[lp] || 0, ly = { s: 27, n: -17 }[lp] !== undefined ? { s: 27, n: -17 }[lp] : 4;
        s += `<g class="${o.click ? "clickable" : ""}" data-s="${st.id}" ${o.click ? `tabindex="0" role="button" aria-label="${esc(st.name)}, ${pal} pallets"` : ""}>
          <circle cx="${q.x}" cy="${q.y}" r="12" fill="${c}" stroke="${lateSet.has(st.id) ? "#c0453f" : "var(--panel)"}" stroke-width="${lateSet.has(st.id) ? 4 : 2}"></circle>
          <text x="${q.x}" y="${q.y + 4}" text-anchor="middle" font-size="11" font-weight="800" pointer-events="none" style="fill:#fff" stroke="#0f0f0f" stroke-width="2.4" paint-order="stroke">${pal}</text>
          <text x="${q.x + lx}" y="${q.y + ly}" text-anchor="${{ w: "end", e: "start" }[lp] || "middle"}" font-size="9.5" font-weight="600" pointer-events="none">${esc(short(st.name))} ⏰${st.win[1]}</text>
          ${w && !o.clusters ? `<text pointer-events="none" x="${q.x + 11}" y="${q.y - 9}" font-size="9" font-weight="800" style="fill:${c}" stroke="var(--panel)" stroke-width="2.5" paint-order="stroke">${w.k + 1}/${w.i + 1}</text>` : ""}
          <title>${esc(st.name)}: ${pal} pallets, window ${st.win[0]}–${st.win[1]}</title></g>`;
      }
      s += `<rect x="${dep.x - 11}" y="${dep.y - 11}" width="22" height="22" rx="3" fill="var(--brand)" stroke="var(--accent)" stroke-width="2.5" pointer-events="none"></rect><text x="${dep.x + 14}" y="${dep.y + 18}" font-size="10" font-weight="800" pointer-events="none">Ecser DC</text>`;
      return s + "</svg>";
    }
    function routeCards(inst, e, rs, o) {
      o = o || {};
      return rs.map((r, k) => {
        const d = e.details.find(x => x.route.join() === r.join() && r.length);
        const late = d ? d.stops.filter(a => a.late).map(a => short(a.name)) : [];
        return `<div class="route ${k === o.active ? "active" : ""}" style="--c:${RC[k % RC.length]}" data-k="${k}">
          <b>Route ${k + 1}</b> ${d ? `<span class="tag ${d.overloaded ? "bad" : ""}">${d.load}/${VP.cap} pallets</span><span class="tag">${f.num(d.km, 0)} km</span><span class="tag ${d.ot > 0 ? "bad" : ""}">back ${f.clock(d.back)}</span>${late.length ? `<span class="tag bad">late: ${esc(late.join(", "))}</span>` : ""}` : "<small>empty: click stores on the map</small>"}
          <div class="seq">${d ? "DC → " + d.stops.map(a => `${esc(short(a.name))} <small>${f.clock(a.arrive)}</small>`).join(" → ") + " → DC" : ""}</div></div>`;
      }).join("");
    }
    const kpiRow = (e, ref, refName) => `<div class="kpis">
      ${kpi("Daily cost", f.eur(e.cost), ref ? 100 * (e.cost / ref.cost - 1) : null, true, "%", refName)}
      ${kpi("Trucks", e.trucks)}${kpi("Distance", f.num(e.km, 0) + " km")}${kpi("On time", f.pct(e.onTimePct, 0))}${kpi("Truck utilisation", f.pct(e.util, 0))}</div>`;

    /* ================= 1 · Guess ================= */
    const guessB = vote($("#b-guess", root), Object.assign({ mode: "guess" }, LT.ACT.b_guess, {
      explain: () => `Lower bound: ${I1.totalPal} / ${VP.cap} = ${f.num(I1.totalPal / VP.cap, 2)}, so at least ${Math.ceil(I1.totalPal / VP.cap)} trucks. The best heuristic plan uses ${V.evaluate(I1, getCw().tree, "tree").trucks}, with all windows met.`
    }));

    /* ================= 2 · Own plan ================= */
    let routes = my.get("b_routes", [[]]), active = Math.min(my.get("b_active", 0), routes.length - 1), curE = null;
    function renderOwn() {
      const locked = ownDone();
      if (locked && my.get("b_sub")) routes = my.get("b_sub").routes.map(r => r.slice());
      if (!routes.length) routes = [[]];
      active = Math.max(0, Math.min(active, routes.length - 1));
      if (!locked) { my.put("b_routes", routes); my.put("b_active", active); }
      const e = (curE = V.evaluate(I1, routes, "dispatcher"));
      $("#b-map", root).innerHTML = mapSvg(I1, routes, { active: locked ? -1 : active, click: !locked });
      if (!locked) $$("#b-map [data-s]", root).forEach(g => {
        const act = () => { const id = g.dataset.s, k = routes.findIndex(r => r.includes(id)); if (k >= 0) routes[k] = routes[k].filter(x => x !== id); else routes[active].push(id); renderOwn(); };
        g.addEventListener("click", act);
        g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } });
      });
      $("#b-kpi", root).innerHTML = kpiRow(e, nnE, "vs. dispatcher") + `<small>Planned: ${I1.stores.length - e.missing.length}/${I1.stores.length} stores. Compared with the dispatcher's nearest-neighbour plan (${f.eur(nnE.cost)}).</small>`;
      $("#b-routes", root).innerHTML = routeCards(I1, e, routes, { active: locked ? -1 : active });
      if (!locked) $$("#b-routes [data-k]", root).forEach(c => (c.onclick = () => { active = Number(c.dataset.k); renderOwn(); }));
      const bd = `Trucks ${f.eur(e.fixC)} + km ${f.eur(e.kmC)} + late ${f.eur(e.lateC)} + overtime ${f.eur(e.otC)}`;
      $("#b-err", root).innerHTML = e.valid ? `<div class="note ok"><b>Valid plan.</b> ${bd}.</div>` : `<div class="note warn"><b>Not yet valid:</b> ${e.errors.map(esc).join("; ")}.</div>`;
      $("#b-buttons", root).innerHTML = locked ? "" : `<button class="btn primary" id="b-new">+ New route</button><button class="btn" id="b-undo">Undo last stop</button><button class="btn small" id="b-clear">Clear all</button>`;
      $("#b-send-row", root).innerHTML = locked
        ? `<div class="note ok"><b>Submitted (final):</b> ${e.trucks} trucks, ${f.num(e.km, 0)} km, ${f.eur(e.cost)} (planned at 50 km/h).</div>`
        : `<button class="btn accent" id="b-send" ${e.valid ? "" : "disabled"}>Submit (final)</button>`;
      if (locked) return;
      $("#b-new", root).onclick = () => { if (!routes[routes.length - 1].length) active = routes.length - 1; else { routes.push([]); active = routes.length - 1; } renderOwn(); };
      $("#b-undo", root).onclick = () => { routes[active].pop(); renderOwn(); };
      $("#b-clear", root).onclick = () => { if (confirm("Clear all routes?")) { routes = [[]]; active = 0; renderOwn(); } };
      $("#b-send", root).onclick = async () => {
        if (!curE.valid || ownDone()) return;
        if (!confirm(`Submit this plan (${curE.trucks} trucks, ${f.eur(curE.cost)})? It cannot be changed afterwards.`)) return;
        my.put("b_sub", { routes: routes.filter(r => r.length), cost: curE.cost });
        my.set("done_b_own", true);
        renderOwn();
        await submit({ activity: "b_own", kind: "result", value: Math.round(curE.cost), dir: "min", text: `${curE.trucks} trucks, ${f.num(curE.km, 0)} km, ${curE.late} late (at 50 km/h)` }, "Plan submitted to the contest");
      };
    }
    board($("#b-board", root), "b_own", { unit: "€/day", fmt: v => f.num(v), detail: true });
    renderOwn();
    gate($("#b-own", root), [{ ok: voted("b_guess"), text: "Lock in your guess in step 1 first." }]);

    /* ================= 3 · Travel-time ML ================= */
    const logRows = T.log();
    const scatter = () => {
      const w = 560, h = 240, L = 44, B = 30, Tp = 10, R = 10;
      const X = u => L + (w - L - R) * u, Y = p => Tp + (h - Tp - B) * (1 - Math.min(p, 5) / 5);
      let s = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Pace versus urban share">`;
      [0, 1, 2, 3, 4, 5].forEach(p => (s += `<line x1="${L}" x2="${w - R}" y1="${Y(p)}" y2="${Y(p)}" stroke="var(--line)"></line><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end" font-size="10" style="fill:var(--ink-3)">${p}</text>`));
      [0, 0.25, 0.5, 0.75, 1].forEach(u => (s += `<text x="${X(u)}" y="${h - 10}" text-anchor="middle" font-size="10" style="fill:var(--ink-3)">${u}</text>`));
      logRows.filter(r => r.km >= 3).forEach(r => (s += `<circle cx="${X(r.u)}" cy="${Y(r.min / r.km)}" r="2.6" fill="${T.isPeak(r.hour) ? "#c0453f" : "#005f92"}" fill-opacity=".55"></circle>`));
      return s + `</svg><div class="legend"><span><i style="background:#c0453f;border-radius:50%"></i>departure 06:30–09:30</span><span><i style="background:#005f92;border-radius:50%"></i>other hours</span><span>x: urban share · y: minutes per km (trips ≥ 3 km)</span></div>`;
    };
    $("#b-log", root).innerHTML = `<div class="grid g2e"><div><table class="small-tbl"><thead><tr><th>#</th><th class="n">km</th><th class="n">Urban</th><th class="n">Departure</th><th class="n">Minutes</th><th>Set</th></tr></thead><tbody>
      ${logRows.slice(0, 12).map(r => `<tr><td>${r.id}</td><td class="n">${f.num(r.km, 1)}</td><td class="n">${f.num(r.u, 2)}</td><td class="n">${f.clock(r.hour * 60)}</td><td class="n">${f.num(r.min, 1)}</td><td>${r.test ? "test" : "train"}</td></tr>`).join("")}
      </tbody></table><small>First 12 of ${logRows.length} trips.</small></div><div>${scatter()}<small>Pace explodes when urban AND rush hour come together. Can a model see that?</small></div></div>`;
    const guessTT = vote($("#b-tt-guess", root), Object.assign({ mode: "guess" }, LT.ACT.b_tt, {
      explain: () => { const M = T.models(), te = T.test(); return `Test MAE: dispatcher ${f.num(T.mae(M.dispatcher, te), 1)} min, linear ${f.num(T.mae(M.linear, te), 1)} min, tree ${f.num(T.mae(M.tree, te), 1)} min per trip. The tree wins because it can learn the interaction of city traffic and rush hour.`; }
    }));
    gate($("#b-ml-block", root), [{ ok: voted("b_tt"), text: "Lock in your guess about the models first." }, { ok: ownDone, text: "Submit your own plan in step 2 first." }]);
    function treeText(n, ind) {
      ind = ind || "";
      if (!n.f) return `${ind}<span class="leaf">→ ${f.num(n.value, 2)} min/km</span>  (${n.n} trips)\n`;
      const thr = n.f === "hour" ? f.clock(n.thr * 60) : f.num(n.thr, n.f === "km" ? 1 : 2);
      return `${ind}if ${n.fname} ≤ ${thr}:\n${treeText(n.left, ind + "   ")}${ind}else:\n${treeText(n.right, ind + "   ")}`;
    }
    const sg = v => (v < 0 ? "−" : "+");
    function renderML() {
      const M = T.models(), tr = T.train(), te = T.test();
      const depth = Number(my.get("b_depth", T.DEFAULT_DEPTH));
      const curves = [1, 2, 3, 4, 5, 6, 7, 8].map(d => { const m = T.fitTree(tr, d); return { d, tr: T.mae(m, tr), te: T.mae(m, te), leaves: m.leaves }; });
      const tm = T.fitTree(tr, depth);
      const rows = [["dispatcher", M.dispatcher], ["linear", M.linear], ["tree", M.tree]].map(([k, m]) => ({ k, tr: T.mae(m, tr), te: T.mae(m, te) }));
      const win = rows.slice().sort((a, b) => a.te - b.te)[0].k;
      const b = M.linear.b;
      $("#b-ml-out", root).innerHTML = `
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Model</th><th class="n">MAE train (min)</th><th class="n">MAE test (min)</th></tr></thead><tbody>
          ${rows.map(r => `<tr ${r.k === win ? 'class="me"' : ""}><td>${esc(T.MODEL_NAMES[r.k])}</td><td class="n">${f.num(r.tr, 1)}</td><td class="n"><b>${f.num(r.te, 1)}</b></td></tr>`).join("")}
        </tbody></table></div>
        <p><small>Linear model learned: minutes = ${f.num(b[0], 1)} ${sg(b[1])} ${f.num(Math.abs(b[1]), 2)}·km ${sg(b[2])} ${f.num(Math.abs(b[2]), 1)}·urban ${sg(b[3])} ${f.num(Math.abs(b[3]), 2)}·hour. It can only add effects, so it underestimates the city at 8:00 and overestimates it at noon.</small></p>
        <div class="grid g2e">
          <div><b>Tree depth vs. error</b>${lines([{ name: "train MAE", color: "#a1772b", points: curves.map(c => ({ x: c.d, y: c.tr })) }, { name: "test MAE", color: "#005f92", points: curves.map(c => ({ x: c.d, y: c.te })) }], { yfmt: v => f.num(v, 1), title: "depth chart" })}
            <div class="slider-row"><label for="b-depth">Show the tree with depth</label><output>${depth}</output><input type="range" id="b-depth" min="1" max="8" value="${depth}"></div>
            <small>The planning tool uses depth ${T.DEFAULT_DEPTH}. Deeper trees fit the training trips better, but the test error stops improving: the extra splits learn noise.</small></div>
          <div><b>The learned rules (depth ${depth}, ${tm.leaves} leaves)</b><div class="tree">${treeText(tm.tree)}</div></div>
        </div>
        <h4>Reality check: your submitted plan, re-timed with the ML model</h4>
        <div id="b-recheck"></div>`;
      $("#b-depth", root).oninput = e => { my.put("b_depth", Number(e.target.value)); renderML(); };
      const sub = my.get("b_sub");
      if (sub) {
        const e0 = V.evaluate(I1, sub.routes, "dispatcher"), e1 = V.evaluate(I1, sub.routes, "tree");
        const stops = e1.details.flatMap(d => d.stops.map(s => ({ s, d })));
        const disp = {}; e0.details.forEach(d => d.stops.forEach(s => (disp[s.id] = s.arrive)));
        $("#b-recheck", root).innerHTML = `<div class="grid g2e"><div class="map-wrap">${mapSvg(I1, sub.routes, { late: stops.filter(x => x.s.late).map(x => x.s.id) })}</div><div>
          <div class="kpis">${kpi("Cost at 50 km/h", f.eur(e0.cost))}${kpi("Cost with ML times", f.eur(e1.cost), 100 * (e1.cost / e0.cost - 1), true, "%", "vs. plan")}${kpi("Late stores", e0.late + " → " + e1.late)}</div>
          <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Route</th><th>Store</th><th>Window</th><th class="n">Planned (50 km/h)</th><th class="n">ML prediction</th></tr></thead><tbody>
          ${stops.map(x => `<tr><td>${x.d.k + 1}</td><td>${esc(short(x.s.name))}</td><td>${f.clock(x.s.open)}–${f.clock(x.s.close)}</td><td class="n">${f.clock(disp[x.s.id])}</td><td class="n" style="${x.s.late ? "color:var(--bad);font-weight:700" : ""}">${f.clock(x.s.arrive)}${x.s.late ? " late" : ""}</td></tr>`).join("")}
          </tbody></table></div>
          <div class="note ${e1.late > e0.late ? "warn" : "ok"}">${e1.late > e0.late ? `<b>${e1.late - e0.late} more store(s) would be late in reality.</b> The 50 km/h rule is fine on the motorway, but in the city at 8:00 trucks crawl. A plan is only as good as its travel times.` : "<b>Your plan survives the ML re-timing.</b> You left enough buffer for the city in the morning; well done."}</div></div></div>`;
      }
      guessTT.reveal(win);
    }
    $("#b-ml-run", root).onclick = () => { my.set("b_ml", true); renderML(); };
    if (my.get("b_ml")) renderML();

    /* ================= 4 · Clustering ================= */
    function renderCl() {
      const sw = V.sweep(I1, "tree"), km = V.kmeansRoutes(I1, "tree");
      const eS = V.evaluate(I1, sw.routes, "tree"), eK = V.evaluate(I1, km.routes, "tree");
      const load = c => c.reduce((s, id) => s + I1.pal[I1.idx[id]], 0);
      const over = km.before.filter(c => load(c) > VP.cap).length;
      $("#b-cl-out", root).innerHTML = `<div class="grid g2e">
        <div><b>k-means clusters (before repair)</b><div class="map-wrap">${mapSvg(I1, [], { clusters: km.before, centers: km.centers })}</div>
          <small>Cluster loads: ${km.before.map(c => `<span class="pill ${load(c) > VP.cap ? "bad" : "ok"}">${load(c)}</span>`).join(" ")} pallets (capacity ${VP.cap}). ${over ? `${over} cluster(s) too heavy for one truck: a repair step moved stores to neighbouring clusters.` : "All clusters fit."}</small></div>
        <div><b>Sweep routes</b><div class="map-wrap">${mapSvg(I1, sw.routes, {})}</div></div></div>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Method (timed with the ML model)</th><th class="n">Trucks</th><th class="n">km</th><th class="n">Late</th><th class="n">Daily cost</th></tr></thead><tbody>
          <tr><td>Sweep + routing inside clusters</td><td class="n">${eS.trucks}</td><td class="n">${f.num(eS.km, 0)}</td><td class="n">${eS.late}</td><td class="n">${f.eur(eS.cost)}</td></tr>
          <tr><td>k-means + capacity repair + routing</td><td class="n">${eK.trucks}</td><td class="n">${f.num(eK.km, 0)}</td><td class="n">${eK.late}</td><td class="n">${f.eur(eK.cost)}</td></tr>
        </tbody></table></div>
        <div class="note info"><b>Takeaway:</b> clustering produces compact, map-friendly territories (drivers like them), but it decides the groups before it knows the time windows: a Budapest store and a far suburban store can end up on the same truck in the wrong order. The sweep method packs trucks tightly but may need an extra truck.</div>`;
    }
    $("#b-cl-run", root).onclick = () => { my.set("b_cl", true); renderCl(); };
    vote($("#b-cq", root), Object.assign({ mode: "quiz" }, LT.ACT.b_cq));
    gate($("#b-cl", root), [{ ok: () => !!my.get("b_ml"), text: "Train the travel-time models in step 3 first." }]);
    if (my.get("b_cl")) renderCl();

    /* ================= 5 · Heuristics ================= */
    function renderHeu() {
      const c = getCw(), sub = my.get("b_sub");
      const plans = [
        { n: "Nearest neighbour (dispatcher)", rs: nn1 },
        { n: "Clarke–Wright + local search, planned at 50 km/h", rs: c.disp },
        { n: "Clarke–Wright + local search, planned with ML times", rs: c.tree, best: true }
      ];
      if (sub) plans.push({ n: "Your plan", rs: sub.routes, me: true });
      const ev = plans.map(p => Object.assign(p, { d: V.evaluate(I1, p.rs, "dispatcher"), m: V.evaluate(I1, p.rs, "tree"), r: V.evaluate(I1, p.rs, "truth") }));
      const best = ev.find(p => p.best);
      $("#b-heu-out", root).innerHTML = `<div class="tbl-wrap"><table class="small-tbl"><thead><tr><th rowspan="2">Plan</th><th class="n" rowspan="2">Trucks</th><th class="n" rowspan="2">km</th><th class="n" colspan="2">Cost as planned at 50 km/h</th><th class="n" colspan="2">Cost with ML times</th><th class="n" colspan="2">Cost in reality</th></tr>
        <tr><th class="n">€</th><th class="n">late</th><th class="n">€</th><th class="n">late</th><th class="n">€</th><th class="n">late</th></tr></thead><tbody>
        ${ev.map(p => `<tr ${p.me ? 'class="me"' : ""}><td>${esc(p.n)}</td><td class="n">${p.m.trucks}</td><td class="n">${f.num(p.m.km, 0)}</td><td class="n">${f.num(p.d.cost)}</td><td class="n">${p.d.late}</td><td class="n">${f.num(p.m.cost)}</td><td class="n">${p.m.late}</td><td class="n"><b>${f.num(p.r.cost)}</b></td><td class="n">${p.r.late}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="grid g2e"><div class="map-wrap">${mapSvg(I1, best.rs, {})}</div><div class="routes">${routeCards(I1, best.m, best.rs, {})}</div></div>
        <div class="note info"><b>Read the last columns:</b> the plan made with the 50 km/h rule looks cheapest on paper, but in reality it pays for late stores. The same algorithm fed with ML travel times makes a plan that keeps its promise. Algorithm and data quality work together.</div>`;
      guessB.reveal(String(Math.min(best.m.trucks, 6)));
    }
    $("#b-heu-run", root).onclick = () => { my.set("b_heu", true); renderHeu(); };
    gate($("#b-heu", root), [{ ok: () => !!my.get("b_ml"), text: "Train the travel-time models in step 3 first." }]);
    if (my.get("b_heu")) renderHeu();

    /* ================= 6 · AI-written heuristic ================= */
    const plain = { d1: V.plain(I1, "tree"), d2: V.plain(I2, "tree") };
    const ref = (() => {
      const c = getCw();
      const nnr = { d1: V.evaluate(I1, V.nearest(I1), "tree").cost, d2: V.evaluate(I2, V.nearest(I2), "tree").cost };
      const cwr = { d1: V.evaluate(I1, c.tree, "tree").cost, d2: V.evaluate(I2, c.tree2, "tree").cost };
      return { nn: nnr.d1 + nnr.d2, cw: cwr.d1 + cwr.d2, nnr, cwr };
    })();
    const codeEl = $("#b-code", root);
    codeEl.value = my.get("b_code", V.RULES.nearest);
    codeEl.addEventListener("input", () => my.put("b_code", codeEl.value));
    $("#b-load-nn", root).onclick = () => { codeEl.value = V.RULES.nearest; my.put("b_code", codeEl.value); };
    $("#b-load-urg", root).onclick = () => { codeEl.value = V.RULES.urgent; my.put("b_code", codeEl.value); };
    const prompt1 = () => `You are an expert in vehicle routing heuristics. Write a JavaScript scoring function for a greedy route-construction engine.

THE ENGINE (already implemented, do not rewrite it): it builds routes one truck at a time from a depot. At each step it calls score(c, s) for every unvisited store that still fits in the current truck and drives to the store with the LOWEST score. If score returns a non-finite value (Infinity, NaN) for ALL candidates, the truck returns to the depot and the next truck starts. The engine itself guarantees capacity and that every store is visited exactly once.

c (the candidate store), read-only:
  c.km, c.min        distance (km) and predicted travel time (minutes) from the current position
  c.arrive           predicted arrival time (minutes after midnight, e.g. 570 = 09:30)
  c.open, c.close    delivery window (minutes after midnight); arriving early means waiting, after close is late
  c.slack            c.close - c.arrive (negative = would be late)
  c.wait             minutes of waiting if early; c.late: true if it would be late
  c.pallets          pallets to unload; c.service: unloading minutes
  c.finish           time we would leave this store
  c.kmToDepot, c.minToDepot   distance and minutes from this store back to the depot
  c.urban            0 = open road, 1 = inner city (city traffic is very slow 06:30-09:30)
  c.angle            compass angle of the store seen from the depot, degrees (-180..180)
s (the state), read-only:
  s.clock            current time (minutes after midnight); trucks leave the depot at 360 (06:00)
  s.load, s.room     pallets on this truck, free space (capacity ${VP.cap})
  s.route, s.stopsInRoute, s.atDepot   truck number (1, 2, ...), stops so far on it, true at a route start
  s.storesLeft, s.palletsLeft, s.trucksMin   what is still unvisited; minimum trucks still needed
  s.shiftEnd         ${VP.shiftEnd} (14:30): returning later costs overtime

COST TO MINIMISE (per day): ${VP.fixDay} EUR per truck used + ${VP.perKm} EUR per km + ${VP.latePenalty} EUR per store reached after its window closes + ${VP.overtime} EUR per hour of overtime after 14:30.
TYPICAL DAY: about 19 stores and 50 pallets around Budapest. Inner-city stores (urban close to 1) have windows ending 09:30 and are slow to reach in the morning rush; suburban stores have windows ending 11:00-13:00. Your function will be tested on two different days, so do not hard-code store IDs.

RULES FOR THE CODE: one pure function named score with the signature function score(c, s) { ... }; no global variables, no state between calls, no external calls, plain JavaScript (ES2017). Return a number.
ANSWER FORMAT: the code in one \`\`\`javascript block, then at most 5 bullet points explaining the idea.`;
    const showP1 = () => ($("#b-ai-ptext", root).textContent = prompt1());
    $("#b-ai-pdet", root).addEventListener("toggle", showP1);
    $("#b-ai-p1", root).onclick = async () => { showP1(); const ok = await copy(prompt1()); toast(ok ? "Prompt copied. Paste it into the AI!" : "Copy failed: open the prompt and copy it by hand.", ok ? "" : "err"); };

    // Sandbox: a Web Worker without network access, killed after 4 seconds
    function runSandbox(code) {
      const body = `"use strict";
        ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"].forEach(function (k) { try { self[k] = undefined; } catch (e) { /* not writable */ } });
        ${V.construct.toString()}
        self.onmessage = function (e) {
          try {
            var score = (new Function('"use strict";\\n' + e.data.code + '\\n;return score;'))();
            if (typeof score !== "function") throw new Error("score is not a function");
            var out = {}; for (var k in e.data.inst) out[k] = kestrelConstruct(e.data.inst[k], score);
            self.postMessage({ ok: true, out: out });
          } catch (err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); }
        };`;
      return new Promise(resolve => {
        let w;
        try { w = new Worker(URL.createObjectURL(new Blob([body], { type: "text/javascript" }))); }
        catch (e) {
          // fallback without isolation (some browsers block workers on file://)
          try { const score = new Function('"use strict";\n' + code + "\n;return score;")(); const out = {}; for (const k in plain) out[k] = V.construct(plain[k], score); resolve({ ok: true, out, unsafe: true }); }
          catch (err) { resolve({ ok: false, error: String(err.message || err) }); }
          return;
        }
        const t = setTimeout(() => { w.terminate(); resolve({ ok: false, error: "Time limit (4 s) exceeded: the code is too slow or loops forever." }); }, 4000);
        w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
        w.onerror = e => { clearTimeout(t); w.terminate(); resolve({ ok: false, error: e.message || "worker error" }); };
        w.postMessage({ code, inst: plain });
      });
    }
    let lastRun = null;
    async function run() {
      let code;
      try { code = PR.code(codeEl.value); } catch (e) { $("#b-run-out", root).innerHTML = `<div class="note bad"><b>${esc(e.message)}</b></div>`; return; }
      $("#b-run-out", root).innerHTML = `<div class="note info">Running in the sandbox…</div>`;
      const r = await runSandbox(code);
      if (!r.ok) { $("#b-run-out", root).innerHTML = `<div class="note bad"><b>The code failed:</b> ${esc(r.error)}</div>`; lastRun = { code, error: r.error }; return; }
      const e1 = V.evaluate(I1, r.out.d1.routes, "tree"), e2 = V.evaluate(I2, r.out.d2.routes, "tree");
      const total = e1.cost + e2.cost;
      const warn = [].concat(r.out.d1.warnings, r.out.d2.warnings);
      lastRun = { code, e1, e2, total, r1: r.out.d1.routes, r2: r.out.d2.routes, warn };
      const hist = my.get("b_hist", []);
      hist.push({ t: Date.now(), total: Math.round(total), d1: Math.round(e1.cost), d2: Math.round(e2.cost) });
      my.put("b_hist", hist.slice(-20));
      const dayRow = (n, e, nnv, cwv) => `<tr><td>${n}</td><td class="n">${e.trucks}</td><td class="n">${f.num(e.km, 0)}</td><td class="n">${e.late}</td><td class="n">${f.num(e.otMin, 0)}</td><td class="n"><b>${f.eur(e.cost)}</b></td><td class="n">${f.eur(nnv)}</td><td class="n">${f.eur(cwv)}</td></tr>`;
      $("#b-run-out", root).innerHTML = `
        ${r.unsafe ? `<div class="note warn">Your browser blocked the sandbox worker, so the code ran without isolation and without a time limit.</div>` : ""}
        ${warn.length ? `<div class="note warn">${esc(warn[0])}</div>` : ""}
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Day</th><th class="n">Trucks</th><th class="n">km</th><th class="n">Late</th><th class="n">Overtime min</th><th class="n">Your heuristic</th><th class="n">Nearest neighbour</th><th class="n">Clarke–Wright + LS</th></tr></thead><tbody>
          ${dayRow("Friday", e1, ref.nnr.d1, ref.cwr.d1)}${dayRow("Monday", e2, ref.nnr.d2, ref.cwr.d2)}
          <tr class="me"><td><b>Total (contest value)</b></td><td></td><td></td><td></td><td></td><td class="n"><b>${f.eur(total)}</b></td><td class="n">${f.eur(ref.nn)}</td><td class="n">${f.eur(ref.cw)}</td></tr>
        </tbody></table></div>
        <div class="note ${total < ref.nn ? "ok" : "warn"}"><b>${total < ref.cw ? "Remarkable: your construction rule beats Clarke–Wright with local search!" : total < ref.nn ? `Better than nearest neighbour by ${f.eur(ref.nn - total)} over two days.` : "Not better than nearest neighbour yet."}</b> Evaluated with the ML travel-time model.</div>
        <div class="grid g2e"><div><b>Friday</b><div class="map-wrap">${mapSvg(I1, r.out.d1.routes, { late: e1.details.flatMap(d => d.stops.filter(s => s.late).map(s => s.id)) })}</div></div>
          <div><b>Monday</b><div class="map-wrap">${mapSvg(I2, r.out.d2.routes, { late: e2.details.flatMap(d => d.stops.filter(s => s.late).map(s => s.id)) })}</div></div></div>
        <small>Red ring = late store. The engine called your function ${f.num(r.out.d1.calls + r.out.d2.calls)} times.</small>
        <div class="btn-row"><button class="btn accent" id="b-submit">Submit this version to the contest</button><button class="btn ai" id="b-p2">Copy feedback prompt (next round)</button></div>`;
      $("#b-submit", root).onclick = async () => {
        if (!lastRun || !lastRun.e1) return;
        my.set("done_b_heur", true);
        await submit({ activity: "b_heur", kind: "result", value: Math.round(lastRun.total), dir: "min", text: lastRun.code.slice(0, 5500) }, `Submitted: ${f.eur(lastRun.total)} (your best counts)`);
      };
      $("#b-p2", root).onclick = async () => {
        const det = (e, n) => `${n}: cost ${Math.round(e.cost)} EUR = ${e.trucks} trucks, ${Math.round(e.km)} km, ${e.late} late stores, ${Math.round(e.otMin)} overtime minutes\n` +
          e.details.map((d, k) => `  truck ${k + 1}: ${d.stops.map(s => `${s.id}(${f.clock(s.arrive)}${s.late ? " LATE, window closes " + f.clock(s.close) : ""})`).join(" > ")} | ${d.load} pallets, back ${f.clock(d.back)}`).join("\n");
        const txt = `Your scoring function was tested in the engine. Results (travel times from the ML model):
${det(lastRun.e1, "Friday")}
${det(lastRun.e2, "Monday")}
Total over two days: ${Math.round(lastRun.total)} EUR. For comparison: nearest neighbour (return c.km) ${Math.round(ref.nn)} EUR; Clarke-Wright savings with local search ${Math.round(ref.cw)} EUR.

Your code:
\`\`\`javascript
${lastRun.code}
\`\`\`

Analyse what goes wrong (late stores, wasted kilometres, extra trucks, overtime) and write an improved score(c, s). Same interface and rules as before; do not hard-code store IDs. Answer with the code in one \`\`\`javascript block, then at most 5 bullet points.`;
        const ok = await copy(txt); toast(ok ? "Feedback prompt copied." : "Copy failed.", ok ? "" : "err");
      };
      renderHist();
    }
    function renderHist() {
      const h = my.get("b_hist", []);
      if (h.length < 2) { $("#b-hist", root).innerHTML = ""; return; }
      $("#b-hist", root).innerHTML = `<b>Your runs</b> (two-day cost, lower is better)${lines([{ name: "your runs", color: "#005f92", points: h.map((x, i) => ({ x: i + 1, y: x.total })) }, { name: "nearest neighbour", color: "#888888", dash: "4 4", dots: false, points: [{ x: 1, y: ref.nn }, { x: h.length, y: ref.nn }] }, { name: "Clarke–Wright + LS", color: "#007548", dash: "4 4", dots: false, points: [{ x: 1, y: ref.cw }, { x: h.length, y: ref.cw }] }], { yfmt: v => f.num(v), title: "run history" })}`;
    }
    renderHist();
    $("#b-run", root).onclick = run;
    board($("#b-heur-board", root), "b_heur", { unit: "€/2 days", fmt: v => f.num(v) });
    textBox($("#b-ai-refl", root), Object.assign({}, LT.ACT.b_ai, { points: 4, placeholder: "I used … The key idea was … It failed when … I would / would not trust it because …", button: "Submit judgement", minWords: 35, okMsg: "Judgement submitted: +4 points", option: () => { const h = my.get("b_hist", []); return h.length ? `${h.length} runs, best ${f.eur(Math.min(...h.map(x => x.total)))}` : ""; } }));
    gate($("#b-ai", root), [{ ok: () => !!my.get("b_heu"), text: "Run the classic heuristics in step 5 first." }]);

    /* ================= 7 · Decision ================= */
    textBox($("#b-dec", root), Object.assign({}, LT.ACT.b_dec, { placeholder: "I recommend …", button: "Submit recommendation", minWords: 30, okMsg: "Recommendation submitted: +2 points" }));
    gate($("#b-dec-card", root), [{ ok: ownDone, text: "Submit your own plan first." }, { ok: () => !!my.get("b_heu"), text: "Run the heuristics in step 5 first." }]);
  };
})();
