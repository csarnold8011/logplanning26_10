/* Kestrel lab: computational core (runs in the browser and in node).
   F: demand forecasting (naive, trend, pooled regression), H: network design (MILP),
   K: weighted k-means, T: travel-time machine learning, V: vehicle routing, P/A: AI answer parsing. */
(function (root) {
  const LT = (root.LT = root.LT || {});
  const D = LT.data;
  const getSolver = () => root.solver || (typeof require === "function" ? require("./vendor/lp-solver.js") : null);

  /* ================= General helpers ================= */
  function haversine(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // Planar projection (km) around a reference point, for SVG maps and k-means
  function projector(lat0, lon0) {
    const kx = Math.cos(lat0 * Math.PI / 180) * 111.32, ky = 110.57;
    return p => ({ x: (p.lon - lon0) * kx, y: (lat0 - p.lat) * ky });
  }
  const fmt = {
    num(v, d = 0) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      return Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    eur(v, d = 0) { return "€" + fmt.num(v, d); },
    keur(v, d = 0) { return "€" + fmt.num(v, d) + "k"; },
    pct(v, d = 1) { return fmt.num(v, d) + "%"; },
    clock(min) {
      const h = Math.floor(min / 60), m = Math.round(min - 60 * h);
      return String(m === 60 ? h + 1 : h).padStart(2, "0") + ":" + String(m === 60 ? 0 : m).padStart(2, "0");
    }
  };
  const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };

  // Ordinary least squares via the normal equations (Gauss-Jordan with partial pivoting)
  function ols(X, y) {
    const p = X[0].length;
    const A = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
    for (let i = 0; i < X.length; i++) for (let a = 0; a < p; a++) {
      b[a] += X[i][a] * y[i];
      for (let c = 0; c < p; c++) A[a][c] += X[i][a] * X[i][c];
    }
    for (let i = 0; i < p; i++) {
      let m = i;
      for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
      [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
      for (let r = 0; r < p; r++) {
        if (r === i) continue;
        const f = A[r][i] / A[i][i];
        for (let c = i; c < p; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  /* ================= F: demand forecasting ================= */
  const F = {};
  F.FEATURES = ["housing", "jobs", "detached"];
  // Fit all three models on the years up to index T (inclusive). h = years ahead of YEARS[T].
  F.fit = function (T, feats) {
    feats = feats && feats.length ? feats : F.FEATURES;
    const yrs = D.YEARS.slice(0, T + 1);
    const trend = D.CUSTOMERS.map(c => {
      const y = c.hist.slice(0, T + 1).map(Math.log);
      const [a, b] = ols(yrs.map(v => [1, v - yrs[T]]), y);
      return { a, b };
    });
    // Pooled ML model: learn the growth rate from the drivers, across all customers
    const beta = ols(D.CUSTOMERS.map(c => [1].concat(feats.map(k => c[k]))), trend.map(t => t.b));
    const pred = D.CUSTOMERS.map((c, i) => {
      const g = feats.reduce((s, k, q) => s + beta[q + 1] * c[k], beta[0]);
      const y = c.hist.slice(0, T + 1).map(Math.log);
      const anchor = y.reduce((s, v, k) => s + v - g * (yrs[k] - yrs[T]), 0) / y.length;
      return {
        id: c.id, gTrend: trend[i].b, gPooled: g,
        naive: () => c.hist[T],
        trend: h => Math.exp(trend[i].a + trend[i].b * h),
        pooled: h => Math.exp(anchor + g * h)
      };
    });
    return { T, beta, feats, pred };
  };
  F.MODELS = [
    { id: "naive", name: "Naive", desc: "next years = last year" },
    { id: "trend", name: "Per-customer trend", desc: "a straight line through each customer's own history (log scale)" },
    { id: "pooled", name: "Pooled regression (ML)", desc: "learns the growth rate from the demand drivers, across all customers" }
  ];
  // Backtest: train on 2020-2023, forecast 2024 (h=1) and 2025 (h=2), measure WAPE
  F.backtest = function (feats) {
    const m = F.fit(3, feats), res = {}, rows = [];
    F.MODELS.forEach(x => (res[x.id] = { err: 0, bias: 0 }));
    let tot = 0;
    D.CUSTOMERS.forEach((c, i) => {
      const row = { id: c.id, name: c.name, actual: c.hist[5] };
      for (const h of [1, 2]) {
        const a = c.hist[3 + h]; tot += a;
        F.MODELS.forEach(x => { const f = m.pred[i][x.id](h); res[x.id].err += Math.abs(f - a); res[x.id].bias += f - a; if (h === 2) row[x.id] = f; });
      }
      rows.push(row);
    });
    F.MODELS.forEach(x => { res[x.id].wape = 100 * res[x.id].err / tot; res[x.id].biasPct = 100 * res[x.id].bias / tot; });
    const winner = F.MODELS.slice().sort((a, b) => res[a.id].wape - res[b.id].wape)[0].id;
    return { res, rows, winner, beta: m.beta };
  };
  // Demand map for the network model
  F.demand = function (basis, feats) {
    const out = {};
    if (!basis || basis === "actual2025") { D.CUSTOMERS.forEach(c => (out[c.id] = c.hist[5])); return out; }
    const model = basis.replace(/\d+$/, ""), h = D.NET.planYear - D.YEARS[5];
    const m = F.fit(5, feats);
    D.CUSTOMERS.forEach((c, i) => (out[c.id] = Math.round(m.pred[i][model](h))));
    return out;
  };
  // What the plan year really brings (the hidden data-generating process, shown only in the reveal step)
  F.truth = function () { const out = {}; D.CUSTOMERS.forEach(c => (out[c.id] = c.true30)); return out; };
  F.wape = function (fc, actual) { let e = 0, t = 0; Object.keys(actual).forEach(k => { e += Math.abs(fc[k] - actual[k]); t += actual[k]; }); return 100 * e / t; };
  F.total = d => Object.values(d).reduce((s, v) => s + v, 0);

  /* ================= H: network design (mixed-integer linear program) ================= */
  const H = {};
  H.km = function (a, b) { return haversine(a, b) * D.NET.roadFactor; };
  H.dc = id => D.DCS.find(x => x.id === id);
  /* min  Σ_j F_j y_j + Σ_p Σ_j a·dist(p,j)·f_pj + Σ_i Σ_j b·d_i·dist(j,i)·x_ij
     s.t. Σ_j x_ij = 1                     every customer fully served
          Σ_i d_i x_ij ≤ K_j y_j           DC capacity, only if open
          Σ_p f_pj = Σ_i d_i x_ij          flow balance at the DC
          Σ_j f_pj ≤ C_p  (and ≥ u_p C_p)  plant capacity (minimum utilisation)
          x_ij ≤ y_j,  y_j ∈ {0,1}          + optional business constraints  */
  H.solve = function (p, opts) {
    p = Object.assign({}, D.NET, p || {});
    opts = opts || {};
    const dem = opts.demand || F.demand("actual2025");
    const fixed = opts.open ? new Set(opts.open) : null;
    const closed = new Set(p.mustClose || []);
    const total = F.total(dem);
    const model = { optimize: "cost", opType: "min", constraints: {}, variables: {}, ints: {} };
    const C = model.constraints, Vv = model.variables;
    D.CUSTOMERS.forEach(c => (C["dem_" + c.id] = { equal: 1 }));
    D.PLANTS.forEach(pl => {
      C["pcap_" + pl.id] = { max: pl.cap };
      const u = (p.plantMinPct || {})[pl.id];
      if (u) C["pcap_" + pl.id].min = u / 100 * pl.cap;
    });
    const dcs = D.DCS.filter(j => (fixed ? fixed.has(j.id) : !closed.has(j.id)));
    if (fixed && [...fixed].some(id => closed.has(id))) return { feasible: false, why: "a closed DC is forced open" };
    for (const j of dcs) {
      C["cap_" + j.id] = { max: fixed ? j.cap : 0 };
      C["bal_" + j.id] = { equal: 0 };
      if (!fixed) {
        const y = { cost: j.fix, ["cap_" + j.id]: -j.cap, ["ub_" + j.id]: 1, cnt: 1 };
        C["ub_" + j.id] = { max: 1 };
        if ((p.mustOpen || []).includes(j.id)) { C["mo_" + j.id] = { min: 1 }; y["mo_" + j.id] = 1; }
        D.CUSTOMERS.forEach(c => (y["lnk_" + c.id + "_" + j.id] = -1));
        Vv["y_" + j.id] = y; model.ints["y_" + j.id] = 1;
      }
      for (const pl of D.PLANTS) Vv["f_" + pl.id + "_" + j.id] = { cost: p.inbound * H.km(pl, j) / 1000, ["bal_" + j.id]: -1, ["pcap_" + pl.id]: 1 };
      for (const c of D.CUSTOMERS) {
        const km = H.km(j, c);
        if (p.maxKm > 0 && km > p.maxKm) continue;
        const v = { cost: dem[c.id] * p.outbound * km / 1000, ["dem_" + c.id]: 1, ["cap_" + j.id]: dem[c.id], ["bal_" + j.id]: dem[c.id] };
        if (p.minFastPct > 0 && km <= p.fastKm) v.fast = dem[c.id];
        if (!fixed) { v["lnk_" + c.id + "_" + j.id] = 1; C["lnk_" + c.id + "_" + j.id] = { max: 0 }; }
        Vv["x_" + c.id + "_" + j.id] = v;
      }
    }
    if (!fixed && p.maxDcs > 0) C.cnt = { max: p.maxDcs };
    if (p.minFastPct > 0) C.fast = { min: p.minFastPct / 100 * total };
    const res = getSolver().Solve(model);
    if (!res.feasible) return { feasible: false };
    const open = fixed ? D.DCS.filter(j => fixed.has(j.id)).map(j => j.id) : dcs.filter(j => (res["y_" + j.id] || 0) > 0.5).map(j => j.id);
    const assign = {}, load = {};
    open.forEach(id => (load[id] = 0));
    let outK = 0, inK = 0, fast = 0, wkm = 0;
    for (const c of D.CUSTOMERS) {
      let best = null, bx = 0;
      for (const j of dcs) {
        const x = res["x_" + c.id + "_" + j.id] || 0;
        if (x < 1e-6) continue;
        const km = H.km(j, c);
        outK += dem[c.id] * x * p.outbound * km / 1000;
        wkm += dem[c.id] * x * km;
        if (km <= p.fastKm) fast += dem[c.id] * x;
        if (load[j.id] !== undefined) load[j.id] += dem[c.id] * x;
        if (x > bx) { bx = x; best = j.id; }
      }
      assign[c.id] = best;
    }
    const flows = {};
    for (const pl of D.PLANTS) for (const j of dcs) {
      const f = res["f_" + pl.id + "_" + j.id] || 0;
      if (f > 1e-6) { flows[pl.id + "_" + j.id] = f; inK += p.inbound * H.km(pl, j) * f / 1000; }
    }
    const fixK = open.reduce((s, id) => s + H.dc(id).fix, 0);
    const plantUse = {};
    D.PLANTS.forEach(pl => (plantUse[pl.id] = D.DCS.reduce((s, j) => s + (flows[pl.id + "_" + j.id] || 0), 0)));
    return {
      feasible: true, open, assign, load, flows, plantUse, fixK, inK, outK, total: fixK + inK + outK,
      fastPct: 100 * fast / total, avgKm: wkm / total, perPallet: 1000 * (fixK + inK + outK) / total, demandTotal: total,
      maxKmUsed: Math.max(...D.CUSTOMERS.map(c => (assign[c.id] ? H.km(H.dc(assign[c.id]), c) : 0)))
    };
  };
  // All 127 networks for a given demand (used for the "runner-up" table and the robustness step)
  H.enumerate = function (p, demand) {
    const n = D.DCS.length, out = [];
    for (let m = 1; m < (1 << n); m++) {
      const ids = D.DCS.filter((_, i) => m & (1 << i)).map(j => j.id);
      const r = H.solve(p, { open: ids, demand });
      if (r.feasible) out.push(r);
    }
    return out.sort((a, b) => a.total - b.total);
  };
  H.names = ids => ids.map(id => H.dc(id).short).join(", ");

  /* ================= K: weighted k-means (Lloyd's algorithm, k-means++ start) ================= */
  const K = {};
  K.proj = projector(47.2, 19.4);
  K.run = function (pts, k, seed, restarts) {
    const rng = mulberry32(seed || 11);
    const P = pts.map(p => Object.assign({}, K.proj(p), { w: p.w, id: p.id }));
    let best = null;
    for (let r = 0; r < (restarts || 12); r++) {
      // k-means++: next centre drawn with probability proportional to w·distance²
      const cs = [];
      const tw = P.reduce((s, p) => s + p.w, 0);
      let x = rng() * tw, first = P[P.length - 1];
      for (const p of P) { x -= p.w; if (x <= 0) { first = p; break; } }
      cs.push({ x: first.x, y: first.y });
      while (cs.length < k) {
        const d2 = P.map(p => p.w * Math.min(...cs.map(c => (p.x - c.x) ** 2 + (p.y - c.y) ** 2)));
        let s = rng() * d2.reduce((a, b) => a + b, 0), pick = P[P.length - 1];
        for (let i = 0; i < P.length; i++) { s -= d2[i]; if (s <= 0) { pick = P[i]; break; } }
        cs.push({ x: pick.x, y: pick.y });
      }
      let assign = [], iter = 0, moved = true;
      while (moved && iter++ < 100) {
        moved = false;
        const na = P.map(p => { let bi = 0, bd = Infinity; cs.forEach((c, i) => { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; });
        if (na.join() !== assign.join()) moved = true;
        assign = na;
        cs.forEach((c, i) => {
          const m = P.filter((_, q) => assign[q] === i), w = m.reduce((s, p) => s + p.w, 0);
          if (w > 0) { c.x = m.reduce((s, p) => s + p.w * p.x, 0) / w; c.y = m.reduce((s, p) => s + p.w * p.y, 0) / w; }
        });
      }
      const sse = P.reduce((s, p, q) => s + p.w * ((p.x - cs[assign[q]].x) ** 2 + (p.y - cs[assign[q]].y) ** 2), 0);
      const wdist = P.reduce((s, p, q) => s + p.w * Math.hypot(p.x - cs[assign[q]].x, p.y - cs[assign[q]].y), 0) / P.reduce((s, p) => s + p.w, 0);
      if (!best || sse < best.sse) best = { centers: cs.map(c => ({ x: c.x, y: c.y })), assign, sse, wdist, iter };
    }
    return best;
  };
  // Back from planar km to lat/lon (for the maps)
  K.unproj = function (c) { const kx = Math.cos(47.2 * Math.PI / 180) * 111.32; return { lat: 47.2 - c.y / 110.57, lon: 19.4 + c.x / kx }; };
  // Snap every centroid to the nearest still unused candidate DC
  K.snap = function (centers) {
    const used = new Set(), out = [];
    centers.map(c => K.unproj(c)).forEach(c => {
      let best = null, bd = Infinity;
      D.DCS.forEach(j => { if (used.has(j.id)) return; const d = haversine(c, j); if (d < bd) { bd = d; best = j.id; } });
      used.add(best); out.push({ center: c, dc: best, km: bd });
    });
    return out;
  };

  /* ================= T: travel-time machine learning ================= */
  const T = {};
  const TR = D.TRUTH;
  T.isPeak = h => h >= TR.peak[0] && h < TR.peak[1];
  // Expected "true" minutes (the hidden data-generating process)
  T.truth = function (km, u, hour) {
    const pk = T.isPeak(hour);
    const vu = pk ? TR.urbanPeakKmh : TR.urbanKmh, vr = pk ? TR.ruralPeakKmh : TR.ruralKmh;
    return TR.access + km * 60 * (u / vu + (1 - u) / vr);
  };
  // Historical trip log from the telematics system (synthetic)
  T.log = (function () {
    let cache = null;
    return function () {
      if (cache) return cache;
      const rng = mulberry32(4242), rows = [];
      for (let i = 0; i < TR.logSize; i++) {
        const u = Math.min(1, Math.max(0, rng() ** 0.9));
        const km = Math.round(10 * Math.max(1.5, Math.exp(Math.log(4) + rng() * Math.log(18)) * (1.15 - 0.6 * u))) / 10;
        const hour = Math.round(10 * (5.75 + rng() * 9)) / 10;
        const min = Math.max(2, T.truth(km, u, hour) * (1 + TR.noise * gaussian(rng)));
        rows.push({ id: i + 1, km, u: Math.round(100 * u) / 100, hour, min: Math.round(10 * min) / 10, set: (s => (s < 0.6 ? "train" : s < 0.8 ? "val" : "test"))(rng()) });
      }
      cache = rows;
      return rows;
    };
  })();
  // 60% training (fit the model), 20% validation (choose the settings), 20% test (final, untouched check)
  T.train = () => T.log().filter(r => r.set === "train");
  T.val = () => T.log().filter(r => r.set === "val");
  T.test = () => T.log().filter(r => r.set === "test");
  T.FEATS = [{ k: "u", name: "urban share" }, { k: "hour", name: "departure hour" }, { k: "km", name: "distance (km)" }];
  // Model 1: multiple linear regression on the raw features: minutes = b0 + b1·km + b2·urban + b3·hour
  T.fitLinear = function (rows) {
    const X = rows.map(r => [1, r.km, r.u, r.hour]);
    const b = ols(X, rows.map(r => r.min));
    return { b, predict: (km, u, hour) => Math.max(1, b[0] + b[1] * km + b[2] * u + b[3] * hour) };
  };
  // Model 2: regression tree (CART) on pace = minutes per km; prediction = pace × km
  T.fitTree = function (rows, depth, minLeaf, keys) {
    minLeaf = minLeaf || 12;
    const feats = T.FEATS.filter(x => !keys || keys.includes(x.k));
    const data = rows.map(r => ({ u: r.u, hour: r.hour, km: r.km, y: r.min / r.km }));
    let leaves = 0;
    function build(set, d) {
      const mean = set.reduce((s, r) => s + r.y, 0) / set.length;
      const node = { n: set.length, value: mean };
      if (d >= depth || set.length < 2 * minLeaf) { leaves++; return node; }
      let best = null;
      const sse0 = set.reduce((s, r) => s + (r.y - mean) ** 2, 0);
      for (const f of feats) {
        const s = set.slice().sort((a, b) => a[f.k] - b[f.k]);
        let sl = 0, sl2 = 0, tot = 0, tot2 = 0;
        s.forEach(r => { tot += r.y; tot2 += r.y * r.y; });
        for (let i = 0; i < s.length - 1; i++) {
          sl += s[i].y; sl2 += s[i].y * s[i].y;
          const nl = i + 1, nr = s.length - nl;
          if (nl < minLeaf || nr < minLeaf || s[i][f.k] === s[i + 1][f.k]) continue;
          const sse = (sl2 - sl * sl / nl) + ((tot2 - sl2) - (tot - sl) ** 2 / nr);
          if (!best || sse < best.sse) best = { sse, f, thr: (s[i][f.k] + s[i + 1][f.k]) / 2 };
        }
      }
      if (!best || best.sse >= sse0 - 1e-9) { leaves++; return node; }
      node.f = best.f.k; node.fname = best.f.name; node.thr = best.thr; node.gain = sse0 - best.sse;
      node.left = build(set.filter(r => r[best.f.k] <= best.thr), d + 1);
      node.right = build(set.filter(r => r[best.f.k] > best.thr), d + 1);
      return node;
    }
    const tree = build(data, 0);
    const pace = (u, hour, km) => { let n = tree; const x = { u, hour, km }; while (n.f) n = x[n.f] <= n.thr ? n.left : n.right; return n.value; };
    return { tree, leaves, predict: (km, u, hour) => Math.max(1, pace(u, hour, km) * km) };
  };
  T.dispatcher = { predict: km => km / D.VRP.dispatcherKmh * 60 };
  T.mae = (m, rows) => rows.reduce((s, r) => s + Math.abs(m.predict(r.km, r.u, r.hour) - r.min), 0) / rows.length;
  T.DEFAULT_DEPTH = 4;
  T.models = (function () {
    let cache = null;
    return function () {
      if (cache) return cache;
      const tr = T.train();
      cache = {
        dispatcher: T.dispatcher,
        linear: T.fitLinear(tr),
        tree: T.fitTree(tr, T.DEFAULT_DEPTH),
        truth: { predict: (km, u, hour) => T.truth(km, u, hour) }
      };
      return cache;
    };
  })();
  T.MODEL_NAMES = { dispatcher: "Dispatcher's rule (50 km/h)", linear: "Linear regression", tree: "Regression tree (ML)", truth: "Reality (expected)" };

  /* ================= V: vehicle routing with time windows ================= */
  const V = {};
  const VP = D.VRP;
  V.SLOT0 = 5 * 60; V.SLOT = 15; V.NSLOT = 56; // 05:00 ... 19:00 in 15-minute slots
  V.instance = (function () {
    const cache = {};
    return function (day) {
      if (cache[day]) return cache[day];
      const stores = D.STORES.filter(s => s[day] > 0);
      const nodes = [D.DEPOT].concat(stores);
      const n = nodes.length, km = [], u = [];
      for (let a = 0; a < n; a++) {
        km.push([]); u.push([]);
        for (let b = 0; b < n; b++) { km[a].push(haversine(nodes[a], nodes[b]) * VP.roadFactor); u[a].push((nodes[a].urb + nodes[b].urb) / 2); }
      }
      const idx = {}; nodes.forEach((x, i) => (idx[x.id] = i));
      const pal = nodes.map(x => (x.id === "DC" ? 0 : x[day]));
      const inst = {
        day, nodes, stores, n, km, u, idx, pal,
        open: nodes.map(x => (x.win ? toMin(x.win[0]) : 0)),
        close: nodes.map(x => (x.win ? toMin(x.win[1]) : 24 * 60)),
        totalPal: pal.reduce((s, v) => s + v, 0), tt: {}
      };
      cache[day] = inst;
      return inst;
    };
  })();
  V.slot = t => Math.max(0, Math.min(V.NSLOT - 1, Math.floor((t - V.SLOT0) / V.SLOT)));
  // Travel-time matrix for a model: minutes[a][b][slot] (time-dependent, piecewise constant by 15 min)
  V.tt = function (inst, key) {
    if (inst.tt[key]) return inst.tt[key];
    const m = T.models()[key], out = [];
    for (let a = 0; a < inst.n; a++) {
      out.push([]);
      for (let b = 0; b < inst.n; b++) {
        const row = [];
        for (let s = 0; s < V.NSLOT; s++) row.push(a === b ? 0 : m.predict(inst.km[a][b], inst.u[a][b], (V.SLOT0 + s * V.SLOT + 7.5) / 60));
        out[a].push(row);
      }
    }
    inst.tt[key] = out;
    return out;
  };
  V.service = pal => VP.serviceBase + VP.servicePerPallet * pal;
  // Full evaluation of a plan (array of routes, each an array of store ids) under a travel-time model
  V.evaluate = function (inst, routes, key) {
    const tt = V.tt(inst, key || "tree"), errors = [], seen = {};
    const details = [];
    let km = 0, late = 0, otMin = 0, trucks = 0, waitMin = 0, palUsed = 0;
    routes.forEach((r0, k) => {
      const r = r0.filter(id => inst.idx[id] !== undefined && id !== "DC");
      if (!r.length) return;
      trucks++;
      let t = VP.depart, prev = 0, rkm = 0, load = 0;
      const stops = [];
      for (const id of r) {
        const i = inst.idx[id];
        seen[id] = (seen[id] || 0) + 1;
        rkm += inst.km[prev][i];
        t += tt[prev][i][V.slot(t)];
        const arrive = t, wait = Math.max(0, inst.open[i] - t);
        t += wait; waitMin += wait;
        const isLate = arrive > inst.close[i] + 0.01;
        if (isLate) late++;
        stops.push({ id, name: inst.nodes[i].name, arrive, start: t, wait, late: isLate, open: inst.open[i], close: inst.close[i], pal: inst.pal[i] });
        t += V.service(inst.pal[i]); load += inst.pal[i]; prev = i;
      }
      rkm += inst.km[prev][0];
      t += tt[prev][0][V.slot(t)];
      const ot = Math.max(0, t - VP.shiftEnd);
      otMin += ot; km += rkm; palUsed += load;
      if (load > VP.cap) errors.push(`Route ${k + 1} is overloaded: ${load} pallets > ${VP.cap}`);
      details.push({ k, route: r, km: rkm, load, back: t, ot, stops, overloaded: load > VP.cap });
    });
    const missing = inst.stores.filter(s => !seen[s.id]).map(s => s.id);
    const dup = Object.keys(seen).filter(id => seen[id] > 1);
    if (missing.length) errors.push("Not visited: " + missing.join(", "));
    if (dup.length) errors.push("Visited more than once: " + dup.join(", "));
    const fixC = trucks * VP.fixDay, kmC = km * VP.perKm, lateC = late * VP.latePenalty, otC = otMin / 60 * VP.overtime;
    return {
      valid: !errors.length, errors, details, trucks, km, late, otMin, waitMin,
      fixC, kmC, lateC, otC, cost: fixC + kmC + lateC + otC,
      onTimePct: 100 * (inst.stores.length - late) / inst.stores.length,
      util: trucks ? 100 * palUsed / (trucks * VP.cap) : 0, missing, dup
    };
  };
  V.cost = (inst, routes, key) => V.evaluate(inst, routes, key).cost;

  // Nearest neighbour by distance: the dispatcher's habit
  V.nearest = function (inst) {
    const left = new Set(inst.stores.map(s => s.id)), routes = [];
    while (left.size) {
      let cur = 0, load = 0; const r = [];
      for (;;) {
        let best = null, bd = Infinity;
        for (const id of left) { const i = inst.idx[id]; if (load + inst.pal[i] > VP.cap) continue; if (inst.km[cur][i] < bd) { bd = inst.km[cur][i]; best = id; } }
        if (!best) break;
        r.push(best); left.delete(best); load += inst.pal[inst.idx[best]]; cur = inst.idx[best];
      }
      routes.push(r);
    }
    return routes;
  };
  // Clarke-Wright savings, merges accepted only if the full (time-aware) cost decreases
  V.savings = function (inst, key) {
    const cost = rs => V.cost(inst, rs, key);
    const load = r => r.reduce((s, id) => s + inst.pal[inst.idx[id]], 0);
    let routes = inst.stores.map(s => [s.id]);
    const sav = [];
    for (const a of inst.stores) for (const b of inst.stores) {
      if (a.id >= b.id) continue;
      const i = inst.idx[a.id], j = inst.idx[b.id];
      sav.push({ a: a.id, b: b.id, s: inst.km[0][i] + inst.km[0][j] - inst.km[i][j] });
    }
    sav.sort((x, y) => y.s - x.s);
    for (const { a, b } of sav) {
      const ra = routes.find(r => r.includes(a)), rb = routes.find(r => r.includes(b));
      if (ra === rb || load(ra) + load(rb) > VP.cap) continue;
      const cands = [];
      if (ra[ra.length - 1] === a && rb[0] === b) cands.push(ra.concat(rb));
      if (rb[rb.length - 1] === b && ra[0] === a) cands.push(rb.concat(ra));
      if (ra[0] === a && rb[0] === b) cands.push(ra.slice().reverse().concat(rb));
      if (ra[ra.length - 1] === a && rb[rb.length - 1] === b) cands.push(ra.concat(rb.slice().reverse()));
      let best = null, bc = cost([ra]) + cost([rb]);
      for (const c of cands) { const cc = cost([c]); if (cc < bc - 1e-6) { bc = cc; best = c; } }
      if (best) routes = routes.filter(r => r !== ra && r !== rb).concat([best]);
    }
    return routes;
  };
  // Local search: 2-opt inside a route, relocate between routes (first improvement)
  V.improve = function (inst, routes, key) {
    const load = r => r.reduce((s, id) => s + inst.pal[inst.idx[id]], 0);
    const cost = rs => V.cost(inst, rs.filter(r => r.length), key);
    routes = routes.map(r => r.slice());
    let improved = true, guard = 0;
    while (improved && guard++ < 300) {
      improved = false;
      for (let k = 0; k < routes.length && !improved; k++) {
        const r = routes[k], before = cost([r]);
        for (let i = 0; i < r.length - 1 && !improved; i++) for (let j = i + 1; j < r.length; j++) {
          const nr = r.slice(0, i).concat(r.slice(i, j + 1).reverse(), r.slice(j + 1));
          if (cost([nr]) < before - 1e-6) { routes[k] = nr; improved = true; break; }
        }
      }
      if (improved) continue;
      const base = cost(routes);
      outer: for (let a = 0; a < routes.length; a++) for (let i = 0; i < routes[a].length; i++) {
        const id = routes[a][i];
        for (let b = 0; b <= routes.length; b++) {
          const target = b === routes.length ? [] : routes[b];
          if (a !== b && load(target) + inst.pal[inst.idx[id]] > VP.cap) continue;
          for (let pos = 0; pos <= target.length; pos++) {
            if (a === b && (pos === i || pos === i + 1)) continue;
            const cp = routes.map(r => r.slice());
            if (b === routes.length) cp.push([]);
            cp[a].splice(i, 1);
            cp[b].splice(a === b && pos > i ? pos - 1 : pos, 0, id);
            if (cost(cp) < base - 1e-6) { routes = cp.filter(r => r.length); improved = true; break outer; }
          }
        }
      }
    }
    return routes.filter(r => r.length);
  };
  // Order a cluster: nearest neighbour then local search (used by the cluster-first methods)
  V.orderCluster = function (inst, ids, key) {
    const r = [], left = new Set(ids); let cur = 0;
    while (left.size) { let best = null, bd = Infinity; for (const id of left) { const i = inst.idx[id]; if (inst.km[cur][i] < bd) { bd = inst.km[cur][i]; best = id; } } r.push(best); left.delete(best); cur = inst.idx[best]; }
    return V.improve(inst, [r], key)[0] || r;
  };
  V.angle = (inst, id) => { const pr = projector(D.DEPOT.lat, D.DEPOT.lon), q = pr(inst.nodes[inst.idx[id]]); return Math.atan2(-q.y, q.x); };
  // Sweep: sort stores by polar angle around the depot, cut a new cluster when the truck is full
  V.sweep = function (inst, key) {
    const ids = inst.stores.map(s => s.id).sort((a, b) => V.angle(inst, a) - V.angle(inst, b));
    // start the sweep at the largest angular gap
    let gi = 0, gap = -1;
    ids.forEach((id, i) => { const nx = ids[(i + 1) % ids.length]; let g = V.angle(inst, nx) - V.angle(inst, id); if (g <= 0) g += 2 * Math.PI; if (g > gap) { gap = g; gi = (i + 1) % ids.length; } });
    const ord = ids.slice(gi).concat(ids.slice(0, gi)), clusters = [];
    let cur = [], load = 0;
    for (const id of ord) { const p = inst.pal[inst.idx[id]]; if (load + p > VP.cap) { clusters.push(cur); cur = []; load = 0; } cur.push(id); load += p; }
    if (cur.length) clusters.push(cur);
    return { clusters, routes: clusters.map(c => V.orderCluster(inst, c, key)) };
  };
  // k-means clusters (k = minimum number of trucks), then a capacity repair, then routing
  V.kmeansRoutes = function (inst, key) {
    const k = Math.ceil(inst.totalPal / VP.cap);
    const km = K.run(inst.stores.map(s => ({ id: s.id, lat: s.lat, lon: s.lon, w: 1 })), k, 5, 15);
    const clusters = Array.from({ length: k }, () => []);
    inst.stores.forEach((s, q) => clusters[km.assign[q]].push(s.id));
    const before = clusters.map(c => c.slice());
    const load = c => c.reduce((s, id) => s + inst.pal[inst.idx[id]], 0);
    const P = K.proj, cen = km.centers;
    let guard = 0;
    while (clusters.some(c => load(c) > VP.cap) && guard++ < 60) {
      const ci = clusters.findIndex(c => load(c) > VP.cap);
      // move the store whose second-nearest centre is closest, to that cluster (if it fits)
      let best = null;
      for (const id of clusters[ci]) {
        const q = P(inst.nodes[inst.idx[id]]);
        cen.forEach((c, j) => {
          if (j === ci || load(clusters[j]) + inst.pal[inst.idx[id]] > VP.cap) return;
          const d = Math.hypot(q.x - c.x, q.y - c.y);
          if (!best || d < best.d) best = { id, j, d };
        });
      }
      if (!best) { clusters.push([clusters[ci].pop()]); continue; }
      clusters[ci] = clusters[ci].filter(x => x !== best.id); clusters[best.j].push(best.id);
    }
    return { before, clusters, centers: cen.map(c => K.unproj(c)), routes: clusters.filter(c => c.length).map(c => V.orderCluster(inst, c, key)) };
  };

  /* ---- Construction framework for the AI-designed heuristic ----
     Standalone (no closures), because it is also injected into a Web Worker.
     P: plain instance; score(c, s): lower = visit next; non-finite for all = close the route. */
  function kestrelConstruct(P, score) {
    const slot = t => Math.max(0, Math.min(P.nslot - 1, Math.floor((t - P.slot0) / P.slotLen)));
    const left = new Set(); for (let i = 1; i < P.n; i++) left.add(i);
    const routes = [], warnings = [];
    let calls = 0, guard = 0;
    while (left.size && guard++ < 500) {
      let cur = 0, t = P.depart, load = 0; const r = [];
      for (;;) {
        const cands = [];
        for (const i of left) {
          if (load + P.pal[i] > P.cap) continue;
          const min = P.tt[cur][i][slot(t)], arrive = t + min, start = Math.max(arrive, P.open[i]);
          const back = P.tt[i][0][slot(start + P.svc[i])];
          cands.push({ i, c: Object.freeze({
            id: P.ids[i], name: P.names[i], km: P.km[cur][i], min, arrive, open: P.open[i], close: P.close[i],
            slack: P.close[i] - arrive, wait: Math.max(0, P.open[i] - arrive), late: arrive > P.close[i],
            pallets: P.pal[i], service: P.svc[i], kmToDepot: P.km[i][0], minToDepot: back,
            finish: start + P.svc[i], urban: P.urb[i], angle: P.ang[i]
          }) });
        }
        if (!cands.length) break;
        const s = Object.freeze({ clock: t, load, cap: P.cap, room: P.cap - load, route: routes.length + 1, stopsInRoute: r.length,
          storesLeft: left.size, palletsLeft: [...left].reduce((a, i) => a + P.pal[i], 0), shiftEnd: P.shiftEnd, atDepot: cur === 0,
          trucksMin: Math.ceil([...left].reduce((a, i) => a + P.pal[i], 0) / P.cap) });
        let best = null, bv = Infinity;
        for (const x of cands) {
          calls++;
          const v = Number(score(x.c, s));
          if (isFinite(v) && v < bv) { bv = v; best = x; }
        }
        if (!best) {
          if (r.length) break;
          warnings.push("score() returned no finite value on an empty truck: fell back to the nearest store");
          best = cands.reduce((a, b) => (b.c.km < a.c.km ? b : a));
        }
        const i = best.i;
        t = Math.max(t + P.tt[cur][i][slot(t)], P.open[i]) + P.svc[i];
        load += P.pal[i]; r.push(i); left.delete(i); cur = i;
      }
      if (r.length) routes.push(r.map(i => P.ids[i]));
    }
    return { routes, calls, warnings };
  }
  V.construct = kestrelConstruct;
  V.plain = function (inst, key) {
    const pr = projector(D.DEPOT.lat, D.DEPOT.lon);
    return {
      n: inst.n, ids: inst.nodes.map(x => x.id), names: inst.nodes.map(x => x.name), km: inst.km, tt: V.tt(inst, key),
      pal: inst.pal, open: inst.open, close: inst.close, svc: inst.pal.map(p => V.service(p)),
      urb: inst.nodes.map(x => x.urb), ang: inst.nodes.map(x => { const q = pr(x); return Math.round(Math.atan2(-q.y, q.x) * 180 / Math.PI); }),
      cap: VP.cap, depart: VP.depart, shiftEnd: VP.shiftEnd, slot0: V.SLOT0, slotLen: V.SLOT, nslot: V.NSLOT
    };
  };
  V.RULES = {
    nearest: "function score(c, s) {\n  // nearest neighbour: go to the closest store\n  return c.km;\n}",
    urgent: "function score(c, s) {\n  // most urgent first: the store whose window closes soonest after our arrival\n  return c.slack;\n}"
  };

  /* ================= P: reading AI answers ================= */
  const P = {};
  // First JSON object in a text (code fences allowed)
  P.json = function (txt) {
    const t = String(txt || "").replace(/```(?:json)?/gi, "");
    const s = t.indexOf("{");
    if (s < 0) throw new Error("No JSON object found.");
    let depth = 0, inStr = false, esc = false;
    for (let i = s; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (!depth) return JSON.parse(t.slice(s, i + 1)); }
    }
    throw new Error("The JSON object is not closed.");
  };
  // A "function score(c, s) { ... }" from an AI answer
  P.code = function (txt) {
    let t = String(txt || "");
    const fence = t.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    const m = t.match(/function\s+score\s*\(/);
    if (!m) throw new Error('No "function score(c, s)" found in the answer.');
    let i = t.indexOf("{", m.index), depth = 0;
    for (let k = i; k < t.length; k++) {
      if (t[k] === "{") depth++;
      else if (t[k] === "}") { depth--; if (!depth) return t.slice(m.index, k + 1); }
    }
    throw new Error("The function body is not closed (missing }).");
  };

  /* ================= A: checking the AI modeller's specification ================= */
  const A = {};
  A.FIELDS = [
    { k: "demand_basis", label: "Demand basis" },
    { k: "must_open", label: "Must stay open" },
    { k: "must_close", label: "Must stay closed" },
    { k: "max_dcs", label: "Maximum number of DCs" },
    { k: "max_distance_km", label: "Maximum customer distance" },
    { k: "service", label: "Service-level constraint" },
    { k: "plant_min_utilisation_pct", label: "Plant minimum utilisation" }
  ];
  const ids = v => (Array.isArray(v) ? v.map(x => String(x).toUpperCase().trim()).sort() : []);
  const nz = v => (v === null || v === undefined || v === "" || v === 0 ? null : Number(v));
  A.check = function (spec) {
    const key = D.BRIEF_KEY, rows = [];
    const eqArr = (a, b) => JSON.stringify(ids(a)) === JSON.stringify(ids(b));
    const pm = o => { const out = {}; Object.keys(o || {}).forEach(k => { const v = nz(o[k]); if (v) out[k.toUpperCase()] = v; }); return out; };
    const sv = o => (o && nz(o.radius_km) && nz(o.min_share_pct) ? { radius_km: Number(o.radius_km), min_share_pct: Number(o.min_share_pct) } : null);
    for (const f of A.FIELDS) {
      const a = spec[f.k], b = key[f.k];
      let ok;
      if (f.k === "must_open" || f.k === "must_close") ok = eqArr(a, b);
      else if (f.k === "service") ok = JSON.stringify(sv(a)) === JSON.stringify(sv(b));
      else if (f.k === "plant_min_utilisation_pct") ok = JSON.stringify(pm(a)) === JSON.stringify(pm(b));
      else if (f.k === "demand_basis") ok = String(a || "").toLowerCase() === b;
      else ok = nz(a) === nz(b);
      rows.push({ k: f.k, label: f.label, ai: a === undefined ? "(missing)" : JSON.stringify(a), key: JSON.stringify(b), ok });
    }
    return { rows, score: rows.filter(r => r.ok).length, of: rows.length };
  };
  A.toParams = function (spec) {
    const p = {};
    p.mustOpen = ids(spec.must_open).filter(id => D.DCS.some(j => j.id === id));
    p.mustClose = ids(spec.must_close).filter(id => D.DCS.some(j => j.id === id));
    p.maxDcs = nz(spec.max_dcs) || 0;
    p.maxKm = nz(spec.max_distance_km) || 0;
    if (spec.service && nz(spec.service.radius_km) && nz(spec.service.min_share_pct)) { p.fastKm = Number(spec.service.radius_km); p.minFastPct = Number(spec.service.min_share_pct); }
    p.plantMinPct = {};
    Object.keys(spec.plant_min_utilisation_pct || {}).forEach(k => { const v = nz(spec.plant_min_utilisation_pct[k]); if (v) p.plantMinPct[k.toUpperCase()] = v; });
    const basis = String(spec.demand_basis || "actual2025").toLowerCase() === "forecast2030" ? "pooled2030" : "actual2025";
    return { p, basis };
  };
  A.keyParams = () => A.toParams(D.BRIEF_KEY);

  // Numbers in a text that can (or cannot) be matched to known values (±2%)
  P.numbers = function (txt) {
    const out = [], re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|k|km|pallets?|trucks?|EUR|€)?/gi;
    let m;
    while ((m = re.exec(txt || ""))) out.push({ text: m[0].trim(), value: Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : "")), start: m.index, end: m.index + m[0].length });
    return out;
  };

  LT.core = { haversine, mulberry32, gaussian, projector, fmt, toMin, ols, F, H, K, T, V, P, A };
})(typeof window !== "undefined" ? window : globalThis);
