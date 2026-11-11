/* Aggregation logic: the same function runs in the browser (local mode)
   and in Google Apps Script (apps-script/Code.gs). If you change it,
   change it in BOTH places! */
var LT_POINTS = {
  RANK: [15, 12, 10, 8], // optimisation contests: 1st, 2nd, 3rd, 4th place
  RANK_REST: 6,          // every further valid submission
  PEER: 3                // every vote received in a peer vote
};

function ltAggregate(events) {
  var teams = {}, lastVote = {}, bestResult = {}, lastText = {}, lastPeer = {}, lastBonus = {};
  events.forEach(function (e) {
    if (!e || !e.team || !e.activity) return;
    teams[e.team] = true;
    var key = e.team + "|" + e.activity;
    var ts = Number(e.ts) || 0;
    if (e.kind === "vote") {
      if (!lastVote[key] || ts < lastVote[key].ts) lastVote[key] = { ts: ts, e: e }; // the first vote counts
    } else if (e.kind === "result") {
      var v = Number(e.value);
      if (isNaN(v)) return;
      var cur = bestResult[key];
      var better = !cur || (e.dir === "max" ? v > cur.value : v < cur.value);
      if (better) bestResult[key] = { ts: ts, value: v, e: e };
    } else if (e.kind === "text") {
      if (!lastText[key] || ts >= lastText[key].ts) lastText[key] = { ts: ts, e: e };
    } else if (e.kind === "peer") {
      if (e.option && e.option !== e.team && (!lastPeer[key] || ts >= lastPeer[key].ts)) lastPeer[key] = { ts: ts, e: e };
    } else if (e.kind === "bonus") {
      if (!lastBonus[key] || ts < lastBonus[key].ts) lastBonus[key] = { ts: ts, e: e }; // the first evaluation counts
    }
  });

  var points = {}, detail = {};
  Object.keys(teams).forEach(function (t) { points[t] = 0; detail[t] = {}; });
  function add(team, activity, p) {
    p = Number(p) || 0;
    if (!p) return;
    points[team] += p;
    detail[team][activity] = (detail[team][activity] || 0) + p;
  }

  var votes = {}, voted = {};
  Object.keys(lastVote).forEach(function (k) {
    var e = lastVote[k].e;
    voted[e.team] = voted[e.team] || {};
    voted[e.team][e.activity] = String(e.option || "");
    votes[e.activity] = votes[e.activity] || {};
    String(e.option || "").split("|").forEach(function (o) {
      if (!o) return;
      votes[e.activity][o] = (votes[e.activity][o] || 0) + 1;
    });
    add(e.team, e.activity, e.points);
  });

  var results = {};
  Object.keys(bestResult).forEach(function (k) {
    var r = bestResult[k], e = r.e;
    results[e.activity] = results[e.activity] || [];
    results[e.activity].push({ team: e.team, value: r.value, text: e.text || "", option: e.option || "", dir: e.dir || "min", ts: r.ts });
  });
  Object.keys(results).forEach(function (a) {
    var list = results[a];
    var dir = list[0].dir;
    list.sort(function (x, y) { return dir === "max" ? y.value - x.value || x.ts - y.ts : x.value - y.value || x.ts - y.ts; });
    list.forEach(function (r, i) {
      r.rank = i + 1;
      r.points = i < LT_POINTS.RANK.length ? LT_POINTS.RANK[i] : LT_POINTS.RANK_REST;
      add(r.team, a, r.points);
    });
  });

  var texts = {};
  Object.keys(lastText).forEach(function (k) {
    var e = lastText[k].e;
    texts[e.activity] = texts[e.activity] || [];
    texts[e.activity].push({ team: e.team, text: e.text || "", value: e.value, option: e.option || "", ts: lastText[k].ts });
    add(e.team, e.activity, e.points);
  });
  Object.keys(texts).forEach(function (a) { texts[a].sort(function (x, y) { return x.ts - y.ts; }); });

  var peer = {};
  Object.keys(lastPeer).forEach(function (k) {
    var e = lastPeer[k].e;
    if (!teams[e.option]) return;
    peer[e.activity] = peer[e.activity] || {};
    peer[e.activity][e.option] = (peer[e.activity][e.option] || 0) + 1;
    add(e.option, e.activity, LT_POINTS.PEER);
  });

  Object.keys(lastBonus).forEach(function (k) {
    var e = lastBonus[k].e;
    add(e.team, e.activity, e.points);
  });

  var leaderboard = Object.keys(teams).map(function (t) {
    return { team: t, points: points[t], detail: detail[t] };
  }).sort(function (a, b) { return b.points - a.points || (a.team < b.team ? -1 : 1); });
  leaderboard.forEach(function (r, i) { r.rank = i + 1; });

  return {
    ok: true, teams: Object.keys(teams).sort(), votes: votes, voted: voted, results: results,
    texts: texts, peer: peer, leaderboard: leaderboard, eventCount: events.length
  };
}

if (typeof window !== "undefined") { window.ltAggregate = ltAggregate; window.LT_POINTS = LT_POINTS; }
if (typeof module !== "undefined") { module.exports = { ltAggregate: ltAggregate, LT_POINTS: LT_POINTS }; }
