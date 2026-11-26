/*
 * Multi-courier delivery routing (a small VRP / mTSP solver).
 *
 * Goal: split the stops among the couriers so that the LAST courier to
 * finish finishes as early as possible (minimise the makespan), using the
 * total time as a tie-breaker.
 *
 * Heuristic:
 *   1. Greedy insertion: each stop goes into the position (in any route)
 *      that increases the objective the least, in a random order.
 *   2. Local search until no move improves the objective:
 *        - 2-opt inside each route (reverse a segment);
 *        - relocate one stop to another position or route;
 *        - swap two stops between routes.
 *   3. Multi-start: repeat from many random orders and keep the best.
 *
 * The random generator is seeded, so the same input always produces the
 * same routes and every device shows the same plan.
 *
 * Works in the browser (window.Routing) and in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Routing = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PARAMS = {
    SPEED_KMH: 25,      // average speed estimate
    MIN_PER_STOP: 4,    // time spent at each stop
    ROAD_FACTOR: 1.35,  // road distance ≈ straight-line distance × factor
    SEED: 2026,
  };

  const hasCoord = o => typeof o.lat === "number" && typeof o.lng === "number" && isFinite(o.lat) && isFinite(o.lng);

  /** Estimated road distance in km (haversine × ROAD_FACTOR). */
  function distanceKm(a, b) {
    const R = 6371, t = Math.PI / 180;
    const dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * PARAMS.ROAD_FACTOR;
  }

  /** Seeded pseudo-random generator (mulberry32). */
  function rng(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Parses a coordinate pasted by a user. Accepts:
   *   "-20.671234, -40.501234" · "-20,6712; -40,5012"
   *   "20.671234° S, 40.501234° W" (Portuguese O/L also work)
   *   Google Maps links (@lat,lng · !3dlat!4dlng · ?q=lat,lng)
   */
  function parseCoord(text) {
    if (!text) return null;
    const s = String(text).trim();
    const ok = (lat, lng) => (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? { lat: +lat.toFixed(6), lng: +lng.toFixed(6) } : null;
    let m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      || s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
    if (m) return ok(+m[1], +m[2]);
    m = s.match(/(\d+(?:[.,]\d+)?)\s*°?\s*([NS])\b[\s,;]*(\d+(?:[.,]\d+)?)\s*°?\s*([EWOL])\b/i);
    if (m) {
      const lat = parseFloat(m[1].replace(",", ".")) * (/s/i.test(m[2]) ? -1 : 1);
      const lng = parseFloat(m[3].replace(",", ".")) * (/[wo]/i.test(m[4]) ? -1 : 1);
      return ok(lat, lng);
    }
    m = s.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/) || s.match(/(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)/);
    if (m) return ok(parseFloat(m[1].replace(",", ".")), parseFloat(m[2].replace(",", ".")));
    return null;
  }

  /** Groups orders that share the same point into a single stop. */
  function groupStops(orders) {
    const stops = [];
    for (const o of orders) {
      const key = o.lat.toFixed(6) + "," + o.lng.toFixed(6);
      const s = stops.find(x => x.key === key);
      if (s) s.ids.push(o.id); else stops.push({ key, lat: o.lat, lng: o.lng, ids: [o.id] });
    }
    return stops;
  }

  /**
   * Solves the problem for `stops` ({lat,lng}) and `couriers` vehicles.
   * Returns one list of stop indexes per courier, longest route first.
   */
  function solve(stops, depot, couriers, returnToDepot, restarts) {
    const N = stops.length, V = couriers;
    if (V < 1) return [];
    if (!N) return Array.from({ length: V }, () => []);
    const pts = stops.concat(depot ? [depot] : []), d = N;
    const D = pts.map(a => pts.map(b => distanceKm(a, b)));
    const routeKm = r => {
      if (!r.length) return 0;
      let s = depot ? D[d][r[0]] : 0;
      for (let i = 1; i < r.length; i++) s += D[r[i - 1]][r[i]];
      if (depot && returnToDepot) s += D[r[r.length - 1]][d];
      return s;
    };
    const routeMin = r => routeKm(r) / PARAMS.SPEED_KMH * 60 + r.length * PARAMS.MIN_PER_STOP;
    const score = R => { let max = 0, sum = 0; for (const r of R) { const t = routeMin(r); if (t > max) max = t; sum += t; } return max * 1000 + sum; };

    function localSearch(R) {
      let best = score(R), improved = true;
      while (improved) {
        improved = false;
        // 2-opt inside each route
        for (const r of R) for (let i = 0; i < r.length - 1; i++) for (let j = i + 1; j < r.length; j++) {
          const old = r.slice(i, j + 1); r.splice(i, j - i + 1, ...old.slice().reverse());
          const s = score(R); if (s < best - 1e-9) { best = s; improved = true; } else r.splice(i, j - i + 1, ...old);
        }
        // relocate one stop
        for (let a = 0; a < R.length; a++) for (let i = 0; i < R[a].length; i++) {
          const x = R[a][i]; R[a].splice(i, 1); let move = null;
          for (let b = 0; b < R.length; b++) for (let j = 0; j <= R[b].length; j++) {
            if (b === a && j === i) continue;
            R[b].splice(j, 0, x); const s = score(R); R[b].splice(j, 1);
            if (s < best - 1e-9 && (!move || s < move.s)) move = { b, j, s };
          }
          if (move) { R[move.b].splice(move.j, 0, x); best = move.s; improved = true; break; }
          R[a].splice(i, 0, x);
        }
        // swap stops between routes
        for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++)
          for (let i = 0; i < R[a].length; i++) for (let j = 0; j < R[b].length; j++) {
            [R[a][i], R[b][j]] = [R[b][j], R[a][i]];
            const s = score(R); if (s < best - 1e-9) { best = s; improved = true; } else [R[a][i], R[b][j]] = [R[b][j], R[a][i]];
          }
      }
      return best;
    }

    const rand = rng(PARAMS.SEED);
    const T = restarts || (N <= 40 ? 140 : 50);
    let bestRoutes = null, bestScore = Infinity;
    for (let it = 0; it < T; it++) {
      const order = [...Array(N).keys()];
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const R = Array.from({ length: V }, () => []);
      for (const x of order) {
        let move = null;
        for (let b = 0; b < V; b++) for (let j = 0; j <= R[b].length; j++) {
          R[b].splice(j, 0, x); const s = score(R); R[b].splice(j, 1);
          if (!move || s < move.s) move = { b, j, s };
        }
        R[move.b].splice(move.j, 0, x);
      }
      const s = localSearch(R);
      if (s < bestScore) { bestScore = s; bestRoutes = R.map(r => r.slice()); }
    }
    return bestRoutes.sort((a, b) => routeMin(b) - routeMin(a));
  }

  /** Orders that take part in routing. */
  const activeOrders = plan => plan.orders.filter(o => o.status === "routed" && hasCoord(o));

  /**
   * Computes the plan's routes and returns {courierId: [orderIds]}.
   * Each courier keeps the new route most similar to the one they had,
   * so "John's route" is still John's after a small change.
   */
  function computeRoutes(plan) {
    const stops = groupStops(activeOrders(plan));
    const fresh = solve(stops, plan.depot, plan.couriers.length, !!plan.returnToDepot).map(r => r.flatMap(i => stops[i].ids));
    const previous = plan.routes || {};
    const freeCouriers = new Set(plan.couriers.map(c => c.id)), freeRoutes = new Set(fresh.map((_, i) => i));
    const pairs = [];
    plan.couriers.forEach(c => fresh.forEach((r, i) => {
      const old = new Set(previous[c.id] || []);
      pairs.push({ courier: c.id, route: i, overlap: r.filter(id => old.has(id)).length });
    }));
    pairs.sort((a, b) => b.overlap - a.overlap);
    const result = {};
    for (const p of pairs) {
      if (p.overlap > 0 && freeCouriers.has(p.courier) && freeRoutes.has(p.route)) {
        result[p.courier] = fresh[p.route]; freeCouriers.delete(p.courier); freeRoutes.delete(p.route);
      }
    }
    const rest = [...freeRoutes];
    for (const c of plan.couriers) if (freeCouriers.has(c.id)) result[c.id] = fresh[rest.shift()] || [];
    return result;
  }

  /** Do the stored routes cover exactly the active orders, with no repeats? */
  function routesAreValid(plan) {
    if (!plan.routes) return false;
    const ids = plan.couriers.map(c => c.id);
    if (Object.keys(plan.routes).length !== ids.length || ids.some(id => !Array.isArray(plan.routes[id]))) return false;
    const all = ids.flatMap(id => plan.routes[id]), expected = new Set(activeOrders(plan).map(o => o.id));
    return all.length === expected.size && new Set(all).size === all.length && all.every(id => expected.has(id));
  }

  /** Distance, time, stops and item count of a route. */
  function routeMetrics(routeOrders, plan) {
    const stops = groupStops(routeOrders);
    let km = 0, prev = plan.depot || null;
    for (const s of stops) { if (prev) km += distanceKm(prev, s); prev = s; }
    if (plan.depot && plan.returnToDepot && stops.length) km += distanceKm(prev, plan.depot);
    return {
      km,
      minutes: km / PARAMS.SPEED_KMH * 60 + stops.length * PARAMS.MIN_PER_STOP,
      stops: stops.length,
      items: routeOrders.reduce((a, o) => a + (+o.qty || 0), 0),
    };
  }

  /** Google Maps direction links for a route (split into chunks of up to 10 points). */
  function mapsLinks(routeOrders, plan) {
    const pts = (plan.depot ? [plan.depot] : []).concat(groupStops(routeOrders));
    if (plan.depot && plan.returnToDepot) pts.push(plan.depot);
    const c = p => p.lat.toFixed(6) + "," + p.lng.toFixed(6), out = [];
    if (pts.length === 1) return ["https://www.google.com/maps/search/?api=1&query=" + c(pts[0])];
    for (let i = 0; i < pts.length - 1; i += 9) {
      const chunk = pts.slice(i, i + 10); if (chunk.length < 2) break;
      const mid = chunk.slice(1, -1).map(c).join("%7C");
      out.push(`https://www.google.com/maps/dir/?api=1&origin=${c(chunk[0])}&destination=${c(chunk[chunk.length - 1])}${mid ? `&waypoints=${mid}` : ""}&travelmode=driving`);
    }
    return out;
  }

  return { PARAMS, distanceKm, rng, parseCoord, hasCoord, groupStops, solve, activeOrders, computeRoutes, routesAreValid, routeMetrics, mapsLinks };
});
