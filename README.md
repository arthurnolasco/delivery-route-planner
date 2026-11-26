# Delivery Route Planner

A mobile-first web app that splits a list of home deliveries among several couriers and orders each route, so the **last courier finishes as early as possible**. Routes are re-optimised live whenever someone removes an order, adds a new one, changes the number of couriers or moves the starting point, and every phone sees the same plan.

Built for a real charity drive in Guarapari, Brazil, where a youth group sold homemade pies (*empadões*) and delivered 33 orders with 3 motorcycle couriers. The interface is in Brazilian Portuguese because that is who used it; the code and docs are in English.

> **Live demo:** runs with fictional data and needs no login. Add your deployed URL here.

## Why

The orders arrived as a spreadsheet of addresses and coordinates. Splitting them by hand ("you take the beach, I take downtown") leaves one courier riding twice as long as the others, and plans change on the day: a customer decides to pick up, an address turns out to be wrong, a new order comes in. The app turns that list into balanced routes in under a second and keeps them balanced as things change.

## Features

- **Balanced multi-courier routing**: minimises the time until the last delivery (makespan), then total time.
- **Live adjustments**: remove an order from a route, re-add skipped orders, add orders that were not on the original list, add/rename/remove couriers, change the depot, toggle "return to depot". Each change re-optimises all routes.
- **Stable assignments**: after a re-optimisation, each courier keeps the new route most similar to their old one, so a small change does not reshuffle everybody.
- **Map** (Leaflet + OpenStreetMap) with numbered stops, one colour per courier and a filter per courier.
- **Hand-off to the field**: one button opens the full route in Google Maps (split into parts when it exceeds Google's waypoint limit), another copies a WhatsApp-ready text with names, phones, notes and links.
- **Flexible coordinate input**: decimal pairs, comma decimals, `20.67° S, 40.49° W`, or a pasted Google Maps link.
- **Shared, password-protected plan** through Firebase (Auth + Firestore), with real-time sync across devices.
- **Demo mode** with fictional data and localStorage, so the project can be tried without any backend.
- **Light and dark themes**, safe-area aware layout, works one-handed on a phone.

## How the routing works

This is a small instance of the **Vehicle Routing Problem** (multiple Travelling Salesman). Exact solvers are overkill for ~30 stops in a browser, so [`js/routing.js`](js/routing.js) uses a multi-start local search:

1. **Objective.** For each route: `travel time + stops × 4 min`, with travel time from distance at 25 km/h. The score is `max(route times) × 1000 + sum(route times)`: first make the slowest courier faster, then break ties by total effort.
2. **Distances.** Haversine distance × 1.35 as a cheap stand-in for road distance (no routing API needed).
3. **Construction.** Stops are inserted one by one, in random order, at the position (in any route) that increases the score the least.
4. **Improvement.** Repeat until nothing improves:
   - **2-opt** inside a route (reverse a segment),
   - **relocate** a stop to another position or route,
   - **swap** two stops between routes.
5. **Multi-start.** Steps 3–4 run 140 times from different random orders; the best plan wins. The random generator is **seeded**, so the same input always gives the same routes on every device.
6. **Grouping.** Orders at the same address become a single stop.

For the real event (28 routable orders, 3 couriers) this runs in roughly 0.3 s on a laptop.

**Known limitations**

- Straight-line distance × factor ignores one-way streets, rivers and hills. A distance matrix from a routing engine (e.g. OSRM) would make the estimates closer to reality.
- No vehicle capacity or delivery time windows.
- Re-optimising may move stops between couriers who are already on the road. A "lock routes" mode that only inserts new orders would fit that moment better.

## Project structure

```
index.html              markup and script loading (no build step)
css/style.css           design tokens, light/dark themes, mobile layout
js/routing.js           optimisation and geo helpers (browser + Node, no dependencies)
js/app.js               UI rendering, actions, map, Firebase / demo persistence
js/config.example.js    template for js/config.js (git-ignored)
data/sample.js          fictional sample plan used by demo mode
firestore.rules         security rules: only the shared account can read/write
tests/routing.test.js   unit tests for js/routing.js
tests/index.html        runs the same tests in a browser
```

## Running locally

It is a static site. Serve the folder with any static server and open it:

```bash
npx serve .            # or: python -m http.server 8000
```

Without `js/config.js` the app starts in **demo mode** with the fictional data in `data/sample.js`. You can also force demo mode with `?demo` in the URL.

### Tests

```bash
node tests/routing.test.js
```

or open `tests/index.html` through the static server. The tests cover coordinate parsing, distance, stop grouping, that every stop is routed exactly once, determinism, cluster separation, stable courier assignment, route metrics and Google Maps link splitting.

## Using it with Firebase (shared plan)

1. Create a Firebase project (the free Spark plan is enough) and register a **Web app**.
2. **Authentication** → enable **Email/Password**, add **one** user (the e-mail never needs to exist; people only type its password), and disable new sign-ups under *Settings → User actions*.
3. **Firestore** → create the database in production mode and publish [`firestore.rules`](firestore.rules) with your user's e-mail.
4. Copy `js/config.example.js` to `js/config.js` and fill in the web config, `loginEmail` and the header texts.
5. Deploy the folder to any static host (Netlify, Cloudflare Pages, GitHub Pages…), open it, sign in and import your orders (or use the sample).

The Firebase web config is public by design; access is enforced by the Firestore rules.

## Data format

The plan is a single JSON document (also the format for importing a file):

```jsonc
{
  "item": { "singular": "empadão", "plural": "empadões" },   // what is being delivered
  "depot": { "name": "Sede", "lat": -20.6415, "lng": -40.5148 },
  "returnToDepot": false,
  "couriers": [ { "id": "c1", "name": "Motoboy 1" } ],
  "orders": [
    {
      "id": 1, "name": "Ana Souza", "phone": "(27) 90000-0101", "qty": 2,
      "address": "Rua das Acácias, 120, Centro", "lat": -20.6705, "lng": -40.499,
      "notes": "", "status": "routed",   // "routed" or "skipped"
      "reason": ""                       // why it was skipped
    }
  ],
  "routes": { "c1": [1] }               // optional; computed when missing or stale
}
```

## Tech

Vanilla JavaScript, HTML and CSS (no framework, no build), [Leaflet](https://leafletjs.com/) with [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles, Firebase Authentication and Cloud Firestore.

## Privacy

The repository ships only fictional data. Real orders live in Firestore behind authentication and are never committed; keep any real export out of the repo.
