/* Kestrel Home & Garden Ltd. (fictional): the shared synthetic dataset.
   Every company, customer and number is invented for teaching purposes. */
(function (root) {
  const LT = (root.LT = root.LT || {});

  /* ---------- Shared map: simplified outline of Hungary (lon, lat) ---------- */
  const HU_OUTLINE = [
    [16.11, 46.87], [16.27, 46.98], [16.45, 47.40], [16.65, 47.62], [16.42, 47.66],
    [16.75, 47.70], [17.07, 48.03], [17.25, 48.02], [17.70, 47.76], [18.10, 47.76],
    [18.70, 47.80], [18.85, 47.83], [18.90, 48.05], [19.48, 48.18], [19.80, 48.21],
    [20.10, 48.27], [20.45, 48.56], [20.85, 48.58], [21.40, 48.57], [21.72, 48.35],
    [22.15, 48.41], [22.45, 48.24], [22.90, 47.97], [22.60, 47.78], [22.32, 47.73],
    [22.00, 47.40], [21.65, 47.03], [21.42, 46.92], [21.23, 46.42], [20.75, 46.25],
    [20.26, 46.12], [19.70, 46.17], [19.10, 46.03], [18.87, 45.92], [18.48, 45.80],
    [17.85, 45.79], [17.40, 45.95], [17.10, 46.20], [16.85, 46.38], [16.60, 46.47],
    [16.38, 46.62], [16.11, 46.87]
  ];

  /* =====================================================================
     SESSION A: distribution network design
     ===================================================================== */
  // Two plants. Capacity: pallets / year.
  const PLANTS = [
    { id: "P1", name: "Szolnok plant", short: "Szolnok", lat: 47.174, lon: 20.176, cap: 9000 },
    { id: "P2", name: "Zalaegerszeg plant", short: "Zalaegerszeg", lat: 46.840, lon: 16.844, cap: 8000 }
  ];

  // Candidate distribution centres. fix: k EUR / year (lease, staff, systems); cap: pallets / year.
  const DCS = [
    { id: "D1", name: "Budapest-Ecser", short: "Ecser", lat: 47.444, lon: 19.325, fix: 150, cap: 17000, existing: true },
    { id: "D2", name: "Győr", short: "Győr", lat: 47.687, lon: 17.650, fix: 95, cap: 5000 },
    { id: "D3", name: "Pécs", short: "Pécs", lat: 46.072, lon: 18.233, fix: 85, cap: 4500 },
    { id: "D4", name: "Szeged", short: "Szeged", lat: 46.253, lon: 20.148, fix: 88, cap: 4500 },
    { id: "D5", name: "Debrecen", short: "Debrecen", lat: 47.531, lon: 21.627, fix: 90, cap: 5000 },
    { id: "D6", name: "Miskolc", short: "Miskolc", lat: 48.103, lon: 20.778, fix: 82, cap: 4500 },
    { id: "D7", name: "Kecskemét", short: "Kecskemét", lat: 46.906, lon: 19.692, fix: 84, cap: 5000 }
  ];

  // Customers: regional hubs of garden-centre and DIY chains.
  // hist: delivered pallets per year 2020-2025. Drivers (used by the pooled ML model):
  //   housing  = new homes completed per 1,000 residents per year (2022-2024 average)
  //   jobs     = employment growth in the catchment area, % per year (2022-2024 average)
  //   detached = share of households living in detached houses (%), i.e. households with a garden
  const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
  const CUSTOMERS = [
    { id: "C01", name: "Budapest North", lat: 47.560, lon: 19.090, housing: 4.5, jobs: 1, detached: 20, hist: [2072, 1870, 1901, 2040, 2063, 2085] },
    { id: "C02", name: "Budapest South", lat: 47.420, lon: 19.070, housing: 4, jobs: 0.8, detached: 25, hist: [1420, 1499, 1484, 1514, 1332, 1429] },
    { id: "C03", name: "Budaörs", lat: 47.461, lon: 18.958, housing: 8.5, jobs: 2.5, detached: 65, hist: [1050, 1122, 1221, 1115, 1194, 1179] },
    { id: "C04", name: "Győr", lat: 47.687, lon: 17.650, housing: 6.5, jobs: 3, detached: 45, hist: [783, 852, 788, 821, 908, 1039] },
    { id: "C05", name: "Székesfehérvár", lat: 47.186, lon: 18.422, housing: 5.5, jobs: 2.2, detached: 48, hist: [694, 672, 684, 707, 711, 898] },
    { id: "C06", name: "Veszprém", lat: 47.093, lon: 17.911, housing: 4, jobs: 1, detached: 50, hist: [518, 521, 457, 510, 456, 485] },
    { id: "C07", name: "Szombathely", lat: 47.230, lon: 16.621, housing: 4.5, jobs: 1.5, detached: 52, hist: [474, 525, 566, 541, 494, 563] },
    { id: "C08", name: "Zalaegerszeg", lat: 46.840, lon: 16.844, housing: 3, jobs: 0.2, detached: 55, hist: [436, 389, 415, 428, 409, 412] },
    { id: "C09", name: "Kaposvár", lat: 46.359, lon: 17.796, housing: 2, jobs: -0.8, detached: 55, hist: [543, 569, 497, 399, 500, 426] },
    { id: "C10", name: "Pécs", lat: 46.072, lon: 18.233, housing: 2.5, jobs: -0.3, detached: 45, hist: [823, 904, 842, 873, 836, 723] },
    { id: "C11", name: "Szekszárd", lat: 46.350, lon: 18.706, housing: 1.8, jobs: -1, detached: 60, hist: [382, 390, 396, 317, 310, 294] },
    { id: "C12", name: "Kecskemét", lat: 46.906, lon: 19.692, housing: 6, jobs: 3.5, detached: 55, hist: [560, 636, 590, 713, 710, 638] },
    { id: "C13", name: "Szeged", lat: 46.253, lon: 20.148, housing: 4, jobs: 1.2, detached: 45, hist: [824, 911, 817, 817, 894, 827] },
    { id: "C14", name: "Békéscsaba", lat: 46.679, lon: 21.091, housing: 1.5, jobs: -1.2, detached: 62, hist: [503, 446, 437, 461, 408, 419] },
    { id: "C15", name: "Szolnok", lat: 47.174, lon: 20.176, housing: 2.5, jobs: 0, detached: 55, hist: [540, 548, 551, 523, 577, 505] },
    { id: "C16", name: "Debrecen", lat: 47.531, lon: 21.627, housing: 7, jobs: 3.8, detached: 50, hist: [824, 832, 800, 888, 881, 1026] },
    { id: "C17", name: "Nyíregyháza", lat: 47.955, lon: 21.717, housing: 4.5, jobs: 1.5, detached: 58, hist: [578, 625, 630, 686, 641, 591] },
    { id: "C18", name: "Miskolc", lat: 48.103, lon: 20.778, housing: 2, jobs: -0.8, detached: 40, hist: [778, 888, 808, 835, 743, 874] },
    { id: "C19", name: "Eger", lat: 47.903, lon: 20.377, housing: 3, jobs: 0, detached: 55, hist: [448, 451, 451, 427, 429, 533] },
    { id: "C20", name: "Salgótarján", lat: 48.098, lon: 19.803, housing: 1, jobs: -1.8, detached: 58, hist: [314, 307, 304, 300, 316, 284] }
  ];

  const NET = {
    outbound: 0.30,   // EUR / pallet / km, DC -> customer (multi-drop delivery)
    inbound: 0.07,    // EUR / pallet / km, plant -> DC (full truckload)
    roadFactor: 1.25, // straight line -> road distance
    fastKm: 120,      // within this road distance: next-day delivery
    planYear: 2030,
    // constraints that can be switched on (the AI-modeller task sets these)
    maxKm: 0, minFastPct: 0, maxDcs: 0, mustOpen: [], mustClose: [], plantMinPct: {}
  };

  // The CEO's memo for the AI-modeller task, and its correct translation (the "answer key")
  const BRIEF = [
    "We are redesigning the network for 2030, so please use the 2030 demand forecast, not last year's actuals.",
    "Ecser stays open whatever happens: we signed a 10-year lease last spring.",
    "The Miskolc site is off the table, the landlord withdrew the offer.",
    "The board will not approve more than four DCs in total, Ecser included.",
    "Customer service promise: at least 80% of all pallets must be delivered from a DC within 120 km road distance (next-day delivery).",
    "No customer may be served from a DC more than 220 km away by road.",
    "The union agreement at the Zalaegerszeg plant guarantees at least 90% capacity utilisation there.",
    "Marketing would love to have a DC in Pécs because of the regional brand campaign, but this is a wish, not a requirement.",
    "Personally I'd prefer fewer sites if the cost difference is small, but let the numbers decide."
  ];
  const BRIEF_KEY = {
    demand_basis: "forecast2030",
    must_open: ["D1"],
    must_close: ["D6"],
    max_dcs: 4,
    max_distance_km: 220,
    service: { radius_km: 120, min_share_pct: 80 },
    plant_min_utilisation_pct: { P2: 90 }
  };

  /* =====================================================================
     SESSION B: daily delivery routes from the Ecser DC
     ===================================================================== */
  // urb = how urban the surroundings are (0 = open road, 1 = inner city).
  // win = delivery window (the store accepts goods only in this interval).
  // d1 / d2 = pallets on Friday (day 1) and Monday (day 2); 0 = no delivery that day.
  const DEPOT = { id: "DC", name: "Ecser DC", lat: 47.444, lon: 19.325, urb: 0.45 };
  const STORES = [
    { id: "G01", name: "Bp XI Újbuda", lat: 47.470, lon: 19.040, urb: 1.0, win: ["06:30", "09:30"], d1: 4, d2: 3 },
    { id: "G02", name: "Bp III Óbuda", lat: 47.545, lon: 19.040, urb: 1.0, win: ["06:30", "09:30"], d1: 3, d2: 0 },
    { id: "G03", name: "Bp XV Rákospalota", lat: 47.560, lon: 19.120, urb: 0.95, win: ["06:30", "09:30"], d1: 2, d2: 3 },
    { id: "G04", name: "Bp XVIII Pestszentlőrinc", lat: 47.430, lon: 19.190, urb: 0.9, win: ["06:30", "09:30"], d1: 3, d2: 2 },
    { id: "G05", name: "Bp XXII Budafok", lat: 47.420, lon: 19.030, urb: 0.9, win: ["06:30", "09:30"], d1: 0, d2: 3 },
    { id: "G06", name: "Budaörs", lat: 47.461, lon: 18.958, urb: 0.7, win: ["07:00", "12:00"], d1: 5, d2: 4 },
    { id: "G07", name: "Törökbálint", lat: 47.430, lon: 18.910, urb: 0.6, win: ["07:00", "12:00"], d1: 2, d2: 0 },
    { id: "G08", name: "Érd", lat: 47.378, lon: 18.913, urb: 0.6, win: ["08:00", "13:00"], d1: 3, d2: 3 },
    { id: "G09", name: "Szentendre", lat: 47.669, lon: 19.076, urb: 0.45, win: ["08:00", "12:00"], d1: 2, d2: 2 },
    { id: "G10", name: "Vác", lat: 47.776, lon: 19.134, urb: 0.4, win: ["07:00", "11:00"], d1: 4, d2: 3 },
    { id: "G11", name: "Dunakeszi", lat: 47.630, lon: 19.138, urb: 0.6, win: ["07:00", "13:00"], d1: 3, d2: 2 },
    { id: "G12", name: "Gödöllő", lat: 47.597, lon: 19.355, urb: 0.5, win: ["08:00", "13:00"], d1: 3, d2: 4 },
    { id: "G13", name: "Veresegyház", lat: 47.654, lon: 19.284, urb: 0.4, win: ["08:00", "13:00"], d1: 0, d2: 2 },
    { id: "G14", name: "Monor", lat: 47.351, lon: 19.449, urb: 0.3, win: ["07:00", "13:00"], d1: 2, d2: 2 },
    { id: "G15", name: "Cegléd", lat: 47.172, lon: 19.800, urb: 0.3, win: ["07:00", "11:00"], d1: 4, d2: 3 },
    { id: "G16", name: "Dabas", lat: 47.186, lon: 19.311, urb: 0.25, win: ["08:00", "13:00"], d1: 2, d2: 0 },
    { id: "G17", name: "Ráckeve", lat: 47.161, lon: 18.944, urb: 0.2, win: ["08:00", "13:00"], d1: 0, d2: 2 },
    { id: "G18", name: "Szigetszentmiklós", lat: 47.344, lon: 19.044, urb: 0.6, win: ["07:00", "12:00"], d1: 3, d2: 3 },
    { id: "G19", name: "Százhalombatta", lat: 47.330, lon: 18.912, urb: 0.4, win: ["08:00", "13:00"], d1: 2, d2: 0 },
    { id: "G20", name: "Zsámbék", lat: 47.546, lon: 18.718, urb: 0.2, win: ["08:00", "13:00"], d1: 1, d2: 2 },
    { id: "G21", name: "Nagykáta", lat: 47.414, lon: 19.744, urb: 0.2, win: ["07:00", "12:00"], d1: 0, d2: 3 },
    { id: "G22", name: "Gyömrő", lat: 47.427, lon: 19.400, urb: 0.35, win: ["07:00", "13:00"], d1: 2, d2: 0 },
    { id: "G23", name: "Pilisvörösvár", lat: 47.616, lon: 18.910, urb: 0.35, win: ["08:00", "13:00"], d1: 0, d2: 2 },
    { id: "G24", name: "Biatorbágy", lat: 47.470, lon: 18.820, urb: 0.35, win: ["07:00", "12:00"], d1: 3, d2: 2 }
  ];
  const DAYS = { d1: "Friday", d2: "Monday" };

  const VRP = {
    cap: 14,            // pallets per truck
    fixDay: 120,        // EUR per truck per day (driver, lease, insurance)
    perKm: 1.10,        // EUR per km (fuel, tyres, tolls)
    depart: 6 * 60,     // 06:00, minutes after midnight
    shiftEnd: 14 * 60 + 30, // 14:30: return after this is overtime
    overtime: 30,       // EUR per hour of overtime
    serviceBase: 12,    // minutes per stop (docking, paperwork)
    servicePerPallet: 2,// minutes per pallet unloaded
    latePenalty: 80,    // EUR per stop reached after its window closed
    roadFactor: 1.3,
    dispatcherKmh: 50   // the dispatcher's rule of thumb: "trucks do 50 km/h"
  };

  // How travel really works (hidden "ground truth", only used to generate the trip log and the
  // reality check). Pace in minutes per km depends on the urban share of the leg and on the rush hour.
  const TRUTH = { access: 3, urbanKmh: 28, urbanPeakKmh: 16, ruralKmh: 75, ruralPeakKmh: 62, peak: [6.5, 9.5], noise: 0.08, logSize: 420 };

  LT.data = {
    HU_OUTLINE, PLANTS, DCS, YEARS, CUSTOMERS, NET, BRIEF, BRIEF_KEY,
    DEPOT, STORES, DAYS, VRP, TRUTH
  };
})(typeof window !== "undefined" ? window : globalThis);
