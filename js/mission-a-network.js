/* Session A: distribution network design.
   Own design → MILP solver → demand forecasting (ML) → 2030 re-optimisation → k-means candidates
   → AI as modeller (JSON spec + solver) → robustness (minimax regret) → decision memo */
(function () {
  const LT = (window.LT = window.LT || {});
  LT.missions = LT.missions || {};
  const COL = { D1: "#007548", D2: "#005f92", D3: "#a1772b", D4: "#00afa9", D5: "#f08681", D6: "#38ac55", D7: "#008cc7" };
  const KCOL = ["#005f92", "#a1772b", "#00afa9", "#f08681", "#38ac55", "#008cc7"];

  LT.missions.a = function (root) {
    const { esc, $, $$, my, done, vote, voted, board, textBox, aiCard, gate, step, kpi, submit, toast, method, lines, copy } = LT.ui;
    const D = LT.data, { F, H, K, A, P: PR, fmt: f } = LT.core;
    const d25 = F.demand("actual2025"), d30 = F.demand("pooled2030");
    const tot25 = F.total(d25), tot30 = F.total(d30);
    const today = H.solve({}, { open: ["D1"], demand: d25 });
    let opt25 = null, opt30 = null;
    const getOpt25 = () => (opt25 = opt25 || H.solve({}, { demand: d25 }));
    const getOpt30 = () => (opt30 = opt30 || H.solve({}, { demand: d30 }));
    const ownDone = () => done("a_own");
    const N = D.NET;
    const dcName = id => H.dc(id).short;

    root.innerHTML = `
      <div class="mission-head mh-1"><div class="eyebrow">Session A · Network design · 90 minutes</div>
        <h2>How many DCs should Kestrel run in 2030, and where?</h2>
        <p>Today every pallet goes from the two plants to the big Ecser DC next to Budapest, and from there to all 20 customer hubs, even to Szombathely or Nyíregyháza, 250 km away. The CEO asks: <i>“Should we open regional DCs? Leases are expensive, but so is trucking. And please don't design for last year: design for 2030.”</i></p></div>

      <div class="card">
        <h3>The trade-off</h3>
        <p>Every DC has a <b>fixed annual cost</b> (lease, staff, systems). In return it is <b>closer to the customers</b>: delivery is shorter and cheaper, and more customers get next-day service. Full trucks from the plants to the DCs are cheap per pallet-km; multi-drop deliveries from a DC to the customers are about seven times as expensive. Where is the point at which one more DC costs more than it saves?</p>
        <div class="kpis">
          <div class="kpi"><div class="l">Plant → DC</div><div class="v">€${N.inbound.toFixed(2)}</div><div class="d">per pallet per km (full truck)</div></div>
          <div class="kpi"><div class="l">DC → customer</div><div class="v">€${N.outbound.toFixed(2)}</div><div class="d">per pallet per km (multi-drop)</div></div>
          <div class="kpi"><div class="l">Demand 2025</div><div class="v">${f.num(tot25)}</div><div class="d">pallets / year, 20 customers</div></div>
          <div class="kpi"><div class="l">Next-day zone</div><div class="v">${N.fastKm} km</div><div class="d">road distance from the serving DC</div></div>
        </div>
        <details class="mini"><summary>Candidate DCs and plants</summary>
          <table class="small-tbl"><thead><tr><th>Site</th><th class="n">Fixed cost (€k / year)</th><th class="n">Capacity (pallets / year)</th></tr></thead><tbody>
          ${D.DCS.map(j => `<tr><td><span class="lamp" style="background:${COL[j.id]}"></span>${j.id} ${esc(j.name)}${j.existing ? " <small>(today's only DC)</small>" : ""}</td><td class="n">${j.fix}</td><td class="n">${f.num(j.cap)}</td></tr>`).join("")}
          ${D.PLANTS.map(p => `<tr><td>▲ ${p.id} ${esc(p.name)}</td><td class="n">–</td><td class="n">${f.num(p.cap)} (production)</td></tr>`).join("")}
          </tbody></table></details>
        <details class="mini"><summary>The model in mathematical form (two-echelon capacitated facility location)</summary>
          <p>This is a <b>mixed-integer linear program</b> (MILP): opening a DC is a yes/no decision, the flows are continuous. The solver handles both kinds of decisions at once.</p>
          <div class="keplet">
            <div class="sor"><span class="cimke">Decisions</span><div><div class="mat"><i>y<sub>j</sub></i> ∈ {0,1}, &nbsp; <i>x<sub>ij</sub></i> ∈ [0,1], &nbsp; <i>f<sub>pj</sub></i> ≥ 0</div><div class="szoveg">Open DC <i>j</i> or not; the share of customer <i>i</i>'s demand served from DC <i>j</i>; pallets shipped from plant <i>p</i> to DC <i>j</i>.</div></div></div>
            <div class="sor"><span class="cimke">Objective</span><div><div class="mat">min Σ<sub>j</sub> F<sub>j</sub> y<sub>j</sub> + Σ<sub>p,j</sub> a·dist<sub>pj</sub>·f<sub>pj</sub> + Σ<sub>i,j</sub> b·d<sub>i</sub>·dist<sub>ji</sub>·x<sub>ij</sub></div><div class="szoveg">Fixed cost of the open DCs + inbound full-truck cost + outbound delivery cost.</div></div></div>
            <div class="sor"><span class="cimke">Demand</span><div><div class="mat">Σ<sub>j</sub> x<sub>ij</sub> = 1 &nbsp; for every customer i</div><div class="szoveg">Every customer is fully served.</div></div></div>
            <div class="sor"><span class="cimke">DC capacity</span><div><div class="mat">Σ<sub>i</sub> d<sub>i</sub> x<sub>ij</sub> ≤ K<sub>j</sub> y<sub>j</sub></div><div class="szoveg">A DC ships at most its capacity, a closed DC ships nothing.</div></div></div>
            <div class="sor"><span class="cimke">Flow balance</span><div><div class="mat">Σ<sub>p</sub> f<sub>pj</sub> = Σ<sub>i</sub> d<sub>i</sub> x<sub>ij</sub></div><div class="szoveg">What goes out of a DC must come in from the plants.</div></div></div>
            <div class="sor"><span class="cimke">Plant capacity</span><div><div class="mat">Σ<sub>j</sub> f<sub>pj</sub> ≤ C<sub>p</sub></div><div class="szoveg">A plant cannot ship more than it produces.</div></div></div>
            <div class="sor"><span class="cimke">Link</span><div><div class="mat">x<sub>ij</sub> ≤ y<sub>j</sub></div><div class="szoveg">Customers can only be served from open DCs (a tighter formulation that helps the solver).</div></div></div>
          </div>
          <table class="jelmagy small-tbl"><tbody>
            <tr><td>F<sub>j</sub>, K<sub>j</sub></td><td>fixed annual cost (€k) and capacity (pallets/year) of DC j</td></tr>
            <tr><td>C<sub>p</sub></td><td>annual capacity of plant p</td></tr>
            <tr><td>d<sub>i</sub></td><td>annual demand of customer i (pallets): 2025 actuals, or the 2030 forecast later</td></tr>
            <tr><td>a, b</td><td>inbound €${N.inbound.toFixed(2)} and outbound €${N.outbound.toFixed(2)} per pallet-km</td></tr>
            <tr><td>dist</td><td>road distance ≈ ${N.roadFactor} × straight-line distance</td></tr>
          </tbody></table>
          <small>7 candidate DCs give 2<sup>7</sup> − 1 = 127 possible networks; the model has ${7 + 7 * 20 + 14} variables.</small>
        </details>
      </div>

      ${method("Method: how does the solver find the optimal network?", "Linear programming, LP relaxation, branch and bound, limits of the model", `
        <h4>1. Linear programming (LP)</h4>
        <p>In an LP the objective (annual cost) and every constraint are <b>linear</b> in the decision variables: cost grows proportionally with the pallets shipped, there are no products of variables and no thresholds. The feasible solutions form a convex polyhedron and the optimum is always at one of its <b>corners</b>. The <b>simplex method</b> walks from corner to corner, always in a cost-reducing direction, until no neighbouring corner is better.</p>
        <h4>2. Why “mixed-integer”?</h4>
        <p>Opening a DC is a yes/no decision (y = 0 or 1): you cannot lease 0.4 of a warehouse. Integer variables break the nice LP geometry, so the solver uses <b>branch and bound</b>:</p>
        <ol class="tight">
          <li><b>LP relaxation:</b> solve the problem as if y could be any number between 0 and 1. The result is usually not a real network, but its cost is a <b>lower bound</b>: the true optimum cannot be cheaper.</li>
          <li><b>Branching:</b> if some y is fractional, split into two subproblems: DC closed (y = 0) and DC open (y = 1), and solve both as LPs.</li>
          <li><b>Bounding:</b> if a branch's lower bound is already worse than the best real network found so far, discard the whole branch.</li>
          <li><b>Stop:</b> when no branch is left open, the best integer solution found is <b>proven optimal</b>.</li>
        </ol>
        <p>With 7 candidates (127 networks) we could even try everything; the method pays off in practice, where 50 candidate sites give 2<sup>50</sup> ≈ 10<sup>15</sup> combinations.</p>
        <h4>3. How your own design is evaluated</h4>
        <p>When you choose the open DCs, all y are fixed. What remains (which DC serves which customer, which plant supplies which DC, within all capacities) is a plain LP, a <b>capacitated transportation problem</b>. The page solves it at every click.</p>
        <h4>4. What the model does not know</h4>
        <ul class="tight">
          <li>Road distance is approximated as ${N.roadFactor} × straight line; there is no real road network.</li>
          <li>Transport cost is linear: no volume discounts, no minimum shipment sizes, no tolls.</li>
          <li>One deterministic year of demand. Which year? That is exactly the question of the forecasting step.</li>
          <li>No inventory: more DCs in reality also mean more safety stock (remember week 4: safety stock grows with the number of stocking points).</li>
        </ul>
        <p class="muted"><small>In the browser the page uses the open-source javascript-lp-solver. In Python the same model would be written with PuLP, Pyomo or OR-Tools and solved with HiGHS, CBC or Gurobi.</small></p>`)}

      <div class="card" id="a-guess">${step("1 · Guess", "tipp", "Before calculating anything", "+5 points if right")}</div>

      <div class="card" id="a-own">
        ${step("2 · Your own design", "verseny", "Design the network for 2025 demand", "contest: lowest total annual cost")}
        <div class="note info big-note"><b>Contest rule:</b> only the <b>total annual cost</b> counts (fixed + inbound + outbound), on 2025 demand. You also see the next-day service share; it does not count in the contest, but it should count in your judgement.</div>
        <p>Click the <b>squares</b> (candidate DCs) to open or close them. The page assigns every customer to the cheapest open DC and every DC to the cheapest plant, within all capacities, and recalculates the cost instantly. Experiment freely; you can <b>submit once</b>.</p>
        <div class="grid g2">
          <div class="map-wrap"><div id="a-map"></div>
            <div class="legend"><span>▲ plant</span><span><i style="border:2px dashed var(--ink-2);background:none"></i>closed candidate DC</span><span><i style="background:var(--brand)"></i>open DC</span><span><i style="background:var(--ink-3);border-radius:50%"></i>customer (size = demand)</span><span>dashed line: plant → DC flow</span></div></div>
          <div>
            <div id="a-kpi"></div>
            <div id="a-breakdown"></div>
            <div class="btn-row" id="a-buttons"></div>
            <h4 style="margin-top:14px">Network contest</h4><div id="a-board"></div>
          </div>
        </div>
      </div>

      <div class="card" id="a-solver">
        ${step("3 · Solver", "algo", "The MILP solver finds the optimum for 2025")}
        <p>The solver returns the provably cheapest network <b>within the model</b>. Whatever the model does not contain (lease market, labour, risk) the solver cannot see.</p>
        <div class="btn-row"><button class="btn primary" id="a-solve">Run the solver</button></div>
        <div id="a-opt"></div>
      </div>

      <div class="card" id="a-fc-card">
        ${step("4 · Machine learning", "kviz", "Forecast demand for 2030", "+5 points if your guess is right")}
        <p>A DC lease runs for 10 years, so the network must fit <b>future</b> demand. Kestrel has six years of history per customer, plus three <b>demand drivers</b> from public statistics (2020–2022 averages, so they were already known when the backtest starts): new homes per 1,000 residents, employment growth, and the share of households living in detached houses (households with a garden buy garden products). Three candidate models:</p>
        <div class="method-flow">
          <div><b>Naive</b>Next years = last year. The benchmark every model must beat.</div>
          <div><b>Per-customer trend</b>A straight line (on log scale) through each customer's own 6 points, extended to 2030.</div>
          <div><b>Pooled regression (ML)</b>Learns, across all 20 customers, how growth depends on the three drivers; each customer's level comes from its own history.</div>
        </div>
        <details class="mini"><summary>The data: history and drivers per customer</summary><div class="tbl-wrap" id="a-fc-data"></div></details>
        <div id="a-fc-guess"></div>
        <div id="a-fc-block" style="margin-top:10px">
          <div class="btn-row"><button class="btn primary" id="a-fc-run">Run the backtest (train 2020–2023, test 2024–2025)</button></div>
          <div id="a-fc-out"></div>
          <div id="a-fc-own"></div>
        </div>
      </div>

      ${method("Method: forecasting as supervised machine learning", "Backtesting, WAPE, overfitting, pooling information across customers", `
        <h4>1. Why not just extend each customer's own trend?</h4>
        <p>Six yearly points per customer are very little data. Year-to-year noise in this business is about ±7% (weather, promotions, a chain changing its stocking policy). A straight line through 4–6 noisy points has a very uncertain slope, and extending it 5 years multiplies that uncertainty. The model fits the past well and the future badly: that is <b>overfitting</b>, here with only two parameters per customer.</p>
        <h4>2. Pooling: learning across customers</h4>
        <p>The pooled model is a small <b>supervised learning</b> problem:</p>
        <ol class="tight">
          <li>For every customer estimate the historical growth rate (slope of log demand over the years).</li>
          <li>Fit a linear regression across the 20 customers: <span class="keplet-sor" style="display:inline">growth = β<sub>0</sub> + β<sub>1</sub>·housing + β<sub>2</sub>·jobs + β<sub>3</sub>·detached</span>. The noisy individual slopes are the training labels, the drivers are the features.</li>
          <li>Use the <b>predicted</b> growth rate instead of each customer's own noisy slope. The customer's level is estimated from all of its own observations, given that growth rate.</li>
        </ol>
        <p>The individual noise averages out across customers; what remains is the systematic relationship. This is the same idea that makes global ML forecasting models (one model across thousands of SKUs) beat one-model-per-series approaches in large forecasting competitions.</p>
        <h4>3. Backtesting (time-series cross-validation)</h4>
        <p>We pretend it is the end of 2023: every model is trained only on 2020–2023, then forecasts 2024 and 2025, which we know. The error on these <b>unseen</b> years estimates how the model will do on 2030. Never judge a forecasting model on the data it was trained on.</p>
        <div class="keplet-sor">WAPE = Σ |forecast − actual| / Σ actual</div>
        <p>WAPE (weighted absolute percentage error) weights big customers more, which is what matters for network design. We also report the <b>bias</b> (do we systematically over- or under-forecast?).</p>
        <h4>4. Limits</h4>
        <ul class="tight">
          <li>Two test years is a short backtest; the ranking is evidence, not proof.</li>
          <li>The drivers themselves are forecasts for the future (housing starts can change with interest rates).</li>
          <li>A point forecast hides uncertainty. That is why the robustness step tests the network under different demand scenarios.</li>
        </ul>`, "ƒ")}

      <div class="card" id="a-2030">
        ${step("5 · Re-optimise", "tipp", "Design for 2030 instead of 2025", "+5 points if your guess is right")}
        <div id="a-shift-guess"></div>
        <div id="a-2030-block" style="margin-top:10px">
          <div class="btn-row"><button class="btn primary" id="a-2030-run">Solve with the 2030 forecast</button></div>
          <div id="a-2030-out"></div>
        </div>
      </div>

      <div class="card" id="a-km">
        ${step("6 · Unsupervised ML", "algo", "k-means: where are the natural centres of demand?")}
        <p>Clustering is the classic quick way to propose DC locations: group the customers into <i>k</i> clusters and put a DC at each cluster's demand-weighted centre (the “centre of gravity”). Then we snap every centre to the nearest candidate site and let the LP evaluate that network. Is it as good as the solver?</p>
        <div class="grid g2e">
          <div>
            <div class="slider-row"><label for="a-k">Number of clusters (k)</label><output id="a-k-out">3</output><input type="range" id="a-k" min="1" max="6" step="1" value="3"></div>
            <div class="btn-row"><button class="btn primary" id="a-k-run">Run k-means on 2030 demand</button></div>
            <div id="a-k-res"></div>
          </div>
          <div class="map-wrap"><div id="a-k-map"></div><div class="legend"><span>✚ cluster centre</span><span>■ nearest candidate DC</span><span>colour = cluster</span></div></div>
        </div>
        <div id="a-k-elbow"></div>
        <div id="a-kq" style="margin-top:12px"></div>
      </div>

      ${method("Method: k-means clustering", "Lloyd's algorithm, k-means++, the elbow method, why it is only a candidate generator", `
        <h4>1. The objective</h4>
        <p>k-means looks for <i>k</i> centres c<sub>1</sub>…c<sub>k</sub> that minimise the demand-weighted squared distance of every customer to its nearest centre:</p>
        <div class="keplet-sor">min Σ<sub>i</sub> w<sub>i</sub> · min<sub>m</sub> ‖ position<sub>i</sub> − c<sub>m</sub> ‖²</div>
        <h4>2. Lloyd's algorithm</h4>
        <ol class="tight">
          <li><b>Start:</b> choose k starting centres. <i>k-means++</i> picks them far apart: each new centre is drawn with probability proportional to w·(distance to the nearest existing centre)².</li>
          <li><b>Assign:</b> every customer joins its nearest centre.</li>
          <li><b>Update:</b> every centre moves to the demand-weighted average position of its customers.</li>
          <li><b>Repeat</b> 2–3 until no customer changes cluster. The result depends on the start, so we run 12 restarts and keep the best.</li>
        </ol>
        <h4>3. Choosing k: the elbow</h4>
        <p>The average distance to the centre always falls as k grows (with k = 20 it is zero). Look for the “elbow” where the curve flattens: beyond it, extra clusters buy little. In network design the elbow has a cost interpretation: is the saved delivery distance worth one more fixed cost?</p>
        <h4>4. What k-means does not see</h4>
        <ul class="tight">
          <li>Fixed costs and capacities of the DCs, and the plants (inbound flows).</li>
          <li>Road networks: it measures straight lines on the map.</li>
          <li>Business constraints (service radius, sites that are not available).</li>
        </ul>
        <p>That is why practitioners use clustering to <b>generate candidate sites</b> quickly in large problems (thousands of customers, no candidate list yet), and an optimisation model to <b>decide</b>.</p>`, "◎")}

      <div id="a-ai"></div>

      ${method("Method: the LLM + solver pattern", "Structured output, schema validation, why the language model should formulate and the solver should solve", `
        <h4>1. Why not ask the chatbot for the best network?</h4>
        <p>A large language model predicts plausible text. It does not run branch and bound, and when it adds up 20 × 7 costs it estimates rather than computes. Asking it for the optimal network gives a confident, often wrong answer. Yet language models are very good at something solvers cannot do at all: <b>reading a messy business document</b> and turning it into precise parameters.</p>
        <h4>2. Division of labour</h4>
        <div class="method-flow">
          <div><b>1 · Human</b>Writes the requirements in plain language (the CEO's memo).</div>
          <div><b>2 · LLM</b>Translates them into a <b>structured specification</b> (JSON) following a fixed schema.</div>
          <div><b>3 · Validator</b>Checks the schema: types, allowed values, known IDs. Rejects or flags what does not fit.</div>
          <div><b>4 · Solver</b>Builds the constraints from the spec and computes the provable optimum.</div>
          <div><b>5 · Human</b>Reviews the spec and the result, and decides.</div>
        </div>
        <p>This is the architecture behind <b>function calling / tool use</b> in modern AI systems: the model does not do the computation, it calls a tool with well-formed arguments. In operations research it is often called <b>LLM-assisted modelling</b> or optimisation copilots.</p>
        <h4>3. Typical failure modes to look for</h4>
        <ul class="tight">
          <li><b>Wishes become constraints:</b> “Marketing would love a DC in Pécs” is not a requirement. A model that forces Pécs open changes the answer.</li>
          <li><b>Preferences become hard limits:</b> “I'd prefer fewer sites” is not “max 3 DCs”.</li>
          <li><b>Wrong units or wrong base:</b> 90% of what? Plant capacity, not total demand.</li>
          <li><b>Wrong data basis:</b> designing for 2025 actuals although the memo asks for 2030.</li>
          <li><b>Invented IDs</b> that do not exist in the data.</li>
        </ul>
        <p>Because the spec is structured, every one of these can be checked field by field, which is impossible with a free-text answer.</p>`, "⚙")}

      <div class="card" id="a-rob">
        ${step("8 · Robustness", "algo", "Which network survives if the forecast is wrong?")}
        <p>Our 2030 forecast is one number per customer, but the future is uncertain. A classic way to choose robustly: evaluate the best candidate networks under several <b>demand scenarios</b> and look at the <b>regret</b> (how much more you pay than the best network for that scenario). The <b>minimax-regret</b> choice is the network whose worst-case regret is smallest.</p>
        <div class="btn-row"><button class="btn primary" id="a-rob-run">Run the scenario analysis</button></div>
        <div id="a-rob-out"></div>
      </div>

      <div class="card" id="a-dec-card">
        ${step("9 · Decision", "algo", "Your recommendation to the CEO", "+2 points")}
        <p>Three to five sentences: which network do you recommend for 2030, what does it cost compared with today, what service level does it give, which requirement from the memo drives the decision, and what is the main risk?</p>
        <div id="a-dec"></div>
      </div>

      <div class="card" id="a-rev">
        ${step("10 · Fast-forward", "tipp", `It is ${N.planYear}. What really happened?`)}
        <p>In real life you would wait five years for this. Because Kestrel is synthetic, the page knows how demand really develops (the forecasting models never saw this). Reveal it and see what every design decision would have cost.</p>
        <div class="btn-row"><button class="btn primary" id="a-rev-run">Reveal the real ${N.planYear} demand</button></div>
        <div id="a-rev-out"></div>
      </div>`;

    /* ================= Map ================= */
    const Pj = LT.core.projector(47.2, 19.4);
    function mapSvg(o) {
      o = o || {};
      const res = o.res, open = o.open || (res ? res.open : []), dem = o.demand || d25;
      const outline = D.HU_OUTLINE.map(([lon, lat]) => { const q = Pj({ lat, lon }); return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ");
      let s = `<svg viewBox="-275 -175 555 345" role="img" aria-label="Map of Hungary with plants, candidate DCs and customers"><polygon class="land" points="${outline}"></polygon>`;
      if (res && res.feasible) {
        for (const c of D.CUSTOMERS) {
          const j = res.assign[c.id]; if (!j) continue;
          const a = Pj(c), b = Pj(H.dc(j));
          s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${COL[j]}" stroke-width="1.6" stroke-opacity=".75"></line>`;
        }
        Object.keys(res.flows).forEach(k => {
          const [p, j] = k.split("_"), a = Pj(D.PLANTS.find(x => x.id === p)), b = Pj(H.dc(j));
          s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--ink-3)" stroke-width="${1 + res.flows[k] / 2500}" stroke-dasharray="6 4" stroke-opacity=".55"></line>`;
        });
      }
      if (o.clusters) {
        D.CUSTOMERS.forEach((c, q) => { const a = Pj(c), m = o.clusters.assign[q], cc = o.clusters.centers[m]; s += `<line x1="${a.x}" y1="${a.y}" x2="${cc.x}" y2="${cc.y}" stroke="${KCOL[m % KCOL.length]}" stroke-width="1.4" stroke-opacity=".7"></line>`; });
      }
      for (const j of D.DCS) {
        const q = Pj(j), on = open.includes(j.id);
        s += `<g class="${o.click ? "clickable" : ""}" data-r="${j.id}" ${o.click ? `tabindex="0" role="button" aria-pressed="${on}"` : ""} aria-label="${esc(j.name)} DC ${on ? "open" : "closed"}">
          <rect x="${q.x - 10}" y="${q.y - 10}" width="20" height="20" rx="4" fill="${on ? COL[j.id] : "var(--panel)"}" stroke="${COL[j.id]}" stroke-width="2.5" ${on ? "" : 'stroke-dasharray="4 3"'}></rect>
          <text x="${q.x}" y="${q.y - 14}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--ink)">${esc(j.short)}${on ? "" : " ?"}</text></g>`;
      }
      for (const c of D.CUSTOMERS) {
        const q = Pj(c), m = o.clusters ? D.CUSTOMERS.indexOf(c) : -1;
        s += `<circle cx="${q.x}" cy="${q.y}" r="${Math.sqrt(dem[c.id]) / 5.5}" fill="${m >= 0 ? KCOL[o.clusters.assign[m] % KCOL.length] : "var(--ink-2)"}" fill-opacity=".6" stroke="var(--panel)" stroke-width="1" pointer-events="none"><title>${esc(c.name)}: ${f.num(dem[c.id])} pallets</title></circle>`;
      }
      for (const p of D.PLANTS) {
        const g = Pj(p);
        s += `<path d="M${g.x},${g.y - 9} L${g.x + 8},${g.y + 6} L${g.x - 8},${g.y + 6} Z" fill="var(--accent)" stroke="var(--ink)" stroke-width="1"></path><text x="${g.x + 10}" y="${g.y + 15}" text-anchor="start" font-size="9" font-weight="700">${esc(p.short)} plant</text>`;
      }
      if (o.clusters) o.clusters.centers.forEach((c, m) => (s += `<text x="${c.x}" y="${c.y + 6}" text-anchor="middle" font-size="20" font-weight="800" style="fill:${KCOL[m % KCOL.length]}" stroke="var(--panel)" stroke-width="2" paint-order="stroke">✚</text>`));
      return s + "</svg>";
    }

    function breakdown(e, title) {
      if (!e.feasible) return `<div class="note bad"><b>Not feasible.</b> The open DCs cannot handle all demand (${f.num(tot25)} pallets / year). Open another DC.</div>`;
      return `<table class="small-tbl"><thead><tr><th>${title || "Cost element"}</th><th class="n">€k / year</th></tr></thead><tbody>
        <tr><td>Fixed cost of ${e.open.length} DC(s)</td><td class="n">${f.num(e.fixK, 1)}</td></tr>
        <tr><td>Inbound plant → DC</td><td class="n">${f.num(e.inK, 1)}</td></tr>
        <tr><td>Outbound DC → customer</td><td class="n">${f.num(e.outK, 1)}</td></tr>
        <tr><td><b>Total (this counts in the contest)</b></td><td class="n"><b>${f.num(e.total, 1)}</b></td></tr></tbody></table>`;
    }
    const kpis = (e, ref) => `<div class="kpis">
      ${kpi("Total annual cost", f.keur(e.total, 1), ref ? 100 * (e.total / ref.total - 1) : null, true)}
      ${kpi("Cost per pallet", f.eur(e.perPallet, 2), ref ? 100 * (e.perPallet / ref.perPallet - 1) : null, true)}
      ${kpi("Next-day service", f.pct(e.fastPct, 0), ref ? e.fastPct - ref.fastPct : null, false, " pp")}
      ${kpi("Avg. delivery distance", f.num(e.avgKm, 0) + " km")}</div>`;

    /* ================= 1 · Guess ================= */
    const guessA = vote($("#a-guess", root), Object.assign({ mode: "guess" }, LT.ACT.a_guess, {
      explain: () => { const o = getOpt25(); return `The optimum for 2025 has <b>${o.open.length} DCs</b> (${H.names(o.open)}).`; }
    }));

    /* ================= 2 · Own design ================= */
    let open = my.get("a_open", ["D1"]), cur = null;
    function restoreOwn() {
      const r = LT.ui.serverResult("a_own");
      if (!r || my.get("a_sub")) return false;
      const ids = String(r.option || "").split(",").filter(id => D.DCS.some(j => j.id === id));
      if (!ids.length) return false;
      const e = H.solve({}, { open: ids, demand: d25 });
      if (!e.feasible) return false;
      my.put("a_sub", { open: e.open, total: e.total, fastPct: e.fastPct });
      return true;
    }
    function renderOwn() {
      const locked = ownDone();
      if (locked) restoreOwn();
      if (locked && my.get("a_sub")) open = my.get("a_sub").open;
      cur = H.solve({}, { open, demand: d25 });
      $("#a-map", root).innerHTML = mapSvg({ res: cur, open, click: !locked });
      if (!locked) $$("#a-map [data-r]", root).forEach(g => {
        const tog = () => { const id = g.dataset.r; open = open.includes(id) ? open.filter(x => x !== id) : open.concat(id); my.put("a_open", open); renderOwn(); };
        g.addEventListener("click", tog);
        g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); tog(); } });
      });
      $("#a-kpi", root).innerHTML = cur.feasible ? kpis(cur, today) + `<small>Baseline (Ecser only): ${f.keur(today.total, 1)}, ${f.pct(today.fastPct, 0)} next-day service.</small>` : "";
      $("#a-breakdown", root).innerHTML = breakdown(cur);
      $("#a-buttons", root).innerHTML = locked
        ? `<div class="note ok"><b>Submitted (final):</b> ${esc(H.names(open))} · ${f.keur(my.get("a_sub") ? my.get("a_sub").total : cur.total, 1)}</div>`
        : `<button class="btn accent" id="a-send" ${cur.feasible ? "" : "disabled"}>Submit (final)</button><button class="btn small" id="a-reset">Back to today (Ecser only)</button>`;
      if (!locked) {
        $("#a-reset", root).onclick = () => { open = ["D1"]; my.put("a_open", open); renderOwn(); };
        $("#a-send", root).onclick = async () => {
          if (!cur.feasible || ownDone()) return;
          if (!confirm(`Submit this network (${H.names(cur.open)}, ${f.keur(cur.total, 1)})? It cannot be changed afterwards.`)) return;
          my.put("a_sub", { open: cur.open, total: cur.total, fastPct: cur.fastPct });
          my.set("done_a_own", true);
          renderOwn();
          await submit({ activity: "a_own", kind: "result", value: Math.round(cur.total * 10) / 10, dir: "min", option: cur.open.join(","), text: H.names(cur.open) + ` · ${f.pct(cur.fastPct, 0)} next-day` }, "Network submitted to the contest");
        };
      }
    }
    board($("#a-board", root), "a_own", { unit: "€k/yr", fmt: v => f.num(v, 1), detail: true });
    renderOwn();
    LT.api.onState(() => { if (ownDone() && !my.get("a_sub") && restoreOwn()) { renderOwn(); LT.ui.changed(); } });
    gate($("#a-own", root), [{ ok: voted("a_guess"), text: "Lock in your guess in step 1 first." }]);

    /* ================= 3 · Solver ================= */
    function renderOpt() {
      const o = getOpt25(), all = H.enumerate({}, d25).slice(0, 6), sub = my.get("a_sub");
      $("#a-opt", root).innerHTML = `
        <div class="grid g2e"><div class="map-wrap">${mapSvg({ res: o })}</div><div>
        ${kpis(o, today)}
        <div class="note ok"><b>Optimum for 2025:</b> ${esc(H.names(o.open))}, ${f.keur(o.total, 1)} per year (${f.pct(100 * (1 - o.total / today.total), 1)} below today).${sub ? ` Your network is ${f.pct(100 * (sub.total / o.total - 1), 1)} above the optimum.` : ""}</div>
        ${breakdown(o, "Optimal network")}</div></div>
        <h4>The six cheapest networks</h4>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Open DCs</th><th class="n">€k / year</th><th class="n">vs. optimum</th><th class="n">Next-day service</th></tr></thead><tbody>
        ${all.map(e => `<tr><td>${esc(H.names(e.open))}</td><td class="n">${f.num(e.total, 1)}</td><td class="n">+${f.num(100 * (e.total / o.total - 1), 1)}%</td><td class="n">${f.pct(e.fastPct, 0)}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="note info"><b>Think about it:</b> ${all.filter(e => e.total <= o.total * 1.02).length - 1} other network(s) are within 2% of the optimum, with different sites, service levels and exposure to demand changes. When the gap is that small, the decision is made by what is not in the model. And one thing is definitely not in this model: the future.</div>`;
      guessA.reveal(String(Math.min(o.open.length, 5)));
    }
    $("#a-solve", root).onclick = () => { my.set("a_solved", true); renderOpt(); };
    gate($("#a-solver", root), [{ ok: voted("a_guess"), text: "Lock in your guess first." }, { ok: ownDone, text: "Submit your own network in step 2 first." }]);
    if (my.get("a_solved")) renderOpt();

    /* ================= 4 · Forecasting ================= */
    $("#a-fc-data", root).innerHTML = `<table class="small-tbl"><thead><tr><th>Customer</th>${D.YEARS.map(y => `<th class="n">${y}</th>`).join("")}<th class="n">Housing</th><th class="n">Jobs %</th><th class="n">Detached %</th></tr></thead><tbody>
      ${D.CUSTOMERS.map(c => `<tr><td>${esc(c.name)}</td>${c.hist.map(v => `<td class="n">${f.num(v)}</td>`).join("")}<td class="n">${c.housing}</td><td class="n">${c.jobs}</td><td class="n">${c.detached}</td></tr>`).join("")}</tbody></table>`;
    const guessFc = vote($("#a-fc-guess", root), Object.assign({ mode: "guess" }, LT.ACT.a_fc, {
      explain: () => { const b = F.backtest(); return `Backtest WAPE: naive ${f.pct(b.res.naive.wape, 1)}, per-customer trend ${f.pct(b.res.trend.wape, 1)}, pooled regression ${f.pct(b.res.pooled.wape, 1)}. The per-customer trend hardly beats “no change” although demand really is trending: with 4 noisy points per customer its slopes are mostly noise. Pooling the customers averages that noise out.`; }
    }));
    gate($("#a-fc-block", root), [{ ok: voted("a_fc"), text: "Lock in your guess about the forecast models first." }]);
    const corr = (a, b) => {
      const xs = D.CUSTOMERS.map(c => c[a]), ys = D.CUSTOMERS.map(c => c[b]), n = xs.length;
      const mx = xs.reduce((s, v) => s + v, 0) / n, my2 = ys.reduce((s, v) => s + v, 0) / n;
      const sxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my2), 0), sxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0), syy = ys.reduce((s, v) => s + (v - my2) ** 2, 0);
      return sxy / Math.sqrt(sxx * syy);
    };
    const MC = { naive: "#888888", trend: "#a1772b", pooled: "#005f92", actual: "var(--ink)" };
    function renderFc() {
      const b = F.backtest(), m5 = F.fit(5), m3 = F.fit(3);
      const sel = my.get("a_fc_cust", "C04");
      const ci = D.CUSTOMERS.findIndex(c => c.id === sel), c = D.CUSTOMERS[ci];
      const hist = c.hist.map((v, k) => ({ x: D.YEARS[k], y: v }));
      const bt = F.MODELS.map(x => ({ name: x.name + " (backtest)", color: MC[x.id], dash: "5 4", points: [{ x: 2023, y: c.hist[3] }, { x: 2024, y: m3.pred[ci][x.id](1) }, { x: 2025, y: m3.pred[ci][x.id](2) }] }));
      const fut = F.MODELS.map(x => ({ name: x.name, color: MC[x.id], dash: "5 4", points: [0, 1, 2, 3, 4, 5].map(h => ({ x: 2025 + h, y: h === 0 ? c.hist[5] : m5.pred[ci][x.id](h) })) }));
      const beta = m5.beta;
      const chg = D.CUSTOMERS.map((x, i) => ({ x, i, ch: 100 * (d30[x.id] / d25[x.id] - 1) })).sort((a, b) => b.ch - a.ch);
      $("#a-fc-out", root).innerHTML = `
        <h4>Backtest result (forecasting 2024 and 2025 from data up to 2023)</h4>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Model</th><th class="n">WAPE</th><th class="n">Bias</th><th>Verdict</th></tr></thead><tbody>
        ${F.MODELS.map(x => `<tr ${x.id === b.winner ? 'class="me"' : ""}><td>${esc(x.name)}</td><td class="n">${f.pct(b.res[x.id].wape, 1)}</td><td class="n">${b.res[x.id].biasPct > 0 ? "+" : ""}${f.pct(b.res[x.id].biasPct, 1)}</td><td>${x.id === b.winner ? "✓ lowest error" : x.id === "naive" ? "benchmark" : b.res[x.id].wape > b.res.naive.wape ? "worse than the benchmark" : "barely beats the benchmark"}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="field" style="max-width:340px;margin-top:10px"><label for="a-fc-sel">Look at one customer</label><select id="a-fc-sel">${D.CUSTOMERS.map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        <div class="grid g2e">
          <div><b>Backtest view</b> (trained on 2020–2023)${lines([{ name: "Actual", color: MC.actual, points: hist }].concat(bt), { yfmt: v => f.num(v), vline: 2023, title: "Backtest chart" })}</div>
          <div><b>Forecast to ${N.planYear}</b> (trained on 2020–2025)${lines([{ name: "Actual", color: MC.actual, points: hist }].concat(fut), { yfmt: v => f.num(v), vline: 2025, legend: false, title: "Forecast chart" })}</div>
        </div>
        <h4>What did the pooled model learn?</h4>
        <table class="small-tbl"><thead><tr><th>Driver</th><th class="n">Coefficient (growth per unit)</th><th>Reading</th></tr></thead><tbody>
          <tr><td>Intercept</td><td class="n">${f.num(100 * beta[0], 2)} pp</td><td>growth with all drivers at zero</td></tr>
          <tr><td>New homes per 1,000 residents</td><td class="n">${f.num(100 * beta[1], 2)} pp</td><td>each extra new home per 1,000 residents adds this much annual growth</td></tr>
          <tr><td>Employment growth (%)</td><td class="n">${f.num(100 * beta[2], 2)} pp</td><td>per percentage point of job growth</td></tr>
          <tr><td>Detached houses (%)</td><td class="n">${f.num(100 * beta[3], 3)} pp</td><td>per percentage point of households with a garden</td></tr>
        </tbody></table>
        <small>Careful with reading single coefficients: across the 20 cities housing and job growth move together (correlation ${f.num(corr("housing", "jobs"), 2)}), so the model cannot cleanly separate their effects. The individual coefficients are uncertain, even negative where common sense says positive, while the combined prediction can still be good. This is called <b>multicollinearity</b>.</small>
        <h4>The ${N.planYear} forecast that we will design for (pooled model)</h4>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Customer</th><th class="n">2025</th><th class="n">${N.planYear}</th><th class="n">Change</th><th class="n">Learned growth / yr</th></tr></thead><tbody>
        ${chg.map(r => `<tr><td>${esc(r.x.name)}</td><td class="n">${f.num(d25[r.x.id])}</td><td class="n">${f.num(d30[r.x.id])}</td><td class="n" style="color:${r.ch >= 0 ? "var(--ok)" : "var(--bad)"}">${r.ch >= 0 ? "+" : ""}${f.pct(r.ch, 0)}</td><td class="n">${f.pct(100 * m5.pred[r.i].gPooled, 1)}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="n"><b>${f.num(tot25)}</b></td><td class="n"><b>${f.num(tot30)}</b></td><td class="n"><b>+${f.pct(100 * (tot30 / tot25 - 1), 1)}</b></td><td></td></tr>
        </tbody></table></div>
        <div class="note info"><b>Notice:</b> total demand grows by ${f.pct(100 * (tot30 / tot25 - 1), 0)}, but the <b>geography</b> shifts much more: ${esc(chg.slice(0, 3).map(r => r.x.name).join(", "))} gain the most, ${esc(chg.slice(-3).map(r => r.x.name).join(", "))} lose the most. For a network, <i>where</i> demand is matters more than how much there is.</div>
        <div class="note info"><b>Why can the forecast differ from “2025 plus growth”?</b> The model estimates each customer's level from all six years, so one unusually high or low year is treated as noise, not as the new normal. The naive model would carry such a spike all the way to ${N.planYear}.</div>`;
      $("#a-fc-sel", root).onchange = e => { my.put("a_fc_cust", e.target.value); renderFc(); };
      guessFc.reveal(b.winner);
    }
    /* ---- the student's own pooled model and the forecast they sign off ---- */
    const FEAT_NAMES = { housing: "new homes", jobs: "job growth", detached: "detached houses" };
    const myFeats = () => { const v = my.get("a_feats", F.FEATURES).filter(k => F.FEATURES.includes(k)); return v.length ? v : F.FEATURES; };
    const myChoice = () => my.get("vote_a_fcsel") || null;
    const choiceName = () => ({ naive: "naive", trend: "per-customer trend", pooled: "pooled, all drivers", own: "own model: " + myFeats().map(k => FEAT_NAMES[k]).join(" + ") }[myChoice()] || "");
    const myDemand = () => { const c = myChoice(); return c === "naive" ? d25 : c === "trend" ? F.demand("trend" + N.planYear) : c === "own" ? F.demand("pooled" + N.planYear, myFeats()) : d30; };
    let fcOwnBuilt = false;
    function renderFcOwn() {
      const box = $("#a-fc-own", root);
      if (!fcOwnBuilt) {
        fcOwnBuilt = true;
        box.innerHTML = `<h4 style="margin-top:16px">Your turn: build your own pooled model</h4>
          <p>Which drivers should the model learn from? More features are not automatically better: with only 20 customers every extra coefficient is estimated from little data. Tick the drivers and watch the backtest error.</p>
          <div class="btn-row" id="a-feat">${F.FEATURES.map(k => `<label class="btn small"><input type="checkbox" value="${k}" style="margin:0 6px 0 0"> ${FEAT_NAMES[k]}</label>`).join("")}</div>
          <div id="a-feat-out"></div>
          <div id="a-fcsel"></div>`;
        $$("#a-feat input", box).forEach(cb => (cb.onchange = () => {
          if (myChoice()) return;
          const v = $$("#a-feat input", box).filter(x => x.checked).map(x => x.value);
          if (!v.length) { cb.checked = true; toast("Keep at least one driver.", "err"); return; }
          my.put("a_feats", v); renderFcOwn();
        }));
        vote($("#a-fcsel", box), Object.assign({ mode: "opinion" }, LT.ACT.a_fcsel));
        document.addEventListener("kl-change", () => { if (fcOwnBuilt) renderFcOwn(); });
      }
      const fs = myFeats(), locked = !!myChoice();
      $$("#a-feat input", box).forEach(cb => { cb.checked = fs.includes(cb.value); cb.disabled = locked; });
      const all = F.backtest(), own = F.backtest(fs);
      const combos = [["housing"], ["jobs"], ["detached"], ["housing", "jobs"], ["housing", "detached"], ["jobs", "detached"], ["housing", "jobs", "detached"]];
      $("#a-feat-out", box).innerHTML = `<div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Pooled model with…</th><th class="n">Backtest WAPE</th><th class="n">Bias</th></tr></thead><tbody>
        <tr class="me"><td><b>Your model:</b> ${esc(fs.map(k => FEAT_NAMES[k]).join(" + "))}</td><td class="n"><b>${f.pct(own.res.pooled.wape, 1)}</b></td><td class="n">${own.res.pooled.biasPct > 0 ? "+" : ""}${f.pct(own.res.pooled.biasPct, 1)}</td></tr>
        <tr><td>All three drivers</td><td class="n">${f.pct(all.res.pooled.wape, 1)}</td><td class="n">${all.res.pooled.biasPct > 0 ? "+" : ""}${f.pct(all.res.pooled.biasPct, 1)}</td></tr>
        <tr><td>Naive benchmark</td><td class="n">${f.pct(all.res.naive.wape, 1)}</td><td class="n">${all.res.naive.biasPct > 0 ? "+" : ""}${f.pct(all.res.naive.biasPct, 1)}</td></tr>
        </tbody></table></div>
        <details class="mini"><summary>All seven feature combinations</summary><table class="small-tbl"><tbody>${combos.map(c => `<tr><td>${esc(c.map(k => FEAT_NAMES[k]).join(" + "))}</td><td class="n">${f.pct(F.backtest(c).res.pooled.wape, 1)}</td></tr>`).join("")}</tbody></table>
        <small>Trying all combinations and keeping the best on the same two test years is itself a mild form of overfitting (“model selection bias”). Prefer the simpler model when the difference is small.</small></details>
        ${locked ? `<div class="note ok"><b>Your forecast is locked in:</b> ${esc(choiceName())}.</div>` : ""}`;
    }
    $("#a-fc-run", root).onclick = () => { my.set("a_fc_run", true); renderFc(); renderFcOwn(); };
    if (my.get("a_fc_run")) { renderFc(); renderFcOwn(); }

    /* ================= 5 · Re-optimise for 2030 ================= */
    const shiftAnswer = () => {
      const a = getOpt25().open, b = getOpt30().open;
      if (a.join() === b.join()) return "same";
      return b.length > a.length ? "add" : b.length < a.length ? "drop" : "swap";
    };
    const guessShift = vote($("#a-shift-guess", root), Object.assign({ mode: "guess" }, LT.ACT.a_shift, {
      explain: () => `2025 optimum: ${esc(H.names(getOpt25().open))}. ${N.planYear} optimum: ${esc(H.names(getOpt30().open))}. ${{ same: "The network does not change.", swap: "The number of DCs stays, but one moves, following the demand.", add: "Growth makes one more DC pay off.", drop: "One DC no longer pays off." }[shiftAnswer()]}`
    }));
    gate($("#a-2030-block", root), [{ ok: () => !!my.get("a_fc_run"), text: "Run the backtest in step 4 first." }, { ok: voted("a_fcsel"), text: "Choose and lock in your forecast at the end of step 4 first." }, { ok: voted("a_shift"), text: "Lock in your guess about the 2030 network first." }]);
    function render2030() {
      const o25 = getOpt25(), o30 = getOpt30();
      const old30 = H.solve({}, { open: o25.open, demand: d30 });
      const sub = my.get("a_sub"), sub30 = sub ? H.solve({}, { open: sub.open, demand: d30 }) : null;
      const moved = o30.open.filter(x => !o25.open.includes(x)), gone = o25.open.filter(x => !o30.open.includes(x));
      const mine = myChoice() && myChoice() !== "pooled" ? H.solve({}, { demand: myDemand() }) : null, mine30 = mine && mine.feasible ? H.solve({}, { open: mine.open, demand: d30 }) : null;
      $("#a-2030-out", root).innerHTML = `<div class="grid g2e"><div class="map-wrap">${mapSvg({ res: o30, demand: d30 })}</div><div>
        <div class="note ${moved.length || gone.length ? "warn" : "ok"}"><b>${N.planYear} optimum: ${esc(H.names(o30.open))}</b>${moved.length || gone.length ? `. Compared with 2025: ${gone.map(dcName).join(", ")} → ${moved.map(dcName).join(", ")}.` : ", the same as for 2025."}</div>
        <table class="small-tbl"><thead><tr><th>Network</th><th class="n">€k / yr on ${N.planYear} demand</th><th class="n">vs. ${N.planYear} optimum</th></tr></thead><tbody>
          <tr class="me"><td>${N.planYear} optimum: ${esc(H.names(o30.open))}</td><td class="n">${f.num(o30.total, 1)}</td><td class="n">–</td></tr>
          <tr><td>2025 optimum: ${esc(H.names(o25.open))}</td><td class="n">${f.num(old30.total, 1)}</td><td class="n">+${f.num(100 * (old30.total / o30.total - 1), 1)}%</td></tr>
          ${sub30 && sub30.feasible ? `<tr><td>Your submitted network: ${esc(H.names(sub.open))}</td><td class="n">${f.num(sub30.total, 1)}</td><td class="n">+${f.num(100 * (sub30.total / o30.total - 1), 1)}%</td></tr>` : ""}
          ${mine && mine.feasible && mine.open.join() !== o30.open.join() ? `<tr><td>Optimum for <b>your</b> chosen forecast (${esc(choiceName())}): ${esc(H.names(mine.open))}</td><td class="n">${mine30.feasible ? f.num(mine30.total, 1) : "not feasible"}</td><td class="n">${mine30.feasible ? "+" + f.num(100 * (mine30.total / o30.total - 1), 1) + "%" : "–"}</td></tr>` : ""}
          <tr><td>Today: Ecser only</td><td class="n">${f.num(H.solve({}, { open: ["D1"], demand: d30 }).total, 1)}</td><td class="n">+${f.num(100 * (H.solve({}, { open: ["D1"], demand: d30 }).total / o30.total - 1), 1)}%</td></tr>
        </tbody></table>
        <small>From here on, the lab uses one reference forecast for everybody: the pooled model with all three drivers. Your own forecast choice comes back in the last step, when ${N.planYear} arrives.</small>
        <div class="note info"><b>Why it matters:</b> the difference is paid every year of a 10-year lease, and moving a DC later costs a relocation project. Forecast first, then optimise. The forecast is an input of the optimisation, so its errors flow straight into the network.</div>
      </div></div>`;
      guessShift.reveal(shiftAnswer());
    }
    $("#a-2030-run", root).onclick = () => { my.set("a_2030", true); render2030(); };
    if (my.get("a_2030")) render2030();

    /* ================= 6 · k-means ================= */
    const kSl = $("#a-k", root);
    kSl.oninput = () => ($("#a-k-out", root).textContent = kSl.value);
    function renderK() {
      const k = Number(kSl.value);
      const pts = D.CUSTOMERS.map(c => ({ id: c.id, lat: c.lat, lon: c.lon, w: d30[c.id] }));
      const km = K.run(pts, k, 7, 12);
      const snap = K.snap(km.centers);
      const net = H.solve({}, { open: snap.map(s => s.dc), demand: d30 });
      const o30 = getOpt30();
      $("#a-k-map", root).innerHTML = mapSvg({ res: null, open: snap.map(s => s.dc), demand: d30, clusters: km });
      $("#a-k-res", root).innerHTML = `
        <table class="small-tbl"><thead><tr><th>Cluster</th><th class="n">Pallets</th><th>Nearest candidate DC</th><th class="n">Centre → DC</th></tr></thead><tbody>
        ${snap.map((s, m) => { const w = D.CUSTOMERS.filter((_, q) => km.assign[q] === m).reduce((a, c) => a + d30[c.id], 0); return `<tr><td><span class="lamp" style="background:${KCOL[m % KCOL.length]}"></span>${m + 1}</td><td class="n">${f.num(w)}</td><td>${esc(H.dc(s.dc).name)}</td><td class="n">${f.num(s.km, 0)} km</td></tr>`; }).join("")}
        </tbody></table>
        ${net.feasible ? `<div class="note ${net.total <= o30.total + 0.05 ? "ok" : "warn"}"><b>k-means network (${esc(H.names(net.open))}):</b> ${f.keur(net.total, 1)} per year on ${N.planYear} demand, ${net.total <= o30.total + 0.05 ? "the same as the solver's optimum." : `+${f.num(100 * (net.total / o30.total - 1), 1)}% above the solver's optimum (${f.keur(o30.total, 1)}).`}</div>`
          : `<div class="note bad"><b>Not feasible:</b> with ${k} DC(s) at these sites the capacity is not enough. k-means does not know about capacity.</div>`}
        <small>Average demand-weighted distance to the cluster centre (straight line): ${f.num(km.wdist, 0)} km.</small>`;
      const el = [];
      for (let kk = 1; kk <= 6; kk++) {
        const r = K.run(pts, kk, 7, 12), n = H.solve({}, { open: K.snap(r.centers).map(s => s.dc), demand: d30 });
        el.push({ k: kk, wd: r.wdist, cost: n.feasible ? n.total : null });
      }
      $("#a-k-elbow", root).innerHTML = `<div class="grid g2e" style="margin-top:10px">
        <div><b>Elbow chart:</b> average distance to the centre vs. k${lines([{ name: "avg. distance (km)", color: "#005f92", points: el.map(e => ({ x: e.k, y: e.wd })) }], { y0: 0, yfmt: v => f.num(v), legend: false, title: "elbow" })}</div>
        <div><b>But what does each k cost?</b> (k-means sites, evaluated by the LP)${lines([{ name: "total cost €k / yr", color: "#a1772b", points: el.filter(e => e.cost).map(e => ({ x: e.k, y: e.cost })) }, { name: "solver optimum", color: "#007548", dash: "4 4", dots: false, points: [{ x: 1, y: o30.total }, { x: 6, y: o30.total }] }], { yfmt: v => f.num(v), title: "cost by k" })}</div></div>
        <div class="note info"><b>Read the two charts together:</b> the distance curve keeps falling, it has no notion of fixed cost. The cost curve has a minimum, because every extra DC adds its fixed cost (€84–135k per year). Clustering tells you <i>where</i> demand concentrates; only the cost model tells you <i>how many</i> sites pay off.</div>`;
    }
    $("#a-k-run", root).onclick = () => { my.set("a_k_run", true); renderK(); };
    vote($("#a-kq", root), Object.assign({ mode: "quiz" }, LT.ACT.a_kq));
    gate($("#a-km", root), [{ ok: () => !!my.get("a_2030"), text: "Solve the 2030 network in step 5 first." }]);
    if (my.get("a_k_run")) renderK();

    /* ================= 7 · AI as a modeller ================= */
    const keyP = A.keyParams(), keyRes = () => H.solve(keyP.p, { demand: F.demand(keyP.basis) });
    let lastAiRes = null;
    const aiRoot = aiCard($("#a-ai", root), Object.assign({}, LT.ACT.a_ai, {
      badge: "7 · AI as modeller",
      title: "Let the AI translate the CEO's memo into a solver specification",
      intro: `Below is the CEO's memo. Your job is not to ask the AI for the best network, but to have it write a <b>formal specification</b> (JSON) that the solver can execute. The page validates the JSON, compares every field with the memo, and runs the solver on it.
        <div class="brief"><b>Memo from the CEO, Kestrel Home &amp; Garden Ltd.</b><ol>${D.BRIEF.map(b => `<li>${esc(b)}</li>`).join("")}</ol></div>`,
      steps: [["Copy the prompt.", "It contains the memo, the site IDs and the JSON schema."], ["Paste it", "into the AI, then paste its JSON answer back here."], ["Check it:", "schema validation, field-by-field comparison with the memo, then the solver runs."], ["Judge it:", "which sentences did the AI translate correctly, and what did a mistake cost?"]],
      gate: [{ ok: () => !!my.get("a_2030"), text: "Solve the 2030 network in step 5 first." }],
      why: [
        ["Role", "“Optimisation modelling assistant”: the AI is asked to formulate, not to solve."],
        ["Context", "Only what is needed for the translation: site IDs, plant IDs, the allowed demand bases. No cost data, because the AI should not optimise."],
        ["Schema", "Every field has a type and a meaning. A fixed schema makes the answer machine-checkable, exactly like function calling in AI APIs."],
        ["What is NOT said", "The prompt deliberately does not say which memo sentences are hard requirements. Telling requirements from wishes is part of the test."],
        ["Output", "“ONE JSON object only”: no prose around it, so the parser can read it. Code fences are tolerated."]
      ],
      prompt: () => `You are an optimisation modelling assistant. Translate the CEO's memo below into a specification for a distribution-network optimisation model (a mixed-integer linear program that a solver will run). Do not try to solve the problem yourself.

COMPANY: Kestrel Home & Garden Ltd. (fictional)
Candidate distribution centres (DC IDs): ${D.DCS.map(j => `${j.id} = ${j.name}`).join("; ")}
Plants (plant IDs): ${D.PLANTS.map(p => `${p.id} = ${p.name} (capacity ${p.cap} pallets/year)`).join("; ")}
Demand bases available: "actual2025" (last year's actual demand) or "forecast${N.planYear}" (demand forecast for ${N.planYear})

MEMO FROM THE CEO:
${D.BRIEF.map((b, i) => `${i + 1}. ${b}`).join("\n")}

OUTPUT: answer with ONE JSON object only, no other text, using exactly this schema:
{
  "demand_basis": "actual2025" | "forecast${N.planYear}",
  "must_open": [DC IDs that must be open],
  "must_close": [DC IDs that must not be used],
  "max_dcs": integer or null (maximum number of open DCs in total),
  "max_distance_km": number or null (maximum road distance between a customer and its DC),
  "service": {"radius_km": number, "min_share_pct": number} or null (minimum share of all pallets delivered from a DC within the radius),
  "plant_min_utilisation_pct": {"<plant ID>": number} (minimum utilisation as % of plant capacity; {} if none),
  "assumptions": ["short notes on how you interpreted the memo"]
}`,
      answerLabel: "The AI's JSON answer",
      check: txt => {
        const spec = PR.json(txt);
        const errs = [];
        if (!["actual2025", "forecast" + N.planYear].includes(String(spec.demand_basis))) errs.push(`demand_basis must be "actual2025" or "forecast${N.planYear}"`);
        ["must_open", "must_close"].forEach(k => { if (!Array.isArray(spec[k])) errs.push(k + " must be a list"); else spec[k].forEach(id => { if (!D.DCS.some(j => j.id === String(id).toUpperCase())) errs.push(`${k}: unknown DC ID “${id}”`); }); });
        if (Array.isArray(spec.must_open) && Array.isArray(spec.must_close)) spec.must_open.forEach(id => { if (spec.must_close.map(x => String(x).toUpperCase()).includes(String(id).toUpperCase())) errs.push(`${id} is in must_open and in must_close at the same time (the solver treats it as closed)`); });
        ["max_dcs", "max_distance_km"].forEach(k => { if (spec[k] !== null && spec[k] !== undefined && typeof spec[k] !== "number") errs.push(k + " must be a number or null"); });
        if (spec.service !== null && spec.service !== undefined && (typeof spec.service !== "object" || typeof spec.service.radius_km !== "number" || typeof spec.service.min_share_pct !== "number")) errs.push("service must be {radius_km: number, min_share_pct: number} or null");
        if (spec.plant_min_utilisation_pct && typeof spec.plant_min_utilisation_pct === "object") Object.keys(spec.plant_min_utilisation_pct).forEach(k => { if (!D.PLANTS.some(p => p.id === k.toUpperCase())) errs.push(`plant_min_utilisation_pct: unknown plant “${k}”`); });
        const chk = A.check(spec);
        const { p, basis } = A.toParams(spec);
        const res = H.solve(p, { demand: F.demand(basis) });
        const kr = keyRes();
        lastAiRes = res.feasible ? { res, basis } : null;
        const fmtV = v => `<code>${esc(String(v).length > 70 ? String(v).slice(0, 70) + "…" : v)}</code>`;
        let h = `<h4>1 · Schema validation</h4>` + (errs.length ? `<div class="note warn"><b>${errs.length} schema problem(s):</b><br>${errs.map(esc).join("<br>")}</div>` : `<div class="note ok"><b>Valid JSON, schema respected.</b></div>`);
        h += `<h4>2 · Field-by-field check against the memo: ${chk.score} / ${chk.of} correct</h4>
          <div class="tbl-wrap"><table class="small-tbl spec-tbl"><thead><tr><th>Field</th><th>AI</th><th>Correct reading of the memo</th><th></th></tr></thead><tbody>
          ${chk.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${fmtV(r.ai)}</td><td>${fmtV(r.key)}</td><td class="${r.ok ? "ok" : "bad"}">${r.ok ? "✓" : "✗"}</td></tr>`).join("")}
          </tbody></table></div>`;
        if (Array.isArray(spec.assumptions) && spec.assumptions.length) h += `<details class="mini"><summary>The AI's stated assumptions (${spec.assumptions.length})</summary><ul class="tight">${spec.assumptions.map(a => `<li>${esc(a)}</li>`).join("")}</ul></details>`;
        h += `<h4>3 · The solver runs both specifications</h4><div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Specification</th><th>Network</th><th class="n">€k / year</th><th class="n">Next-day</th><th class="n">Max distance</th></tr></thead><tbody>
          <tr><td>The AI's spec</td><td>${res.feasible ? esc(H.names(res.open)) : "<b>infeasible</b>"}</td><td class="n">${res.feasible ? f.num(res.total, 1) : "–"}</td><td class="n">${res.feasible ? f.pct(res.fastPct, 0) : "–"}</td><td class="n">${res.feasible ? f.num(res.maxKmUsed, 0) + " km" : "–"}</td></tr>
          <tr class="me"><td>Correct reading</td><td>${esc(H.names(kr.open))}</td><td class="n">${f.num(kr.total, 1)}</td><td class="n">${f.pct(kr.fastPct, 0)}</td><td class="n">${f.num(kr.maxKmUsed, 0)} km</td></tr>
          </tbody></table></div>`;
        const same = res.feasible && res.open.join() === kr.open.join() && Math.abs(res.total - kr.total) < 0.05;
        h += `<div class="note ${same ? "ok" : "warn"}">${same
          ? (chk.score === chk.of ? "<b>Perfect translation:</b> same spec, same network." : "<b>Same network despite the mistakes in the spec.</b> Lucky: the wrong constraints happened not to bind. With other data they could. A correct result does not prove a correct model.")
          : `<b>The translation changes the decision.</b> ${res.feasible ? `The AI's spec leads to ${esc(H.names(res.open))} at ${f.keur(res.total, 1)} (${res.total > kr.total ? "+" : "−"}${f.keur(Math.abs(res.total - kr.total), 1)} per year vs. the correct reading).${res.total < kr.total - 0.05 ? " Cheaper is not better here: it breaks a requirement of the memo." : " The extra cost buys nothing the memo asked for."}` : "The AI's constraints cannot all be met at once."}`}</div>`;
        return { html: h, value: chk.score, summary: `spec ${chk.score}/${chk.of} correct; ${res.feasible ? H.names(res.open) + " " + f.num(res.total, 1) + "k€" : "infeasible"}`, after: box => loopUi(box) };
      }
    }));
    // Round 2 (optional): close the loop. The AI explains the solver result; the page checks every number.
    function loopUi(box) {
      if (!lastAiRes) return;
      const r = lastAiRes.res, base = H.solve({}, { open: ["D1"], demand: F.demand(lastAiRes.basis) });
      const facts = [
        ["total cost (€k/yr)", r.total], ["fixed cost (€k)", r.fixK], ["inbound cost (€k)", r.inK], ["outbound cost (€k)", r.outK],
        ["next-day share (%)", r.fastPct], ["avg. distance (km)", r.avgKm], ["cost per pallet (€)", r.perPallet], ["number of DCs", r.open.length],
        ["saving vs. Ecser only (€k)", base.total - r.total], ["saving vs. Ecser only (%)", 100 * (1 - r.total / base.total)],
        ["Zalaegerszeg plant utilisation (%)", 100 * r.plantUse.P2 / D.PLANTS[1].cap], ["Szolnok plant utilisation (%)", 100 * r.plantUse.P1 / D.PLANTS[0].cap], ["pallets per year", r.demandTotal], ["plan year", N.planYear], ["service radius (km)", N.fastKm]
      ];
      const div = document.createElement("div");
      div.innerHTML = `<details class="box" style="margin-top:12px"><summary><span class="ikon">↻</span><span>Optional round 2: close the loop<small>Give the solver's result back to the AI, let it write the CEO summary, and check every number it uses</small></span></summary><div class="tartalom">
        <p>The second half of the LLM + solver pattern: the AI turns the solver's output into language. The danger is that it adds numbers that are not in the result. The checker marks every number: <mark class="ok">green</mark> = matches the solver output (±2%), <mark class="chk">yellow</mark> = cannot be verified.</p>
        <div class="btn-row"><button class="btn ai" data-l2>Copy round-2 prompt</button></div>
        <div class="field"><label>The AI's summary</label><textarea data-l2a style="min-height:90px" placeholder="Paste the AI's summary here…"></textarea></div>
        <div class="btn-row"><button class="btn primary" data-l2c>Check the numbers</button></div><div data-l2o></div></div></details>`;
      box.appendChild(div);
      $("[data-l2]", div).onclick = async () => {
        const txt = `You wrote the specification; the solver has now solved the model. Here is its output:
Open DCs: ${r.open.map(id => H.dc(id).name).join(", ")}
Total cost: ${f.num(r.total, 1)} thousand EUR per year (fixed ${f.num(r.fixK, 1)}, inbound ${f.num(r.inK, 1)}, outbound ${f.num(r.outK, 1)})
Cost per pallet: ${f.num(r.perPallet, 2)} EUR; pallets per year: ${f.num(r.demandTotal)}
Next-day share (within ${N.fastKm} km): ${f.num(r.fastPct, 1)}%; average delivery distance: ${f.num(r.avgKm, 0)} km
Plant utilisation: Szolnok ${f.num(100 * r.plantUse.P1 / D.PLANTS[0].cap, 1)}%, Zalaegerszeg ${f.num(100 * r.plantUse.P2 / D.PLANTS[1].cap, 1)}%
Today's network (Ecser only) on the same demand: ${f.num(base.total, 1)} thousand EUR per year

Write a summary for the CEO in at most 120 words. Use only numbers that appear in this output (you may compute the saving versus today).`;
        const ok = await copy(txt); toast(ok ? "Round-2 prompt copied." : "Copy failed.", ok ? "" : "err");
      };
      $("[data-l2c]", div).onclick = () => {
        const t = $("[data-l2a]", div).value;
        if (t.trim().length < 20) return;
        let out = "", pos = 0, okN = 0, badN = 0;
        PR.numbers(t).forEach(n => {
          const hit = facts.find(([, v]) => Math.abs(n.value - v) <= Math.max(Math.abs(v) * 0.02, 0.06) || Math.abs(n.value - Math.round(v)) < 0.01);
          const neutral = !hit && Number.isInteger(n.value) && n.value <= 10;
          out += esc(t.slice(pos, n.start)) + (neutral ? esc(n.text) : `<mark class="${hit ? "ok" : "chk"}" title="${hit ? esc(hit[0]) : "not in the solver output"}">${esc(n.text)}</mark>`);
          pos = n.end; if (hit) okN++; else if (!neutral) badN++;
        });
        out += esc(t.slice(pos));
        $("[data-l2o]", div).innerHTML = `<div class="fact-text">${out}</div><div class="note ${badN ? "warn" : "ok"}"><b>${okN} number(s) verified, ${badN} not verifiable.</b> ${badN ? "Check where the yellow numbers come from: rounding, own calculation, or invention?" : "Every number is grounded in the solver output."}</div>`;
      };
    }

    /* ================= 8 · Robustness ================= */
    function renderRob() {
      const sc = [
        { id: "naive", name: "Flat (2025 levels)", d: F.demand("actual2025") },
        { id: "trend", name: `Trend ${N.planYear}`, d: F.demand("trend" + N.planYear) },
        { id: "pooled", name: `Pooled ML ${N.planYear}`, d: d30 }
      ];
      if (myChoice() === "own" && myFeats().length < 3) sc.push({ id: "own", name: "Your model", d: myDemand() });
      const cand = new Map();
      sc.forEach(s => { s.all = H.enumerate({}, s.d); s.best = s.all[0].total; s.all.slice(0, 4).forEach(e => cand.set(e.open.join(), e.open)); });
      const sub = my.get("a_sub"); if (sub) cand.set(sub.open.join(), sub.open);
      const rows = [...cand.values()].map(open => {
        const costs = sc.map(s => { const e = s.all.find(x => x.open.join() === open.join()); return e ? e.total : null; });
        const reg = costs.map((c, i) => (c === null ? Infinity : c - sc[i].best));
        return { open, costs, reg, maxReg: Math.max(...reg), avg: costs.reduce((a, b) => a + (b || 0), 0) / costs.length };
      }).sort((a, b) => a.maxReg - b.maxReg);
      const mm = rows[0];
      $("#a-rob-out", root).innerHTML = `<div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Network</th>${sc.map(s => `<th class="n">${esc(s.name)}<br><small>cost (regret)</small></th>`).join("")}<th class="n">Max regret</th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr ${i === 0 ? 'class="me"' : ""}><td>${esc(H.names(r.open))}${sub && r.open.join() === sub.open.join() ? " <small>(yours)</small>" : ""}</td>${r.costs.map((c, k) => `<td class="n">${c === null ? "–" : f.num(c, 1)} <small>(${r.reg[k] === Infinity ? "–" : "+" + f.num(r.reg[k], 1)})</small></td>`).join("")}<td class="n"><b>${r.maxReg === Infinity ? "–" : f.num(r.maxReg, 1)}</b></td></tr>`).join("")}
        </tbody></table></div>
        <div class="note ok"><b>Minimax-regret choice: ${esc(H.names(mm.open))}.</b> Whatever scenario comes true, this network costs at most ${f.keur(mm.maxReg, 1)} per year more than the best network for that scenario.</div>
        <div class="note info"><b>Mind the business constraints:</b> this table is unconstrained. The CEO's memo (Miskolc unavailable, 220 km limit, 80% next-day, plant utilisation) narrows the choice further; check whether the robust network is allowed by the memo before you recommend it.</div>`;
    }
    $("#a-rob-run", root).onclick = () => { my.set("a_rob", true); renderRob(); };
    gate($("#a-rob", root), [{ ok: () => !!my.get("a_2030"), text: "Solve the 2030 network in step 5 first." }]);
    if (my.get("a_rob")) renderRob();

    /* ================= 9 · Decision ================= */
    textBox($("#a-dec", root), Object.assign({}, LT.ACT.a_dec, { placeholder: "I recommend …", button: "Submit recommendation", minWords: 30, okMsg: "Recommendation submitted: +2 points", option: () => (my.get("a_sub") ? "own: " + H.names(my.get("a_sub").open) : "") }));
    gate($("#a-dec-card", root), [{ ok: ownDone, text: "Submit your own network first." }, { ok: () => !!my.get("a_2030"), text: "Solve the 2030 network in step 5 first." }]);

    /* ================= 10 · Fast-forward: what the plan year really brought ================= */
    function renderRev() {
      const tr = F.truth(), best = H.solve({}, { demand: tr });
      const on = open => H.solve({}, { open, demand: tr });
      const fcs = [["Naive (2025 levels)", d25], ["Per-customer trend", F.demand("trend" + N.planYear)], ["Pooled, all three drivers", d30]];
      if (myChoice() === "own") fcs.push(["Your model: " + myFeats().map(k => FEAT_NAMES[k]).join(" + "), myDemand()]);
      const nets = [];
      const add = (label, open, cls) => { if (open && open.length) nets.push({ label, open, e: on(open), cls }); };
      add("Designed for 2025 actuals (the 2025 optimum)", getOpt25().open);
      add("Designed for the reference forecast (pooled ML)", getOpt30().open);
      const mineO = myChoice() ? H.solve({}, { demand: myDemand() }) : null;
      if (mineO && mineO.feasible) add(`Designed for YOUR forecast (${choiceName()})`, mineO.open, "me");
      if (my.get("a_sub")) add("Your hand-built network from step 2", my.get("a_sub").open, "me");
      const kr = keyRes(); if (kr.feasible) add("The CEO memo, correctly modelled (step 7)", kr.open);
      add("Doing nothing: Ecser only", ["D1"]);
      const naiveNet = nets[0].e, pct = e => 100 * (e.total / best.total - 1);
      $("#a-rev-out", root).innerHTML = `
        <h4>How good were the forecasts?</h4>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Forecast made in 2025</th><th class="n">Total ${N.planYear} forecast</th><th class="n">Error vs. real ${N.planYear} (WAPE)</th></tr></thead><tbody>
        ${fcs.map(([n, d], i) => `<tr ${i === 3 ? 'class="me"' : ""}><td>${esc(n)}</td><td class="n">${f.num(F.total(d))}</td><td class="n"><b>${f.pct(F.wape(d, tr), 1)}</b></td></tr>`).join("")}
        <tr><td><i>What really happened</i></td><td class="n"><i>${f.num(F.total(tr))}</i></td><td class="n">–</td></tr></tbody></table></div>
        <h4>What does each network cost on the real ${N.planYear} demand?</h4>
        <div class="grid g2e"><div class="map-wrap">${mapSvg({ res: best, demand: tr })}</div><div>
        <div class="tbl-wrap"><table class="small-tbl"><thead><tr><th>Network</th><th class="n">€k / year</th><th class="n">vs. best possible</th></tr></thead><tbody>
        <tr><td><b>Best possible with hindsight:</b> ${esc(H.names(best.open))}</td><td class="n">${f.num(best.total, 1)}</td><td class="n">–</td></tr>
        ${nets.map(n => `<tr class="${n.cls || ""}"><td>${esc(n.label)}: ${esc(H.names(n.open))}</td><td class="n">${n.e.feasible ? f.num(n.e.total, 1) : "cannot serve the demand"}</td><td class="n">${n.e.feasible ? "+" + f.num(pct(n.e), 1) + "%" : "–"}</td></tr>`).join("")}
        </tbody></table></div>
        ${naiveNet.feasible ? `<div class="note warn"><b>The price of designing for last year:</b> ${f.keur(naiveNet.total - best.total, 0)} every year (+${f.num(pct(naiveNet), 1)}%), over a 10-year lease about ${f.keur(10 * (naiveNet.total - best.total), 0)}.</div>` : ""}
        <div class="note info"><b>Take-aways.</b> (1) A forecast does not have to be perfect to lead to the right network: what matters is whether its errors change the decision. (2) A badly specified model (try “detached houses” alone) can be worse than no model. (3) You never get this table in real life. Backtesting and scenario analysis are the substitutes you have at decision time.</div>
        </div></div>`;
    }
    $("#a-rev-run", root).onclick = () => { my.set("a_rev", true); renderRev(); };
    gate($("#a-rev", root), [{ ok: () => done("a_dec"), text: "Submit your recommendation in step 9 first: decide before you see the future." }]);
    if (my.get("a_rev")) renderRev();
    void aiRoot;
  };
})();
