/* ============================================================
   apimock — build a mock API from one example response.

   Paste ONE example JSON response. apimock infers a schema
   (types, nested objects, arrays with element shape), then
   generates realistic variant records with a seeded PRNG so the
   same seed + example is byte-identical every run. It also emits
   ready-to-run mock artifacts: a json-server db.json, a
   dependency-free Node http server, and an OpenAPI 3.0 stub.

   No network. No dependencies. Everything runs in your browser.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- tiny DOM helpers ---------- */
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ============================================================
     SEEDED PRNG
     cyrb53 hashes a seed string to a 53-bit integer; mulberry32
     turns a 32-bit seed into a fast deterministic float stream.
     Same seed => identical sequence => byte-identical output.
     ============================================================ */
  function cyrb53(str, seed) {
    seed = seed || 0;
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A small RNG object built from a seed string. Deterministic.
  function makeRng(seedStr) {
    var rng = mulberry32(cyrb53(String(seedStr), 0));
    return {
      next: rng,
      int: function (min, max) { return min + Math.floor(rng() * (max - min + 1)); },
      pick: function (arr) { return arr[Math.floor(rng() * arr.length)]; },
      bool: function () { return rng() < 0.5; }
    };
  }

  /* ============================================================
     WORD CORPORA for believable fake values (all inline, offline)
     ============================================================ */
  var FIRST = ["Ava","Noah","Mia","Kai","Zoe","Leo","Isla","Arjun","Priya","Chen",
    "Nadia","Omar","Sofia","Liam","Emma","Yuki","Diego","Aisha","Marco","Elena",
    "Ravi","Hana","Theo","Nina","Sam","Lena","Ivan","Maya","Jonas","Farah"];
  var LAST = ["Rivera","Okafor","Nakamura","Fernandez","Haddad","Kowalski","Singh",
    "Larsson","Moreau","Bianchi","Novak","Reyes","Ahmed","Weber","Costa","Petrov",
    "Kim","Duarte","Vance","Holt","Mensah","Bauer","Silva","Cruz","Adeyemi"];
  var DOMAINS = ["example.com","mail.dev","inbox.test","acme.io","corp.net","hey.app"];
  var CITIES = ["Lisbon","Nairobi","Osaka","Medellin","Tallinn","Chennai","Porto",
    "Austin","Bergen","Da Nang","Split","Kigali","Leeds","Cebu","Almaty"];
  var COUNTRIES = ["Portugal","Kenya","Japan","Colombia","Estonia","India","Norway",
    "Vietnam","Croatia","Rwanda","Kazakhstan","Philippines","Canada","Chile"];
  var STREETS = ["Maple","Cedar","Harbor","Kingfisher","Aster","Willow","Beacon",
    "Juniper","Marlow","Sable","Verdant","Copper"];
  var STREET_TYPE = ["St","Ave","Rd","Lane","Way","Blvd"];
  var COMPANIES = ["Northwind","Umbra","Kestrel","Lumen","Fathom","Brightwave",
    "Ironwood","Solstice","Quanta","Driftwood","Vireo","Halcyon"];
  var COMPANY_SUFFIX = ["Labs","Systems","Co","Group","Studio","Works","Analytics"];
  var PRODUCTS = ["Wireless Mouse","Standing Desk","Cold Brew Kit","Trail Backpack",
    "Noise Earbuds","Ceramic Mug","Desk Lamp","Yoga Mat","Field Notebook","Water Bottle"];
  var STATUSES = ["active","pending","archived","suspended","trial","cancelled"];
  var ROLES = ["admin","member","viewer","editor","owner","guest"];
  var TAGS = ["new","featured","sale","limited","restock","seasonal","staff-pick"];
  var COLORS = ["slate","amber","teal","rose","indigo","olive","coral","cobalt"];
  var LOREM = ["lorem","ipsum","dolor","sit","amet","nova","flux","atlas","vector",
    "signal","ember","north","quiet","drift","prism","onyx","cobalt","harbor"];
  var TLD_PATHS = ["users","products","orders","posts","items","profiles","records"];

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  /* ============================================================
     KEY-NAME HEURISTICS
     Given a key name and the example value, produce a believable
     fake value of the SAME primitive type as the example.
     ============================================================ */
  // Detect whether an example string looks like a UUID.
  function looksUuid(s) {
    return typeof s === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }
  function looksIso(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s);
  }
  function looksEmail(s) { return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); }
  function looksUrl(s) { return typeof s === "string" && /^https?:\/\//i.test(s); }

  function fakeUuid(rng) {
    var hex = "0123456789abcdef";
    var out = "";
    var tmpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    for (var i = 0; i < tmpl.length; i++) {
      var c = tmpl[i];
      if (c === "-" || c === "4") { out += c; continue; }
      var r = rng.int(0, 15);
      if (c === "y") r = (r & 0x3) | 0x8;
      out += hex[r];
    }
    return out;
  }

  function fakeIso(rng) {
    // A plausible timestamp in the last ~2 years, UTC, second precision.
    var base = Date.UTC(2024, 0, 1, 0, 0, 0);
    var span = 1000 * 60 * 60 * 24 * 730; // ~2 years
    var d = new Date(base + Math.floor(rng.next() * span));
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function fakeDateOnly(rng) {
    return fakeIso(rng).slice(0, 10);
  }

  function fakeName(rng) { return rng.pick(FIRST) + " " + rng.pick(LAST); }

  function fakeEmail(rng, first, last) {
    var f = (first || rng.pick(FIRST)).toLowerCase();
    var l = (last || rng.pick(LAST)).toLowerCase();
    var styles = [
      f + "." + l,
      f + l,
      f[0] + l,
      f + rng.int(1, 99)
    ];
    return rng.pick(styles) + "@" + rng.pick(DOMAINS);
  }

  function fakeUrl(rng) {
    var host = slug(rng.pick(COMPANIES)) + "." + rng.pick(["com","io","dev","app"]);
    var path = rng.pick(TLD_PATHS) + "/" + rng.int(1, 9999);
    return "https://" + host + "/" + path;
  }

  function fakePhone(rng) {
    return "+1-" + rng.int(200, 989) + "-" + pad(rng.int(0, 999), 3) + "-" + pad(rng.int(0, 9999), 4);
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }

  function fakeSentence(rng, words) {
    words = words || rng.int(4, 9);
    var parts = [];
    for (var i = 0; i < words; i++) parts.push(rng.pick(LOREM));
    var s = parts.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  }

  function fakeWord(rng) {
    return rng.pick(LOREM);
  }

  // The classifier: returns a generator function (rng, ctx) => value.
  // ctx carries sibling-derived hints (e.g. a shared first/last name).
  function classifyString(key, example) {
    var k = key.toLowerCase();

    // value-shape wins first (the example already told us what it is)
    if (looksUuid(example)) return function (rng) { return fakeUuid(rng); };
    if (looksEmail(example)) return function (rng, ctx) { return fakeEmail(rng, ctx && ctx.first, ctx && ctx.last); };
    if (looksUrl(example)) return function (rng) { return fakeUrl(rng); };
    if (looksIso(example)) {
      var dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(example);
      return dateOnly ? function (rng) { return fakeDateOnly(rng); }
                      : function (rng) { return fakeIso(rng); };
    }

    // then key-name heuristics
    if (/(^|_)e?mail$/.test(k) || k.indexOf("email") !== -1) {
      return function (rng, ctx) { return fakeEmail(rng, ctx && ctx.first, ctx && ctx.last); };
    }
    if (k === "id" || /(^|_)id$/.test(k) || /^uu?id$/.test(k)) {
      // string id: keep it string-typed, uuid-ish
      return function (rng) { return fakeUuid(rng); };
    }
    if (/(_at$|_on$|date|time|timestamp)/.test(k)) {
      return function (rng) { return fakeIso(rng); };
    }
    if (k === "firstname" || k === "first_name" || k === "first" || k === "givenname" || k === "given_name") {
      return function (rng, ctx) { var v = rng.pick(FIRST); if (ctx) ctx.first = v; return v; };
    }
    if (k === "lastname" || k === "last_name" || k === "last" || k === "surname" || k === "familyname" || k === "family_name") {
      return function (rng, ctx) { var v = rng.pick(LAST); if (ctx) ctx.last = v; return v; };
    }
    if (k === "username" || k === "handle" || k === "login" || k === "slug") {
      return function (rng, ctx) {
        var f = (ctx && ctx.first) ? ctx.first.toLowerCase() : rng.pick(FIRST).toLowerCase();
        return f + rng.int(1, 999);
      };
    }
    if (k === "name" || k === "fullname" || k === "full_name" || /(^|_)name$/.test(k)) {
      // company-ish names for company/org keys
      if (/(company|org|organization|business|vendor|brand)/.test(k)) {
        return function (rng) { return rng.pick(COMPANIES) + " " + rng.pick(COMPANY_SUFFIX); };
      }
      if (/(product|item|title)/.test(k)) {
        return function (rng) { return rng.pick(PRODUCTS); };
      }
      return function (rng, ctx) {
        var f = rng.pick(FIRST), l = rng.pick(LAST);
        if (ctx) { ctx.first = f; ctx.last = l; }
        return f + " " + l;
      };
    }
    if (/(url|link|href|website|homepage|avatar|image|img|photo|thumbnail)/.test(k)) {
      return function (rng) { return fakeUrl(rng); };
    }
    if (/phone|mobile|tel|contact/.test(k)) {
      return function (rng) { return fakePhone(rng); };
    }
    if (k === "city" || k === "town" || /(^|_)city$/.test(k)) {
      return function (rng) { return rng.pick(CITIES); };
    }
    if (k === "country" || /(^|_)country$/.test(k)) {
      return function (rng) { return rng.pick(COUNTRIES); };
    }
    if (k === "street" || k === "address" || k === "address1" || k === "street_address") {
      return function (rng) { return rng.int(1, 9999) + " " + rng.pick(STREETS) + " " + rng.pick(STREET_TYPE); };
    }
    if (k === "status" || k === "state") {
      return function (rng) { return rng.pick(STATUSES); };
    }
    if (k === "role" || k === "type" || k === "kind" || k === "category") {
      return function (rng) { return rng.pick(ROLES); };
    }
    if (k === "color" || k === "colour") {
      return function (rng) { return rng.pick(COLORS); };
    }
    if (k === "tag" || k === "label") {
      return function (rng) { return rng.pick(TAGS); };
    }
    if (k === "company" || k === "organization" || k === "org" || k === "vendor" || k === "brand") {
      return function (rng) { return rng.pick(COMPANIES) + " " + rng.pick(COMPANY_SUFFIX); };
    }
    if (k === "product" || k === "item" || k === "sku") {
      return function (rng) { return rng.pick(PRODUCTS); };
    }
    if (/(title|subject|headline)/.test(k)) {
      return function (rng) { var s = fakeSentence(rng, rng.int(3, 6)); return s.replace(/\.$/, ""); };
    }
    if (/(description|body|content|text|message|note|summary|bio)/.test(k)) {
      return function (rng) { return fakeSentence(rng, rng.int(6, 14)); };
    }
    if (/(code|token|hash|key|secret|ref)/.test(k)) {
      return function (rng) {
        var out = "";
        for (var i = 0; i < 10; i++) out += "0123456789abcdefghijklmnopqrstuvwxyz".charAt(rng.int(0, 35));
        return out;
      };
    }

    // fall back to short lorem, matching the example's word-ish shape
    var wordy = typeof example === "string" && example.trim().indexOf(" ") !== -1;
    return wordy ? function (rng) { return fakeSentence(rng, rng.int(3, 7)); }
                 : function (rng) { return fakeWord(rng); };
  }

  function classifyNumber(key, example) {
    var k = key.toLowerCase();
    var isFloat = typeof example === "number" && !Number.isInteger(example);

    if (k === "id" || /(^|_)id$/.test(k)) {
      return function (rng) { return rng.int(1, 100000); };
    }
    if (/(price|amount|total|cost|balance|salary|revenue|fee|subtotal)/.test(k)) {
      return function (rng) { return Math.round(rng.next() * 99900 + 100) / 100; };
    }
    if (/(lat|latitude)/.test(k)) {
      return function (rng) { return Math.round((rng.next() * 180 - 90) * 1e6) / 1e6; };
    }
    if (/(lng|lon|longitude)/.test(k)) {
      return function (rng) { return Math.round((rng.next() * 360 - 180) * 1e6) / 1e6; };
    }
    if (/(count|qty|quantity|stock|age|number|num|views|likes|points|score)/.test(k)) {
      return function (rng) { return rng.int(0, 999); };
    }
    if (/(rating|rate|percent|ratio|progress)/.test(k)) {
      return function (rng) { return Math.round(rng.next() * 500) / 100; };
    }
    if (/(year)/.test(k)) {
      return function (rng) { return rng.int(1990, 2026); };
    }
    // generic: keep integer/float matching the example
    if (isFloat) return function (rng) { return Math.round(rng.next() * 10000) / 100; };
    return function (rng) { return rng.int(0, 10000); };
  }

  /* ============================================================
     SCHEMA INFERENCE
     Walk the example JSON and build a schema node describing the
     shape. Nodes: {kind:"object",fields:{k:node}}, {kind:"array",
     element:node|null}, {kind:"string"|"number"|"boolean"|"null",
     gen:fn, example:v}. The gen fn is chosen from key + value.
     ============================================================ */
  function inferNode(value, key) {
    key = key || "";
    if (value === null) {
      return { kind: "null", example: null };
    }
    if (Array.isArray(value)) {
      // element shape from the first element (merged across a few if objects)
      var element = null;
      if (value.length) {
        if (isPlainObject(value[0])) element = inferObjectMerged(value, key);
        else element = inferNode(value[0], singular(key));
      }
      return { kind: "array", element: element, length: value.length, example: value };
    }
    if (isPlainObject(value)) {
      return inferObject(value, key);
    }
    var t = typeof value;
    if (t === "number") return { kind: "number", gen: classifyNumber(key, value), example: value, isFloat: !Number.isInteger(value) };
    if (t === "boolean") return { kind: "boolean", gen: classifyBoolean(key), example: value };
    // default: string
    return { kind: "string", gen: classifyString(key, value), example: value };
  }

  function classifyBoolean(key) {
    var k = key.toLowerCase();
    // is*/has*/*enabled lean true a bit more often, but stay random
    if (/^(is|has|can|should|did|was)/.test(k) || /(enabled|active|verified|published|paid|deleted|archived)$/.test(k)) {
      return function (rng) { return rng.next() < 0.6; };
    }
    return function (rng) { return rng.bool(); };
  }

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function inferObject(obj, key) {
    var fields = {};
    var order = [];
    Object.keys(obj).forEach(function (k) {
      fields[k] = inferNode(obj[k], k);
      order.push(k);
    });
    return { kind: "object", fields: fields, order: order, example: obj };
  }

  // Merge object shapes across array elements so we capture keys that
  // may be missing/null in the first element.
  function inferObjectMerged(arr, key) {
    var fields = {};
    var order = [];
    var sampleCount = Math.min(arr.length, 8);
    for (var i = 0; i < sampleCount; i++) {
      var item = arr[i];
      if (!isPlainObject(item)) continue;
      Object.keys(item).forEach(function (k) {
        if (!fields[k] || fields[k].kind === "null") {
          var node = inferNode(item[k], k);
          if (!fields[k]) order.push(k);
          fields[k] = node;
        }
      });
    }
    return { kind: "object", fields: fields, order: order, example: arr[0] };
  }

  function singular(word) {
    if (!word) return "item";
    if (/ies$/.test(word)) return word.replace(/ies$/, "y");
    if (/([sxz]|ch|sh)es$/.test(word)) return word.replace(/es$/, "");
    if (/s$/.test(word) && !/ss$/.test(word)) return word.replace(/s$/, "");
    return word;
  }

  /* ============================================================
     GENERATE a value from a schema node using the rng.
     rowIndex seeds per-row variety; ctx carries sibling hints.
     ============================================================ */
  function genFromNode(node, rng, key, ctx) {
    if (!node) return null;
    switch (node.kind) {
      case "null":
        return null;
      case "boolean":
        return node.gen ? node.gen(rng) : rng.bool();
      case "number":
        return node.gen ? node.gen(rng) : rng.int(0, 1000);
      case "string":
        return node.gen ? node.gen(rng, ctx) : fakeWord(rng);
      case "object": {
        var out = {};
        var childCtx = {};
        node.order.forEach(function (k) {
          out[k] = genFromNode(node.fields[k], rng, k, childCtx);
        });
        return out;
      }
      case "array": {
        // Preserve the example's array length for nested arrays.
        var n = node.length != null ? node.length : 1;
        if (n === 0) return [];
        var arr = [];
        for (var i = 0; i < n; i++) {
          arr.push(node.element ? genFromNode(node.element, rng, singular(key), {}) : null);
        }
        return arr;
      }
      default:
        return null;
    }
  }

  /* ============================================================
     TOP-LEVEL GENERATION
     Determine the "record" shape and produce `count` variants with
     a single deterministic rng stream (seed + example).

     Two top-level cases:
      (a) example is an array of objects  -> the record is the
          element; produce `count` elements. Output stays an array.
      (b) example is an object            -> the record is the whole
          object; produce `count` variants as an array of objects.
     Primitives/other are wrapped as { value }.
     ============================================================ */
  function analyze(exampleValue) {
    var root = inferNode(exampleValue, "root");
    var recordNode, mode, envelopeKey = null;
    if (root.kind === "array" && root.element && root.element.kind === "object") {
      recordNode = root.element; mode = "array";
    } else if (root.kind === "object") {
      // Envelope detection: a common list-response shape is an object with
      // exactly one array-of-objects field plus scalar metadata (total,
      // count, page…). The records the user wants to mock are that inner
      // array's ELEMENTS — not N copies of the whole envelope.
      var arrayFields = root.order.filter(function (k) {
        var f = root.fields[k];
        return f.kind === "array" && f.element && f.element.kind === "object";
      });
      var nonScalarFields = root.order.filter(function (k) {
        var f = root.fields[k];
        return f.kind === "object" || f.kind === "array";
      });
      if (arrayFields.length === 1 && nonScalarFields.length === 1) {
        envelopeKey = arrayFields[0];
        recordNode = root.fields[envelopeKey].element;
        mode = "envelope";
      } else {
        recordNode = root; mode = "object";
      }
    } else if (root.kind === "array") {
      recordNode = root.element || { kind: "string", gen: function (r) { return fakeWord(r); } };
      mode = "array-primitive";
    } else {
      recordNode = root; mode = "single";
    }
    return { root: root, recordNode: recordNode, mode: mode, envelopeKey: envelopeKey };
  }

  function generateRecords(exampleValue, seedStr, count) {
    var info = analyze(exampleValue);
    var rng = makeRng(seedStr);
    var records = [];
    var n = Math.max(1, count | 0);
    for (var i = 0; i < n; i++) {
      records.push(genFromNode(info.recordNode, rng, "record", {}));
    }
    return { info: info, records: records };
  }

  /* ============================================================
     ARTIFACT BUILDERS
     ============================================================ */

  // A resource name from the endpoint path (e.g. "/api/v1/users" -> "users").
  function resourceName(path) {
    if (!path) return "items";
    var parts = String(path).split("/").filter(Boolean);
    var last = parts.length ? parts[parts.length - 1] : "items";
    last = last.replace(/[^a-zA-Z0-9_]/g, "");
    if (!last) last = "items";
    return last;
  }

  // json-server db.json: { "<resource>": [ ...records ] }
  function buildDbJson(records, resource) {
    var db = {};
    db[resource] = records;
    return JSON.stringify(db, null, 2);
  }

  // Standalone dependency-free Node http server.
  function buildNodeServer(records, resource, method, path) {
    var data = JSON.stringify(records, null, 2);
    var routePath = normalizePath(path, resource);
    var m = (method || "GET").toUpperCase();
    var lines = [];
    lines.push("// apimock — standalone mock server (no dependencies).");
    lines.push("// Run:  node server.js   then open  http://localhost:3000" + routePath);
    lines.push("const http = require(\"http\");");
    lines.push("");
    lines.push("const RECORDS = " + indentBlock(data, "") + ";");
    lines.push("");
    lines.push("const PORT = process.env.PORT || 3000;");
    lines.push("const ROUTE = " + JSON.stringify(routePath) + ";");
    lines.push("");
    lines.push("const server = http.createServer((req, res) => {");
    lines.push("  const url = new URL(req.url, `http://${req.headers.host}`);");
    lines.push("  res.setHeader(\"Content-Type\", \"application/json; charset=utf-8\");");
    lines.push("  res.setHeader(\"Access-Control-Allow-Origin\", \"*\");");
    lines.push("");
    lines.push("  // Collection:  " + m + " " + routePath);
    lines.push("  if (url.pathname === ROUTE) {");
    lines.push("    res.writeHead(200);");
    lines.push("    res.end(JSON.stringify(RECORDS, null, 2));");
    lines.push("    return;");
    lines.push("  }");
    lines.push("");
    lines.push("  // Single item by index or id:  " + routePath + "/:idOrIndex");
    lines.push("  const m = url.pathname.match(new RegExp(\"^\" + ROUTE.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\") + \"/([^/]+)$\"));");
    lines.push("  if (m) {");
    lines.push("    const key = decodeURIComponent(m[1]);");
    lines.push("    const list = Array.isArray(RECORDS) ? RECORDS : [RECORDS];");
    lines.push("    let item = list[Number(key)];");
    lines.push("    if (!item) item = list.find((r) => r && String(r.id) === key);");
    lines.push("    if (item) { res.writeHead(200); res.end(JSON.stringify(item, null, 2)); return; }");
    lines.push("    res.writeHead(404); res.end(JSON.stringify({ error: \"Not found\" }));");
    lines.push("    return;");
    lines.push("  }");
    lines.push("");
    lines.push("  res.writeHead(404);");
    lines.push("  res.end(JSON.stringify({ error: \"Not found\", tryRoute: ROUTE }));");
    lines.push("});");
    lines.push("");
    lines.push("server.listen(PORT, () => {");
    lines.push("  console.log(`apimock server on http://localhost:${PORT}${ROUTE}`);");
    lines.push("});");
    return lines.join("\n");
  }

  function normalizePath(path, resource) {
    if (path) {
      var p = String(path).trim();
      if (p.charAt(0) !== "/") p = "/" + p;
      p = p.replace(/\/+$/, "");
      if (p === "") p = "/" + resource;
      return p;
    }
    return "/" + resource;
  }

  // Indent a multi-line JSON block so it embeds cleanly.
  function indentBlock(text, prefix) {
    return text.split("\n").map(function (ln, i) {
      return i === 0 ? ln : prefix + ln;
    }).join("\n");
  }

  /* ============================================================
     OPENAPI 3.0 STUB
     Convert the schema node to an OpenAPI schema object and emit a
     minimal but valid spec with one path + a component schema.
     ============================================================ */
  function nodeToOpenApi(node) {
    if (!node) return { nullable: true };
    switch (node.kind) {
      case "null":
        return { type: "string", nullable: true, example: null };
      case "boolean":
        return { type: "boolean", example: node.example };
      case "number":
        return node.isFloat
          ? { type: "number", format: "float", example: node.example }
          : { type: "integer", example: node.example };
      case "string": {
        var s = { type: "string", example: node.example };
        if (looksIso(node.example)) s.format = /^\d{4}-\d{2}-\d{2}$/.test(node.example) ? "date" : "date-time";
        else if (looksEmail(node.example)) s.format = "email";
        else if (looksUrl(node.example)) s.format = "uri";
        else if (looksUuid(node.example)) s.format = "uuid";
        return s;
      }
      case "object": {
        var props = {};
        node.order.forEach(function (k) { props[k] = nodeToOpenApi(node.fields[k]); });
        return { type: "object", properties: props };
      }
      case "array":
        return { type: "array", items: node.element ? nodeToOpenApi(node.element) : {} };
      default:
        return {};
    }
  }

  function buildOpenApi(info, resource, method, path) {
    var recordSchema = nodeToOpenApi(info.recordNode);
    var routePath = normalizePath(path, resource);
    var schemaName = pascal(singular(resource)) || "Record";
    var isCollection = info.mode === "array" || info.mode === "array-primitive";

    var responseSchema;
    if (info.mode === "envelope") {
      // Response is the whole envelope object; its array field references
      // the record schema, other fields keep their inferred shape.
      var props = {};
      info.root.order.forEach(function (k) {
        if (k === info.envelopeKey) {
          props[k] = { type: "array", items: { $ref: "#/components/schemas/" + schemaName } };
        } else {
          props[k] = nodeToOpenApi(info.root.fields[k]);
        }
      });
      responseSchema = { type: "object", properties: props };
    } else if (isCollection) {
      responseSchema = { type: "array", items: { $ref: "#/components/schemas/" + schemaName } };
    } else {
      responseSchema = { $ref: "#/components/schemas/" + schemaName };
    }

    var listy = isCollection || info.mode === "envelope";
    var op = {};
    var verb = (method || "GET").toLowerCase();
    op[verb] = {
      summary: (listy ? "List " : "Get ") + resource,
      operationId: verb + pascal(resource),
      responses: {
        "200": {
          description: "OK",
          content: { "application/json": { schema: responseSchema } }
        }
      }
    };

    var components = { schemas: {} };
    components.schemas[schemaName] = recordSchema;

    var spec = {
      openapi: "3.0.3",
      info: { title: pascal(resource) + " mock API", version: "1.0.0",
              description: "Generated by apimock from an example response." },
      servers: [{ url: "http://localhost:3000" }],
      paths: {},
      components: components
    };
    spec.paths[routePath] = op;
    return JSON.stringify(spec, null, 2);
  }

  function pascal(s) {
    return String(s || "").replace(/[^a-zA-Z0-9]+/g, " ").trim()
      .split(" ").filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
      .join("");
  }

  /* ============================================================
     json-server run command
     ============================================================ */
  function buildRunCommand(routePath) {
    return "npx json-server db.json --port 3000\n# then open  http://localhost:3000" + routePath;
  }

  /* ============================================================
     PARSE the example input; return { ok, value, error }
     ============================================================ */
  function parseExample(text) {
    var s = (text || "").trim();
    if (!s) return { ok: false, error: "Paste an example JSON response to begin." };
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch (e) {
      return { ok: false, error: "That isn't valid JSON: " + cleanJsonError(e.message) };
    }
  }
  function cleanJsonError(msg) {
    return String(msg).replace(/^JSON\.parse:\s*/, "").replace(/\s+in JSON.*$/, "").trim();
  }

  /* ============================================================
     SCHEMA -> readable tree for the UI
     ============================================================ */
  function typeLabel(node) {
    if (!node) return "any";
    switch (node.kind) {
      case "array":
        return node.element ? node.element.kind === "object" ? "array<object>" : "array<" + typeLabel(node.element) + ">" : "array";
      case "object": return "object";
      case "number": return node.isFloat ? "float" : "integer";
      default: return node.kind;
    }
  }
  function formatHint(node) {
    if (!node || node.kind !== "string") return "";
    var e = node.example;
    if (looksUuid(e)) return "uuid";
    if (looksEmail(e)) return "email";
    if (looksUrl(e)) return "uri";
    if (looksIso(e)) return /^\d{4}-\d{2}-\d{2}$/.test(e) ? "date" : "date-time";
    return "";
  }

  /* ============================================================
     ==================  EXPORTS for tests  ===================
     (only attached under Node; a no-op in the browser)
     ============================================================ */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      makeRng: makeRng, cyrb53: cyrb53, mulberry32: mulberry32,
      inferNode: inferNode, analyze: analyze, generateRecords: generateRecords,
      buildDbJson: buildDbJson, buildNodeServer: buildNodeServer,
      buildOpenApi: buildOpenApi, nodeToOpenApi: nodeToOpenApi,
      resourceName: resourceName, normalizePath: normalizePath,
      parseExample: parseExample, typeLabel: typeLabel, singular: singular
    };
    return;
  }

  /* ============================================================
     ======================  UI / STATE  ======================
     ============================================================ */
  var DEFAULT_EXAMPLE = JSON.stringify({
    users: [
      {
        id: 1,
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        role: "admin",
        is_active: true,
        signup_at: "2024-03-11T09:24:00Z",
        address: { city: "London", country: "United Kingdom" },
        tags: ["founder", "beta"]
      }
    ],
    total: 1
  }, null, 2);

  var STORE_KEY = "apimock:v1";
  var storageOk = true;

  var ui = {
    example: DEFAULT_EXAMPLE,
    seed: "endpoint-01",
    count: 5,
    method: "GET",
    path: "/api/users"
  };

  var current = null; // { info, records, resource, artifacts }

  function save() {
    if (!storageOk) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ui)); }
    catch (e) { storageOk = false; }
  }
  function load() {
    try {
      localStorage.setItem("apimock:test", "1");
      localStorage.removeItem("apimock:test");
    } catch (e) { storageOk = false; }
    if (!storageOk) return;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var v = JSON.parse(raw);
        if (v && typeof v === "object") {
          if (typeof v.example === "string") ui.example = v.example;
          if (typeof v.seed === "string") ui.seed = v.seed;
          if (typeof v.count === "number") ui.count = v.count;
          if (typeof v.method === "string") ui.method = v.method;
          if (typeof v.path === "string") ui.path = v.path;
        }
      }
    } catch (e) { /* keep defaults */ }
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function showToast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- schema tree render ---------- */
  function renderSchema(info, resource) {
    var wrap = $("#schemaTree");
    wrap.innerHTML = "";
    var mode = info.mode;
    var rootLabel =
      mode === "array" || mode === "array-primitive" ? "array of " + resource :
      mode === "envelope" ? "envelope · " + info.envelopeKey + "[]" :
      mode === "single" ? typeLabel(info.root) :
      "object";
    var head = el("div", "schema-root");
    head.appendChild(el("span", "schema-root__kind", rootLabel));
    if (mode === "envelope") {
      var extra = info.root.order.filter(function (k) { return k !== info.envelopeKey; });
      if (extra.length) {
        head.appendChild(el("span", "schema-eg", "+ " + extra.join(", ")));
      }
    }
    wrap.appendChild(head);

    // The record node is what we multiply into variants.
    var recordNode = info.recordNode;
    if (recordNode && recordNode.kind === "object") {
      wrap.appendChild(buildSchemaObject(recordNode, 0));
    } else if (recordNode) {
      var row = el("div", "schema-row");
      row.appendChild(el("span", "schema-type", typeLabel(recordNode)));
      row.appendChild(el("span", "schema-eg", exampleText(recordNode)));
      wrap.appendChild(row);
    }
  }

  function buildSchemaObject(node, depth) {
    var ul = el("ul", "schema-list");
    node.order.forEach(function (k) {
      var child = node.fields[k];
      var li = el("li", "schema-row");
      li.appendChild(el("span", "schema-key", k));
      li.appendChild(el("span", "schema-colon", ":"));
      var tl = el("span", "schema-type", typeLabel(child));
      li.appendChild(tl);
      var hint = formatHint(child);
      if (hint) li.appendChild(el("span", "schema-fmt", hint));
      li.appendChild(el("span", "schema-eg", exampleText(child)));
      ul.appendChild(li);

      if (child.kind === "object") {
        var nested = el("li", "schema-nested");
        nested.appendChild(buildSchemaObject(child, depth + 1));
        ul.appendChild(nested);
      } else if (child.kind === "array" && child.element && child.element.kind === "object") {
        var nestedA = el("li", "schema-nested");
        var lbl = el("div", "schema-nested__label", "element");
        nestedA.appendChild(lbl);
        nestedA.appendChild(buildSchemaObject(child.element, depth + 1));
        ul.appendChild(nestedA);
      }
    });
    return ul;
  }

  function exampleText(node) {
    if (!node) return "";
    if (node.kind === "object") return "";
    if (node.kind === "array") return node.element && node.element.kind === "object" ? "" : "[…]";
    var v = node.example;
    if (typeof v === "string") return v.length > 22 ? '"' + v.slice(0, 21) + "…\"" : '"' + v + '"';
    return String(v);
  }

  /* ---------- payload highlight (very small JSON pretty printer) ---------- */
  function highlightJson(jsonText) {
    // escape then wrap tokens in spans; keeps it purely textual/safe
    var esc = jsonText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+\-]?\d+)?)/g,
      function (match) {
        var cls = "tok-num";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "tok-key" : "tok-str";
        } else if (/true|false/.test(match)) {
          cls = "tok-bool";
        } else if (/null/.test(match)) {
          cls = "tok-null";
        }
        return '<span class="' + cls + '">' + match + "</span>";
      }
    );
  }

  /* ---------- the main run ---------- */
  function run() {
    var parsed = parseExample($("#exampleInput").value);
    var errEl = $("#inputError");
    if (!parsed.ok) {
      errEl.textContent = parsed.error;
      $("#output").hidden = true;
      $("#emptyState").hidden = false;
      return;
    }
    errEl.textContent = "";

    ui.example = $("#exampleInput").value;
    ui.seed = $("#seedInput").value.trim() || "endpoint-01";
    ui.count = clampCount(parseInt($("#countInput").value, 10));
    ui.method = $("#methodSelect").value;
    ui.path = $("#pathInput").value.trim() || "/api/items";
    save();

    var gen = generateRecords(parsed.value, ui.seed, ui.count);
    var info = gen.info;
    var records = gen.records;

    // Resource name: prefer the endpoint path; for an envelope response
    // whose inner-array key is more specific, fall back to that.
    var resource = resourceName(ui.path);

    // Every mode presents a flat array of the generated records.
    var outputData = records;
    var routePath = normalizePath(ui.path, resource);

    var dbJson = buildDbJson(records, resource);
    var nodeServer = buildNodeServer(records, resource, ui.method, ui.path);
    var openapi = buildOpenApi(info, resource, ui.method, ui.path);
    var runCmd = buildRunCommand(routePath);

    current = {
      info: info, records: records, resource: resource, routePath: routePath,
      dbJson: dbJson, nodeServer: nodeServer, openapi: openapi, runCmd: runCmd
    };

    // meta line
    $("#methodBadge").textContent = ui.method;
    $("#methodBadge").className = "badge badge--" + ui.method.toLowerCase();
    $("#routeText").textContent = routePath;
    $("#statusBadge").textContent = "200 OK";
    $("#recordMeta").textContent = records.length + " record" + (records.length === 1 ? "" : "s") +
      " · seed “" + ui.seed + "”";

    renderSchema(info, resource);

    // records preview
    var recordsText = JSON.stringify(outputData, null, 2);
    $("#recordsPre").innerHTML = highlightJson(recordsText);
    $("#recordsPre").dataset.raw = recordsText;

    // artifacts
    $("#dbPre").textContent = dbJson;
    $("#serverPre").textContent = nodeServer;
    $("#openapiPre").textContent = openapi;
    $("#runCmd").textContent = runCmd;

    $("#emptyState").hidden = true;
    $("#output").hidden = false;
  }

  function clampCount(n) {
    if (isNaN(n)) return 5;
    return Math.max(1, Math.min(50, n));
  }

  /* ---------- copy / download ---------- */
  function copyText(text, label) {
    var done = function () { showToast(label + " copied"); };
    var fail = function () { fallbackCopy(text, label); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else { fallbackCopy(text, label); }
  }
  function fallbackCopy(text, label) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      showToast(ok ? label + " copied" : "Press Ctrl/Cmd+C to copy");
    } catch (e) { showToast("Couldn't copy — select it manually"); }
  }

  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showToast(filename + " downloaded");
    } catch (e) { showToast("Download failed — copy instead"); }
  }

  /* ---------- seed reroll ---------- */
  function rerollSeed() {
    var words = ["north","flux","atlas","vireo","onyx","harbor","drift","prism",
      "ember","quiet","signal","nova","cobalt","aster","sable","lumen"];
    var r = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    var seed = words[Math.floor(r() * words.length)] + "-" + (10 + Math.floor(r() * 90));
    $("#seedInput").value = seed;
    run();
  }

  /* ---------- tabs ---------- */
  function selectTab(name) {
    $$(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    $$(".panel").forEach(function (p) {
      p.hidden = p.dataset.panel !== name;
    });
  }

  /* ============================================================
     WIRE UP
     ============================================================ */
  function init() {
    load();

    $("#exampleInput").value = ui.example;
    $("#seedInput").value = ui.seed;
    $("#countInput").value = ui.count;
    $("#methodSelect").value = ui.method;
    $("#pathInput").value = ui.path;

    $("#buildForm").addEventListener("submit", function (e) { e.preventDefault(); run(); });
    $("#rerollBtn").addEventListener("click", rerollSeed);

    $("#loadSampleBtn").addEventListener("click", function () {
      $("#exampleInput").value = DEFAULT_EXAMPLE;
      run();
    });
    $("#clearBtn").addEventListener("click", function () {
      $("#exampleInput").value = "";
      $("#exampleInput").focus();
      $("#output").hidden = true;
      $("#emptyState").hidden = false;
      $("#inputError").textContent = "";
    });

    // copy buttons (data-copy points at an element id whose text/raw to copy)
    $$("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = $("#" + btn.dataset.copy);
        if (!target) return;
        var text = target.dataset.raw != null ? target.dataset.raw : target.textContent;
        copyText(text, btn.dataset.label || "Copied");
      });
    });
    // download buttons
    $$("[data-download]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!current) return;
        var kind = btn.dataset.download;
        if (kind === "db") download("db.json", current.dbJson, "application/json");
        else if (kind === "server") download("server.js", current.nodeServer, "text/javascript");
        else if (kind === "openapi") download("openapi.json", current.openapi, "application/json");
        else if (kind === "records") download(current.resource + ".json",
          $("#recordsPre").dataset.raw, "application/json");
      });
    });

    // tabs
    $$(".tab").forEach(function (t) {
      t.addEventListener("click", function () { selectTab(t.dataset.tab); });
      t.addEventListener("keydown", function (e) {
        var tabs = $$(".tab");
        var idx = tabs.indexOf(t);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault(); var n = tabs[(idx + 1) % tabs.length];
          n.focus(); selectTab(n.dataset.tab);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault(); var p = tabs[(idx - 1 + tabs.length) % tabs.length];
          p.focus(); selectTab(p.dataset.tab);
        }
      });
    });

    // rerun on control changes
    ["#seedInput", "#countInput", "#pathInput"].forEach(function (sel) {
      $(sel).addEventListener("change", function () { if (current) run(); });
    });
    $("#methodSelect").addEventListener("change", function () { if (current) run(); });

    // first render
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
