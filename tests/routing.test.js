/*
 * Tests for js/routing.js. No dependencies:
 *   Node:    node tests/routing.test.js
 *   Browser: open tests/index.html
 */
(function () {
  "use strict";
  const isNode = typeof module === "object" && typeof require === "function";
  let R, SAMPLE;
  if (isNode) {
    R = require("../js/routing.js");
    global.window = global.window || {};
    require("../data/sample.js");
    SAMPLE = global.window.SAMPLE_DATA;
  } else {
    R = window.Routing; SAMPLE = window.SAMPLE_DATA;
  }

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || "assertion failed"); };
  const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg || "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg || "not close"}: ${a} vs ${b}`);
  const clone = o => JSON.parse(JSON.stringify(o));
  const point = (lat, lng) => ({ lat, lng });

  /* ---------- distanceKm ---------- */
  test("distanceKm is zero for the same point", () => {
    near(R.distanceKm(point(-20.66, -40.5), point(-20.66, -40.5)), 0, 1e-9);
  });
  test("distanceKm applies the road factor to the great-circle distance", () => {
    // One degree of latitude is about 111.19 km.
    near(R.distanceKm(point(0, 0), point(1, 0)), 111.19 * R.PARAMS.ROAD_FACTOR, 0.5);
  });

  /* ---------- parseCoord ---------- */
  test("parseCoord reads decimal pairs", () => {
    eq(R.parseCoord("-20.671234, -40.501234"), { lat: -20.671234, lng: -40.501234 });
    eq(R.parseCoord("-20.671234 -40.501234"), { lat: -20.671234, lng: -40.501234 });
  });
  test("parseCoord reads comma decimals separated by a semicolon", () => {
    eq(R.parseCoord("-20,6415; -40,5148"), { lat: -20.6415, lng: -40.5148 });
  });
  test("parseCoord reads degrees with hemispheres (W and Portuguese O)", () => {
    eq(R.parseCoord("20.671234° S, 40.501234° W"), { lat: -20.671234, lng: -40.501234 });
    eq(R.parseCoord("20.5° S 40.5° O"), { lat: -20.5, lng: -40.5 });
  });
  test("parseCoord reads Google Maps links", () => {
    eq(R.parseCoord("https://www.google.com/maps/@-20.662,-40.498,17z"), { lat: -20.662, lng: -40.498 });
    eq(R.parseCoord("https://www.google.com/maps/place/X/@-1,-1,17z/data=!3m1!4b1!3d-20.6415012!4d-40.5148034"), { lat: -20.641501, lng: -40.514803 });
    eq(R.parseCoord("https://maps.google.com/?q=-20.65,-40.49"), { lat: -20.65, lng: -40.49 });
  });
  test("parseCoord rejects text and out-of-range values", () => {
    eq(R.parseCoord("Rua das Acácias, 120"), null);
    eq(R.parseCoord(""), null);
    eq(R.parseCoord("-120.5, -40.5"), null);
  });

  /* ---------- groupStops ---------- */
  test("groupStops merges orders at the same point", () => {
    const stops = R.groupStops([
      { id: 1, lat: -20.1, lng: -40.1 }, { id: 2, lat: -20.2, lng: -40.2 }, { id: 3, lat: -20.1, lng: -40.1 },
    ]);
    eq(stops.map(s => s.ids), [[1, 3], [2]]);
  });

  /* ---------- solve ---------- */
  const grid = n => Array.from({ length: n }, (_, i) => point(-20.65 - (i % 5) * 0.004, -40.49 - Math.floor(i / 5) * 0.004));

  test("solve visits every stop exactly once", () => {
    const stops = grid(17), routes = R.solve(stops, point(-20.64, -40.51), 3, false, 20);
    eq(routes.length, 3, "one route per courier");
    eq(routes.flat().sort((a, b) => a - b), [...Array(17).keys()], "each stop once");
  });
  test("solve handles no stops and no couriers", () => {
    eq(R.solve([], null, 2, false), [[], []]);
    eq(R.solve(grid(3), null, 0, false), []);
  });
  test("solve is deterministic", () => {
    const stops = grid(15), depot = point(-20.64, -40.51);
    eq(R.solve(stops, depot, 3, false, 30), R.solve(stops, depot, 3, false, 30));
  });
  test("solve gives each courier one of two far-apart clusters", () => {
    const west = [0, 1, 2, 3].map(i => point(-20.66 + i * 0.001, -40.60));
    const east = [0, 1, 2, 3].map(i => point(-20.66 + i * 0.001, -40.40));
    const routes = R.solve(west.concat(east), point(-20.66, -40.50), 2, false, 30);
    const sides = routes.map(r => new Set(r.map(i => (i < 4 ? "west" : "east"))));
    assert(sides.every(s => s.size === 1), "a route mixes both clusters");
    assert(sides[0].values().next().value !== sides[1].values().next().value, "both routes on the same side");
  });

  /* ---------- computeRoutes / routesAreValid ---------- */
  test("computeRoutes routes only active orders that have coordinates", () => {
    const plan = clone(SAMPLE), routes = R.computeRoutes(plan);
    const routed = Object.values(routes).flat();
    const expected = plan.orders.filter(o => o.status === "routed" && o.lat !== null).map(o => o.id);
    eq(routed.slice().sort((a, b) => a - b), expected.sort((a, b) => a - b));
    plan.routes = routes;
    assert(R.routesAreValid(plan), "routes should be valid");
  });
  test("routesAreValid catches duplicates and missing orders", () => {
    const plan = clone(SAMPLE);
    plan.routes = R.computeRoutes(plan);
    const dup = clone(plan); dup.routes.c1.push(dup.routes.c2[0]);
    assert(!R.routesAreValid(dup), "duplicate not detected");
    const missing = clone(plan); missing.routes.c1.pop();
    assert(!R.routesAreValid(missing), "missing order not detected");
  });
  test("computeRoutes keeps couriers on similar routes after a small change", () => {
    const plan = clone(SAMPLE);
    plan.routes = R.computeRoutes(plan);
    const before = clone(plan.routes);
    plan.orders.find(o => o.id === before.c1[0]).status = "skipped";
    const after = R.computeRoutes(plan);
    for (const id of ["c1", "c2", "c3"]) {
      const kept = after[id].filter(x => before[id].includes(x)).length;
      assert(kept >= after[id].length / 2, `${id} lost most of its route`);
    }
  });

  /* ---------- routeMetrics / mapsLinks ---------- */
  test("routeMetrics adds items and uses the time model", () => {
    const depot = point(0, 0), plan = { depot, returnToDepot: false };
    const m = R.routeMetrics([{ id: 1, qty: 2, lat: 0.01, lng: 0 }, { id: 2, qty: 3, lat: 0.01, lng: 0 }], plan);
    eq(m.items, 5); eq(m.stops, 1);
    near(m.minutes, m.km / R.PARAMS.SPEED_KMH * 60 + R.PARAMS.MIN_PER_STOP, 1e-9);
  });
  test("mapsLinks splits long routes into parts of up to 10 points", () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({ id: i, qty: 1, lat: -20 - i * 0.001, lng: -40 }));
    const links = R.mapsLinks(orders, { depot: point(-19.9, -40), returnToDepot: false });
    eq(links.length, 3, "21 points need 3 links");
    assert(links.every(l => l.startsWith("https://www.google.com/maps/dir/?api=1")), "unexpected link format");
  });

  /* ---------- runner ---------- */
  let failed = 0;
  const results = tests.map(t => {
    try { t.fn(); return { name: t.name, ok: true }; }
    catch (e) { failed++; return { name: t.name, ok: false, error: e.message }; }
  });
  if (isNode) {
    for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : "\n    " + r.error}`);
    console.log(`\n${results.length - failed}/${results.length} passed`);
    if (failed) process.exitCode = 1;
  } else {
    window.TEST_RESULTS = results;
    const out = document.getElementById("results");
    out.innerHTML = results.map(r => `<li class="${r.ok ? "ok" : "fail"}">${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `<pre>${r.error}</pre>`}</li>`).join("")
      + `<li class="total">${results.length - failed}/${results.length} passed</li>`;
  }
})();
