/* Shared activity registry: both missions and the instructor projector view use it */
(function () {
  const LT = (window.LT = window.LT || {});
  LT.ACT = {
    /* ---- Session A: network design ---- */
    a_guess: {
      m: 1, type: "guess", points: 5, title: "Guess: how many DCs?",
      question: "With today's (2025) demand, how many distribution centres give the lowest total annual cost?",
      options: [{ id: "1", label: "1 (only Ecser)" }, { id: "2", label: "2 DCs" }, { id: "3", label: "3 DCs" }, { id: "4", label: "4 DCs" }, { id: "5", label: "5 or more" }]
    },
    a_own: { m: 1, type: "contest", title: "Network contest", unit: "€k / year", dir: "min" },
    a_fc: {
      m: 1, type: "guess", points: 5, title: "Guess: which forecast wins?",
      question: "We train three models on 2020–2023 and test them on 2024–2025. Which one will have the smallest error?",
      options: [
        { id: "naive", label: "Naive", sub: "next years = last year" },
        { id: "trend", label: "Per-customer trend", sub: "a line through each customer's own history" },
        { id: "pooled", label: "Pooled regression (ML)", sub: "growth learned from demand drivers across all customers" }
      ]
    },
    a_shift: {
      m: 1, type: "guess", points: 5, title: "Guess: does 2030 change the network?",
      question: "If we design for the 2030 forecast instead of 2025 actuals, what happens to the optimal network?",
      options: [{ id: "same", label: "Stays the same" }, { id: "swap", label: "One DC moves to another city" }, { id: "add", label: "One more DC is needed" }, { id: "drop", label: "One DC fewer is enough" }]
    },
    a_kq: {
      m: 1, type: "quiz", points: 3, title: "Quiz: what does k-means ignore?",
      question: "k-means puts the cluster centres where the weighted distance to the customers is smallest. Which cost does it NOT see at all?",
      options: [{ id: "out", label: "Delivery cost (DC → customer)" }, { id: "fix", label: "Fixed cost of the DCs and their capacity" }, { id: "dem", label: "How large each customer is" }],
      right: "fix",
      explain: "k-means minimises the (demand-weighted) squared distance only. It has no idea that a DC costs a fixed amount per year, that capacity is limited, or that inbound transport from the plants matters. That is why it is a candidate generator, not a decision model."
    },
    a_ai: { m: 1, type: "ai", title: "AI as a modeller (LLM + solver)" },
    a_dec: { m: 1, type: "decision", points: 2, title: "My network recommendation to the CEO" },

    /* ---- Session B: routing ---- */
    b_guess: {
      m: 2, type: "guess", points: 5, title: "Guess: how many trucks?",
      question: "Friday: 19 stores, 53 pallets, 14-pallet trucks. How many trucks does a good plan use?",
      options: [{ id: "3", label: "3" }, { id: "4", label: "4" }, { id: "5", label: "5" }, { id: "6", label: "6 or more" }]
    },
    b_own: { m: 2, type: "contest", title: "Route contest (your Friday plan)", unit: "€ / day", dir: "min" },
    b_tt: {
      m: 2, type: "guess", points: 5, title: "Guess: best travel-time model",
      question: "Which model predicts the travel time of unseen trips (the test set) best?",
      options: [
        { id: "dispatcher", label: "Dispatcher's rule", sub: "every truck does 50 km/h" },
        { id: "linear", label: "Linear regression", sub: "minutes = b0 + b1·km + b2·urban + b3·hour" },
        { id: "tree", label: "Regression tree (ML)", sub: "if-then splits learned from the data" }
      ]
    },
    b_cq: {
      m: 2, type: "quiz", points: 3, title: "Quiz: cluster first, route second",
      question: "k-means grouped the stores into 4 geographic clusters, one per truck. What is the typical problem with this?",
      options: [{ id: "cap", label: "A cluster can hold more pallets than one truck can carry" }, { id: "km", label: "k-means always makes the routes longer than nearest neighbour" }, { id: "k", label: "k-means cannot be used with 4 clusters" }],
      right: "cap",
      explain: "k-means only looks at locations, not at pallets or time windows. A dense cluster can easily exceed the 14-pallet capacity, so a repair step has to move stores between clusters, and the time windows are still ignored."
    },
    b_heur: { m: 2, type: "contest", title: "AI heuristic contest (Friday + Monday)", unit: "€ / 2 days", dir: "min" },
    b_ai: { m: 2, type: "ai", title: "AI-designed heuristic: my judgement" },
    b_dec: { m: 2, type: "decision", points: 2, title: "My routing recommendation" }
  };
  Object.keys(LT.ACT).forEach(id => (LT.ACT[id].id = id));
  LT.MISSIONS = {
    1: { name: "Network", color: "var(--m1)" },
    2: { name: "Routing", color: "var(--m2)" }
  };
  // In the points breakdown "_eval" (guess evaluation) belongs to its guess
  LT.actMission = function (activity) {
    const base = String(activity).replace(/_eval$/, "");
    return (LT.ACT[base] && LT.ACT[base].m) || (/^a_/.test(activity) ? 1 : /^b_/.test(activity) ? 2 : 0);
  };
})();
