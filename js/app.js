/* SMLM CONNECT — vanilla JS single-page app (hash routing).
   Port of the React/TypeScript version. No build step needed. */
(function () {
  "use strict";
  var CFG = window.SMLM_CONFIG;
  var SUPA_URL = "https://" + CFG.projectId + ".supabase.co";
  var supa = (window.supabase && typeof window.supabase.createClient === "function")
    ? window.supabase.createClient(SUPA_URL, CFG.publicAnonKey)
    : null;

  /* ---------- Database Operations (Direct Supabase Tables) ---------- */
  var DB = {
    // 1. Ambil Ringkasan Statistik Beranda
    getStats: function () {
      if (!supa) {
        return Promise.reject(new Error("Supabase client not loaded"));
      }
      return Promise.all([
        Promise.resolve(supa.from("participants").select("id")),
        Promise.resolve(supa.from("commitments").select("id")),
        Promise.resolve(supa.from("ratings").select("rating, deviceId"))
      ]).then(function (results) {
        var partData = (results[0] && !results[0].error && results[0].data) || [];
        var commData = (results[1] && !results[1].error && results[1].data) || [];
        var ratings = (results[2] && !results[2].error && results[2].data) || [];

        // Hitung rating unik berdasarkan deviceId
        var allRatingsMap = {};
        ratings.forEach(function (x) {
          if (x.deviceId) allRatingsMap[x.deviceId] = x.rating;
        });
        var ratingVals = Object.values(allRatingsMap);
        var avg = ratingVals.length
          ? (ratingVals.reduce(function (s, v) { return s + (v || 0); }, 0) / ratingVals.length).toFixed(1) + "/5"
          : "-";

        return {
          totalParticipants: partData.length,
          totalCommitments: commData.length,
          avgSatisfaction: avg
        };
      });
    },

    // 2. Simpan Data Peserta (Hasil Tes)
    saveParticipant: function (p) {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      var doc = {
        id: p.id,
        name: p.name,
        instance: p.school || p.instance || "",
        answers: p.answers,
        deviceId: p.deviceId,
        createdAt: p.timestamp || p.createdAt || new Date().toISOString()
      };
      return Promise.resolve(supa.from("participants").upsert(doc)).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    // 3. Simpan / Perbarui Rating Kepuasan
    addRating: function (deviceId, rating) {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      return Promise.resolve(supa.from("ratings").upsert({
        deviceId: deviceId,
        rating: rating,
        createdAt: new Date().toISOString()
      }, { onConflict: "deviceId" })).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    // 4. Ambil Semua Komitmen
    getCommitments: function () {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      return Promise.resolve(supa.from("commitments").select("*").order("createdAt", { ascending: false })).then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (c) {
          if (!c.timestamp && c.createdAt) c.timestamp = c.createdAt;
          if (!c.school && c.instance) c.school = c.instance;
          return c;
        });
      });
    },

    // 5. Tambah Komitmen Baru
    addCommitment: function (c) {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      var now = c.timestamp || c.createdAt || new Date().toISOString();
      return Promise.resolve(supa.from("commitments").insert({
        id: c.id,
        text: c.text,
        author: c.author,
        instance: c.school || c.instance || "",
        createdAt: now,
        color: c.color,
        edited: false,
        deviceId: c.deviceId
      })).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    // 6. Edit Teks Komitmen
    editCommitment: function (id, text) {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      return Promise.resolve(supa.from("commitments").update({
        text: text,
        edited: true
      }).eq("id", id)).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    },

    // 7. Ambil Semua Data Peserta
    getParticipants: function () {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      return Promise.resolve(supa.from("participants").select("*").order("createdAt", { ascending: false })).then(function (res) {
        if (res.error) throw res.error;
        return (res.data || []).map(function (p) {
          if (!p.school && p.instance) p.school = p.instance;
          if (!p.timestamp && p.createdAt) p.timestamp = p.createdAt;
          return p;
        });
      });
    },

    // 8. Hapus Komitmen / Peserta
    deleteItem: function (kind, id) {
      if (!supa) return Promise.reject(new Error("Supabase client not loaded"));
      var table = kind === "commitment" ? "commitments" : "participants";
      return Promise.resolve(supa.from(table).delete().eq("id", id)).then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
    }
  };

  /* ---------- helpers ---------- */
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var lang = localStorage.getItem("language") || "en";
  function t(k) {
    return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }
  function jget(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }
  function jset(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }
  function deviceId() {
    var d = localStorage.getItem("deviceId");
    if (!d) {
      d = "device-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("deviceId", d);
    }
    return d;
  }
  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2600);
  }

  /* ---------- Clean Path Routing (No /#/) ---------- */
  function getBasePath() {
    var p = window.location.pathname;
    if (p.indexOf("/smlm-connect") === 0) {
      return "/smlm-connect";
    }
    return "";
  }

  function getCleanPath() {
    // If hash was used, convert it cleanly
    if (window.location.hash && window.location.hash.indexOf("#/") === 0) {
      var hPath = window.location.hash.slice(1);
      window.history.replaceState(null, null, getBasePath() + hPath);
      return hPath;
    }
    var full = window.location.pathname;
    var base = getBasePath();
    var p = base && full.indexOf(base) === 0 ? full.slice(base.length) : full;
    p = p.replace(/\/+$/, "");
    return p ? (p.charAt(0) === "/" ? p : "/" + p) : "/";
  }

  function appUrl(path) {
    var clean = path.replace(/^\/+/, "");
    var base = getBasePath();
    return clean ? (base ? base + "/" + clean : "/" + clean) : (base || "/");
  }

  function navigate(path) {
    window.history.pushState(null, null, appUrl(path));
    route();
  }

  var P = { // lucide-style icon paths
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    spark: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  };
  function ic(n, c) {
    return '<svg class="i ' + (c || "") + '" viewBox="0 0 24 24">' + P[n] + "</svg>";
  }

  var LOGO = '<img class="brand-logo" src="assets/images/logo.png" alt="SMLM CONNECT logo" />';

  /* ---------- Navbar ---------- */
  function navbar(path) {
    var items = [["/", t("nav.home"), "home"], ["/dashboard", t("nav.dashboard"), "chart"], ["/commitment-wall", t("nav.commitmentWall"), "msg"]];
    return '<nav class="nav"><div class="container"><div class="nav-in">' +
      '<a class="brand" href="' + appUrl("/") + '">' + LOGO + '<div><h1>SMLM CONNECT</h1><p>Social Media &amp; Learning Motivation</p></div></a>' +
      '<div class="nav-links">' + items.map(function (i) {
        return '<a class="nav-link ' + (path === i[0] ? "active" : "") + '" href="' + appUrl(i[0]) + '">' + ic(i[2]) + "<span>" + i[1] + "</span></a>";
      }).join("") + "</div></div></div></nav>";
  }

  /* ---------- Analysis (port of Dashboard.generateAnalysis) ---------- */
  function generateAnalysis(answers) {
    function A(i) {
      var f = answers.filter(function (a) {
        return a.questionId === i;
      })[0];
      return f ? f.answer : "";
    }
    var screenTime = A(0), activity = A(1), impact = A(3);
    var key = "mindful", risk = "low";
    if ((screenTime === "> 3 jam" || screenTime === "2-3 jam") && impact === "negatif") { key = "procrastination"; risk = "high"; }
    else if (activity === "hiburan" && (screenTime === "1-2 jam" || screenTime === "2-3 jam")) { key = "distraction"; risk = "medium"; }
    else if (activity === "edukasi" && (screenTime === "< 1 jam" || screenTime === "1-2 jam")) { key = "strategic"; risk = "low"; }
    var focus = impact === "positif" ? 8 : impact === "negatif" ? 3 : 6;
    var stScore = screenTime === "< 1 jam" ? 3 : screenTime === "1-2 jam" ? 5 : screenTime === "2-3 jam" ? 7 : 9;
    var impuls = activity === "hiburan" ? 7 : activity === "edukasi" ? 3 : 5;
    var selfC = risk === "low" ? 8 : risk === "medium" ? 5 : 3;
    var aware = impact === "positif" ? 7 : 5;
    var d = (screenTime === "< 1 jam" ? 5 : screenTime === "1-2 jam" ? 15 : screenTime === "2-3 jam" ? 30 : 40) +
      (activity === "edukasi" ? 5 : activity === "hiburan" ? 30 : 15) +
      (impact === "positif" ? 5 : impact === "negatif" ? 30 : 15);
    function clamp(v) {
      return Math.min(99, Math.max(2, v));
    }
    var pos = clamp((activity === "edukasi" ? 70 : activity === "hiburan" ? 15 : 40) + (impact === "positif" ? 20 : impact === "negatif" ? -10 : 0));
    var dis = clamp((screenTime === "< 1 jam" ? 10 : screenTime === "1-2 jam" ? 30 : screenTime === "2-3 jam" ? 60 : 85) + (activity === "hiburan" ? 10 : activity === "edukasi" ? -15 : 0));
    var mot = clamp((impact === "positif" ? 85 : impact === "negatif" ? 35 : 55) + (activity === "edukasi" ? 10 : -5) + (screenTime === "< 1 jam" ? 5 : screenTime === "> 3 jam" ? -10 : 0));
    var s;
    if (d > 70) {
      s = ["A", "E", "K", "D"];
    } else if (d > 50) {
      s = ["B", "G", "H", "M"];
    } else if (d > 30) {
      s = ["F", "I", "J", "C"];
    } else {
      s = ["N", "P", "L", "O"];
    }

    if (key === "procrastination") {
      s[2] = "C";
    } else if (key === "distraction") {
      s[3] = "L";
    } else if (key === "strategic") {
      s = ["N", "J", "P", "F"];
    }
    return { key: key, risk: risk, radar: [focus, stScore, impuls, selfC, aware], distraction: d, pos: pos, dis: dis, mot: mot, strategies: s };
  }

  /* ---------- SVG widgets ---------- */
  function radar(labels, values) {
    var cx = 150, cy = 130, R = 85, n = labels.length, out = '<svg viewBox="0 0 300 260" width="100%" style="max-height:290px">';
    function pt(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    [0.25, 0.5, 0.75, 1].forEach(function (f) { out += '<polygon fill="none" stroke="#B9E3F7" points="' + labels.map(function (_, i) { return pt(i, R * f).join(","); }).join(" ") + '"/>'; });
    labels.forEach(function (l, i) {
      var e = pt(i, R), tp = pt(i, R + 22);
      out += '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#B9E3F7"/><text x="' + tp[0] + '" y="' + tp[1] + '" font-size="11" fill="#666" text-anchor="middle" dominant-baseline="middle">' + esc(l) + "</text>";
    });
    out += '<polygon fill="#0096FF" fill-opacity=".55" stroke="#0096FF" stroke-width="2" points="' + values.map(function (v, i) { return pt(i, R * v / 10).join(","); }).join(" ") + '"/></svg>';
    return out;
  }
  function circ(pct, color) {
    var r = 56, c = 2 * Math.PI * r;
    return '<div class="circ"><svg viewBox="0 0 130 130" width="130" height="130"><circle cx="65" cy="65" r="' + r + '" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="10"/>' +
      '<circle cx="65" cy="65" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '" transform="rotate(-90 65 65)"/></svg><span>' + pct + "%</span></div>";
  }

  /* ---------- Canvas Result Generator (1920x1440 - 4:3) ---------- */
  function downloadResultImage(participantName, a, labels) {
    var cvs = document.createElement("canvas");
    cvs.width = 1920;
    cvs.height = 1440;
    var ctx = cvs.getContext("2d");
    if (!ctx) return;

    // Helper: draw rounded rectangle
    function roundRect(x, y, w, h, r, fill, stroke, strokeColor, strokeWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = strokeColor || "rgba(0,150,255,0.2)";
        ctx.lineWidth = strokeWidth || 2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Helper: text wrapping
    function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
      var words = String(text || "").split(" ");
      var line = "";
      var count = 0;
      for (var n = 0; n < words.length; n++) {
        var testLine = line + (line ? " " : "") + words[n];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, y);
          line = words[n];
          y += lineHeight;
          count++;
          if (maxLines && count >= maxLines - 1) {
            line += "...";
            break;
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y);
    }

    // 1. Background (Clean soft gradient matching SMLM brand)
    var bgGrad = ctx.createLinearGradient(0, 0, 1920, 1440);
    bgGrad.addColorStop(0, "#F0F9FF");
    bgGrad.addColorStop(0.5, "#E6F4FE");
    bgGrad.addColorStop(1, "#DCF0FD");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1920, 1440);

    // Decorative top-right / bottom-left subtle glow
    var glow1 = ctx.createRadialGradient(1700, 150, 50, 1700, 150, 600);
    glow1.addColorStop(0, "rgba(0, 209, 255, 0.15)");
    glow1.addColorStop(1, "rgba(0, 209, 255, 0)");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, 1920, 1440);

    var glow2 = ctx.createRadialGradient(200, 1300, 50, 200, 1300, 700);
    glow2.addColorStop(0, "rgba(0, 150, 255, 0.12)");
    glow2.addColorStop(1, "rgba(0, 150, 255, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, 1920, 1440);

    // Outer framing card
    roundRect(50, 50, 1820, 1340, 28, "#FFFFFF", true, "rgba(0, 150, 255, 0.2)", 3);

    // 2. Header: Logo & Branding
    ctx.fillStyle = "#0096FF";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SMLM CONNECT", 110, 120);

    ctx.fillStyle = "#64748B";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("Social Media & Learning Motivation", 110, 145);

    // Top Pill Badge
    roundRect(830, 85, 260, 44, 22, "#E1F5FE", false);
    ctx.fillStyle = "#0096FF";
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★ " + t("dashboard.badge"), 960, 113);

    // Title: Personal Diagnostic Dashboard
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    var userTitle = participantName ? t("dashboard.title") + " " + participantName : t("dashboard.titleAlt");
    ctx.fillText(userTitle, 960, 190);

    ctx.fillStyle = "#64748B";
    ctx.font = "18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("dashboard.description"), 960, 225);

    // Date tag (top right)
    ctx.textAlign = "right";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(new Date().toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "long", year: "numeric" }), 1810, 125);

    // 3. Main Gradient Banner (Category / Risk / Behavior Type)
    var k = a.key;
    var bannerGrad = ctx.createLinearGradient(110, 260, 1810, 430);
    bannerGrad.addColorStop(0, "#0096FF");
    bannerGrad.addColorStop(1, "#00D1FF");
    roundRect(110, 260, 1700, 170, 20, bannerGrad, false);

    // Banner Text: Category & Description
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("ai.label." + k), 150, 315);

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("ai.desc." + k), 150, 350);

    // Risk Pill
    var riskColor = a.risk === "high" ? "#EF4444" : (a.risk === "medium" ? "#F59E0B" : "#10B981");
    roundRect(1540, 285, 230, 48, 24, "rgba(255, 255, 255, 0.2)", false);
    roundRect(1544, 289, 222, 40, 20, riskColor, false);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("risk." + a.risk).toUpperCase(), 1655, 309);
    ctx.textBaseline = "alphabetic";

    // Glass box inside banner (Behavior Type)
    roundRect(150, 370, 1620, 46, 12, "rgba(255, 255, 255, 0.18)", false);
    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("dashboard.behaviorType") + ":", 175, 399);

    ctx.font = "16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillText(t("ai.behavior." + k), 320, 399);

    // 4. Middle Row: Root Cause Card (Left) & Radar Chart Card (Right)
    // Left: Root Cause Analysis
    roundRect(110, 460, 830, 410, 20, "#FFFFFF", true, "rgba(0, 150, 255, 0.15)", 2);
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("🧠 " + t("dashboard.rootCause"), 150, 515);

    ctx.fillStyle = "#334155";
    ctx.font = "19px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    wrapText(t("ai.root." + k), 150, 570, 750, 34, 10);

    // Right: Digital Behavior Profile (Radar Chart)
    roundRect(980, 460, 830, 410, 20, "#FFFFFF", true, "rgba(0, 150, 255, 0.15)", 2);
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("📊 " + t("dashboard.profile"), 1020, 505);

    // Draw Radar Chart on Canvas
    var rcx = 1395, rcy = 675, rRad = 125;
    var nRad = labels.length;
    function getPt(i, r) {
      var angle = -Math.PI / 2 + i * 2 * Math.PI / nRad;
      return [rcx + r * Math.cos(angle), rcy + r * Math.sin(angle)];
    }

    // Grid circles/polygons
    [0.25, 0.5, 0.75, 1.0].forEach(function (f) {
      ctx.beginPath();
      for (var i = 0; i < nRad; i++) {
        var p = getPt(i, rRad * f);
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = "#BAE6FD";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Axis lines and labels
    labels.forEach(function (lbl, i) {
      var e = getPt(i, rRad);
      var lp = getPt(i, rRad + 30);
      ctx.beginPath();
      ctx.moveTo(rcx, rcy);
      ctx.lineTo(e[0], e[1]);
      ctx.strokeStyle = "#BAE6FD";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lbl, lp[0], lp[1]);
    });

    // Radar Data Polygon
    ctx.beginPath();
    a.radar.forEach(function (val, i) {
      var p = getPt(i, rRad * (val / 10));
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 150, 255, 0.4)";
    ctx.fill();
    ctx.strokeStyle = "#0096FF";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Data points
    a.radar.forEach(function (val, i) {
      var p = getPt(i, rRad * (val / 10));
      ctx.beginPath();
      ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = "#0096FF";
      ctx.fill();
    });

    // 5. Bottom Row: Distraction Score (Left) & Habit Breakdown (Right)
    // Left: Distraction Score Card
    var neg = a.distraction >= 50;
    var distGrad = ctx.createLinearGradient(110, 900, 940, 1340);
    distGrad.addColorStop(0, "#0096FF");
    distGrad.addColorStop(1, "#00D1FF");
    roundRect(110, 900, 830, 440, 20, distGrad, false);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(t("dashboard.distractionScore"), 525, 950);

    // Circular Progress for Distraction Score
    var ccx = 525, ccy = 1070, cRad = 75;
    ctx.beginPath();
    ctx.arc(ccx, ccy, cRad, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 16;
    ctx.stroke();

    ctx.beginPath();
    var startAngle = -Math.PI / 2;
    var endAngle = startAngle + (Math.PI * 2 * (a.distraction / 100));
    ctx.arc(ccx, ccy, cRad, startAngle, endAngle);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 40px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(a.distraction + "%", ccx, ccy);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(neg ? t("dashboard.negativeImpact") : t("dashboard.positiveImpact"), 525, 1205);

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    wrapText(neg ? t("dashboard.negativeDesc") : t("dashboard.positiveDesc"), 525, 1245, 750, 26, 3);

    // Right: Habit Breakdown Bars
    roundRect(980, 900, 830, 440, 20, "#FFFFFF", true, "rgba(0, 150, 255, 0.15)", 2);
    ctx.textAlign = "left";
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("📈 " + t("dashboard.habitBreakdown"), 1020, 955);

    function drawBar(label, pct, color, yPos) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#334155";
      ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(label, 1020, yPos);

      ctx.textAlign = "right";
      ctx.fillStyle = "#0F172A";
      ctx.fillText(pct + "%", 1770, yPos);

      // Track
      roundRect(1020, yPos + 12, 750, 18, 9, "#F1F5F9", false);
      // Progress
      var filledW = Math.max(18, Math.round(750 * (pct / 100)));
      roundRect(1020, yPos + 12, filledW, 18, 9, color, false);
    }

    drawBar(t("dashboard.positiveUsage"), a.pos, "#22C55E", 1020);
    drawBar(t("dashboard.distractionLevel"), a.dis, "#EF4444", 1120);
    drawBar(t("dashboard.academicMotivation"), a.mot, "#0096FF", 1220);

    // Convert to Image and trigger download
    cvs.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      var safeName = (participantName || "result").toLowerCase().replace(/[^a-z0-9]/g, "_");
      link.download = "smlm_result_" + safeName + "_" + Date.now() + ".png";
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
      toast(lang === "en" ? "Result image downloaded (1920 × 1440)!" : "Gambar hasil (1920 × 1440) berhasil diunduh!");
    }, "image/png");
  }

  /* ---------- Pages ---------- */
  var pollers = [];
  function clearPollers() {
    pollers.forEach(clearInterval);
    pollers = [];
  }

  function poll(fn, ms) {
    fn();
    pollers.push(setInterval(fn, ms));
  }

  function mount(html) {
    $("#app").innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* Home */
  function Home() {
    var feats = [["target", "bg-p10", 1], ["brain", "bg-s10", 2], ["bulb", "bg-a10", 3], ["users", "bg-p10", 4]];
    mount('<div class="page">' + navbar("/") +
      '<section class="hero"><div class="container fade center" style="max-width:896px">' +
      '<div class="badge">' + ic("spark") + "<span>" + t("home.badge") + "</span></div>" +
      "<h1>" + t("home.title") + '</h1><p class="tag">' + t("home.tagline") + '</p><p class="desc">' + t("home.description") + "</p>" +
      '<div class="hero-btns"><a class="btn btn-accent" href="' + appUrl("/test") + '">' + t("home.startTest") + ic("arrow", "lg") + '</a><a class="btn btn-glass" href="' + appUrl("/dashboard") + '">' + t("home.viewDashboard") + "</a></div></div></section>" +
      '<section class="section"><div class="container"><div class="center mb-12"><h2>' + t("home.socialLab") + '</h2><p class="muted" style="font-size:18px;max-width:672px;margin:0 auto">' + t("home.socialLabDesc") + "</p></div>" +
      '<div class="grid g4">' + feats.map(function (f) {
        return '<div class="card hover fade"><div class="icon-box ' + f[1] + '">' + ic(f[0], "xl") + '</div><h3 style="font-weight:600;margin-bottom:8px">' + t("home.feature" + f[2] + ".title") + '</h3><p class="muted" style="font-size:14px;opacity:.85">' + t("home.feature" + f[2] + ".desc") + "</p></div>";
      }).join("") + "</div></div></section>" +
      '<section class="section alt"><div class="container"><div class="grid g3 center">' +
      '<div><div class="stat-v" id="s-p">0</div><div class="muted" style="font-size:14px">' + t("home.stats.participants") + "</div></div>" +
      '<div><div class="stat-v" id="s-c">0</div><div class="muted" style="font-size:14px">' + t("home.stats.commitments") + "</div></div>" +
      '<div><div class="stat-v" id="s-s">-</div><div class="muted" style="font-size:14px">' + t("home.stats.satisfaction") + "</div></div></div></div></section>" +
      '<section class="section"><div class="container"><div class="cta"><h2>' + t("home.cta.title") + "</h2><p>" + t("home.cta.desc") + '</p><a class="btn btn-accent" href="' + appUrl("/test") + '">' + t("home.cta.button") + ic("arrow", "lg") + "</a></div></div></section>" +
      '<footer class="footer"><div class="container"><p>' + t("home.footer.copyright") + "</p><p>" + t("home.footer.tagline") + "</p></div></footer></div>");
    function set(p, c, s) {
      var a = $("#s-p");
      if (!a) return;
      a.textContent = p;
      $("#s-c").textContent = c;
      $("#s-s").textContent = s;
    }

    function local() {
      var r = jget("allSatisfactionRatings", []);
      var totalParts = jget("allParticipants", []).length;
      var totalComms = jget("commitments", []).length;
      var avgSat = r.length
        ? (r.reduce(function (s, x) { return s + x.rating; }, 0) / r.length).toFixed(1) + "/5"
        : "-";
      set(totalParts, totalComms, avgSat);
    }

    poll(function () {
      DB.getStats()
        .then(function (d) {
          set(d.totalParticipants, d.totalCommitments, d.avgSatisfaction);
        })
        .catch(local);
    }, 2500);
  }

  /* Test */
  function Test() {
    var Q = QUESTIONS[lang === "en" ? "en" : "id"];
    var step = 0, answers = [], info = { name: "", school: "" };
    function form() {
      mount('<div class="form-bg">' + navbar("/test") + '<div class="container w-2xl py-8"><div class="card shadow fade" style="padding:32px;background:rgba(255,255,255,.96)">' +
        '<div class="center mb-8"><h1 style="font-size:30px;font-weight:700;margin-bottom:16px">' + t("test.title") + '</h1><p class="muted">' + t("test.userInfo") + "</p></div>" +
        '<form id="f"><div class="field"><label>' + t("test.name") + '</label><input class="input" id="n" required placeholder="' + esc(t("test.namePlaceholder")) + '"/></div>' +
        '<div class="field"><label>' + t("test.class") + '</label><input class="input" id="s" required placeholder="' + esc(t("test.classPlaceholder")) + '"/></div>' +
        '<button class="btn btn-primary" style="width:100%;padding:16px">' + t("test.start") + ic("arrow", "lg") + "</button></form></div></div></div>");
      $("#f").onsubmit = function (e) {
        e.preventDefault();
        info.name = $("#n").value.trim();
        info.school = $("#s").value.trim();
        if (info.name && info.school) {
          question();
        }
      };
    }
    function ans(i) {
      var f = answers.filter(function (a) {
        return a.questionId === i;
      })[0];
      return f;
    }

    function complete(q) {
      var a = ans(step);
      if (!a) return false;
      if (q.type === "likert") {
        return q.statements.every(function (_, i) {
          return a.answer[i];
        });
      }
      return a.answer !== undefined;
    }
    function question(isStepChange) {
      var q = Q[step], a = ans(step), prog = (step + 1) / Q.length * 100, h = "";
      if (q.type === "multiple-choice") {
        h = q.options.map(function (o, i) {
          var sel = a && a.answer === o.value;
          return '<button class="opt ' + (sel ? "sel" : "") + '" data-v="' + i + '"><div class="radio">' + (sel ? ic("check") : "") + '</div><div style="font-weight:500">' + esc(o.label) + "</div></button>";
        }).join("");
      } else {
        h = q.statements.map(function (st, si) {
          return '<div class="likert-row"><p style="font-weight:500;margin-bottom:12px">' + (si + 1) + ". " + esc(st) + '</p><div class="likert-opts">' +
            q.likertOptions.map(function (o) { return '<button data-s="' + si + '" data-l="' + o.value + '" class="' + (a && a.answer[si] === o.value ? "sel" : "") + '">' + esc(o.label) + "</button>"; }).join("") + "</div></div>";
        }).join("");
      }
      var last = step === Q.length - 1;
      var fadeClass = isStepChange ? "fade-in" : "";
      var isReady = complete(q);
      var nextBtnHtml = last
        ? '<button type="button" class="btn btn-primary" id="btn-view-results" ' + (isReady ? "" : "disabled") + ' style="cursor:pointer">' + t("test.viewResults") + ic("check", "lg") + "</button>"
        : '<button type="button" class="btn btn-primary" id="next" ' + (isReady ? "" : "disabled") + ">" + t("test.next") + ic("arrow", "lg") + "</button>";

      mount('<div class="page">' + navbar("/test") + '<div class="container w-4xl py-8"><div class="mb-8"><div class="row between mb-2"><span class="muted" style="font-size:14px;opacity:.8">' + t("test.question") + " " + (step + 1) + " " + t("test.of") + " " + Q.length +
        '</span><span class="primary" style="font-size:14px;font-weight:600">' + Math.round(prog) + '%</span></div><div class="progress"><div style="width:' + prog + '%"></div></div></div>' +
        '<div class="card shadow mb-8 ' + fadeClass + '" style="padding:32px"><div class="pill sm mb-4">' + esc(q.category) + '</div><h2 style="font-size:24px;font-weight:600;margin-bottom:24px">' + esc(q.question) + "</h2>" + h + "</div>" +
        '<div class="row between"><button type="button" class="btn btn-outline" id="prev" ' + (step === 0 ? "disabled" : "") + ">" + ic("back", "lg") + t("test.previous") + '</button>' + nextBtnHtml + "</div></div></div>");

      document.querySelectorAll(".opt").forEach(function (b) {
        b.onclick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var v = q.options[+b.dataset.v].value;
          var entry = ans(step);
          if (entry) {
            entry.answer = v;
          } else {
            answers.push({ questionId: step, answer: v });
          }
          question(false);
        };
      });

      document.querySelectorAll(".likert-opts button").forEach(function (b) {
        b.onclick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var entry = ans(step);
          if (!entry) {
            entry = { questionId: step, answer: {} };
            answers.push(entry);
          }
          if (typeof entry.answer !== "object" || !entry.answer) {
            entry.answer = {};
          }
          entry.answer[+b.dataset.s] = b.dataset.l;
          question(false);
        };
      });

      var prevBtn = $("#prev");
      if (prevBtn) {
        prevBtn.onclick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (step > 0) {
            step--;
            question(true);
          }
        };
      }

      var nextBtn = $("#next");
      if (nextBtn) {
        nextBtn.onclick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (!complete(q)) return;
          step++;
          question(true);
        };
      }

      var vrBtn = $("#btn-view-results");
      if (vrBtn) {
        vrBtn.onclick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (!complete(q)) return;
          finish();
        };
      }
    }
    function finish() {
      var did = deviceId();
      jset("testAnswers", answers);
      jset("userInfo", info);
      localStorage.setItem("testCompleted", "true");

      var p = {
        id: did + "-" + Date.now(),
        name: info.name,
        school: info.school,
        instance: info.school,
        answers: answers,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        deviceId: did
      };

      var all = jget("allParticipants", []);
      var i = all.findIndex(function (x) {
        return x.deviceId === did;
      });

      if (i >= 0) {
        all[i] = p;
      } else {
        all.push(p);
      }
      jset("allParticipants", all);

      // Tampilkan indikator penyimpanan langsung ke Supabase
      mount('<div class="page">' + navbar("/dashboard") + '<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;text-align:center"><div><div class="spinner"></div><p class="muted" style="margin-top:16px">' + (lang === "en" ? "Saving results to database..." : "Menyimpan hasil ke database...") + '</p></div></div></div>');

      DB.saveParticipant(p)
        .then(function () {
          toast(lang === "en" ? "Results saved to database!" : "Hasil tes berhasil tersimpan di database!");
          window.dispatchEvent(new Event("statsUpdated"));
        })
        .catch(function (err) {
          console.error("Supabase saveParticipant error:", err);
          toast(lang === "en" ? "Saved locally (database sync pending)." : "Tersimpan di lokal (sinkronisasi database tertunda).");
        })
        .finally(function () {
          window.history.pushState(null, null, appUrl("/dashboard"));
          route();
        });
    }
    form();
  }

  /* Dashboard */
  function Dashboard() {
    var ok = localStorage.getItem("testCompleted"), ans = jget("testAnswers", null);
    mount('<div class="page">' + navbar("/dashboard") + '<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;text-align:center"><div><div class="spinner"></div><p class="muted">' + t("dashboard.loading") + "</p></div></div></div>");

    function showEmpty() {
      mount('<div class="page">' + navbar("/dashboard") + '<div class="container w-2xl py-16"><div class="card shadow fade center" style="padding:32px"><div class="icon-box bg-p10" style="width:64px;height:64px;border-radius:50%;margin:0 auto 24px">' + ic("alert", "xxl") +
        '</div><h2 style="font-size:24px;font-weight:700;margin-bottom:16px">' + t("dashboard.emptyTitle") + '</h2><p class="muted" style="margin-bottom:32px;line-height:1.7;opacity:.85">' + t("dashboard.emptyDesc") + '</p><a class="btn btn-primary" href="' + appUrl("/test") + '" style="padding:16px 32px">' + t("dashboard.emptyButton") + ic("arrow", "lg") + "</a></div></div></div>");
    }

    if (!ok || !ans) {
      var did = deviceId();
      if (supa) {
        supa.from("participants").select("*").eq("deviceId", did).order("createdAt", { ascending: false }).limit(1)
          .then(function (res) {
            if (res.data && res.data.length > 0) {
              var p = res.data[0];
              ans = p.answers || [];
              jset("testAnswers", ans);
              jset("userInfo", { name: p.name, school: p.instance || p.school || "" });
              localStorage.setItem("testCompleted", "true");
              render();
            } else {
              showEmpty();
            }
          })
          .catch(function () {
            showEmpty();
          });
        return;
      }
      showEmpty();
      return;
    }

    setTimeout(function () {
      if (getCleanPath().indexOf("/dashboard") < 0) return;
      render();
    }, 400);
    function render() {
      var a = generateAnalysis(ans), name = (jget("userInfo", {}) || {}).name || "", k = a.key;
      var rating = parseInt(localStorage.getItem("satisfactionRating") || "0", 10);
      var labels = ["focus", "screenTime", "impulsivity", "selfControl", "awareness"].map(function (x) { return t("ai.radar." + x); });
      var neg = a.distraction >= 50;
      function bar(label, v, col) { return '<div style="margin-bottom:18px"><div class="row between" style="font-size:14px"><span>' + label + "</span><b>" + v + '%</b></div><div class="bar"><div style="width:' + v + "%;background:" + col + '"></div></div></div>'; }
      mount('<div class="page">' + navbar("/dashboard") + '<div class="container w-6xl py-8">' +
        '<div class="center mb-12 fade"><div class="pill mb-4">' + ic("brain") + t("dashboard.badge") + '</div><h1 style="font-size:36px;font-weight:700;margin-bottom:16px">' + (name ? t("dashboard.title") + " " + esc(name) : t("dashboard.titleAlt")) + '</h1><p class="muted" style="max-width:672px;margin:0 auto;opacity:.85">' + t("dashboard.description") + "</p></div>" +
        '<div class="gradient-card mb-8 fade"><div class="row between" style="align-items:flex-start"><div><h2 style="font-size:24px;font-weight:700;margin-bottom:8px">' + t("ai.label." + k) + '</h2><p style="opacity:.9">' + t("ai.desc." + k) + '</p></div><div class="risk ' + a.risk + '">' + t("risk." + a.risk) + "</div></div>" +
        '<div class="glass"><div class="row mb-2" style="font-size:14px;font-weight:600">' + ic("alert") + t("dashboard.behaviorType") + '</div><p style="font-size:14px;opacity:.9">' + t("ai.behavior." + k) + "</p></div></div>" +
        '<div class="grid g2 lg mb-8"><div class="card fade"><div class="row mb-4"><div class="icon-box sm bg-p10">' + ic("brain", "lg") + '</div><h3 style="font-weight:600">' + t("dashboard.rootCause") + '</h3></div><p class="prose">' + esc(t("ai.root." + k)) + "</p></div>" +
        '<div class="card fade"><h3 style="font-weight:600;margin-bottom:16px">' + t("dashboard.profile") + "</h3>" + radar(labels, a.radar) + "</div></div>" +
        '<div class="grid g2 lg mb-8"><div class="gradient-card center fade"><p style="font-size:14px;opacity:.75;margin-bottom:8px">' + t("dashboard.distractionScore") + "</p>" + circ(a.distraction, "#FFD700") +
        '<h3 style="font-size:20px;font-weight:700;margin:16px 0 4px">' + (neg ? t("dashboard.negativeImpact") : t("dashboard.positiveImpact")) + '</h3><p style="font-size:14px;opacity:.85">' + (neg ? t("dashboard.negativeDesc") : t("dashboard.positiveDesc")) + "</p></div>" +
        '<div class="card fade"><div class="row mb-6"><div class="icon-box sm bg-p10">' + ic("chart", "lg") + '</div><h3 style="font-weight:600">' + t("dashboard.habitBreakdown") + "</h3></div>" +
        bar(t("dashboard.positiveUsage"), a.pos, "#22c55e") + bar(t("dashboard.distractionLevel"), a.dis, "#ef4444") + bar(t("dashboard.academicMotivation"), a.mot, "#0096FF") + "</div></div>" +
        '<div class="mb-8"><div class="row mb-6">' + ic("target", "xl") + '<h2 style="font-size:24px;font-weight:700">' + t("dashboard.strategies") + '</h2></div><div class="grid g2">' +
        a.strategies.map(function (s, i) {
          return '<div class="card hover fade"><h3 class="row" style="font-weight:600;margin-bottom:12px"><span class="strategy-n">' + (i + 1) + "</span>" + t("ai.strategy" + s + ".title") + '</h3><p class="muted" style="font-size:14px;margin-bottom:16px;opacity:.85">' + t("ai.strategy" + s + ".desc") + "</p><ul style=\"list-style:none;padding:0;margin:0;display:grid;gap:8px\">" +
            [1, 2, 3].map(function (n) { return '<li class="row" style="align-items:flex-start;font-size:14px"><span class="dot"></span><span>' + t("ai.strategy" + s + ".item" + n) + "</span></li>"; }).join("") + "</ul></div>";
        }).join("") + "</div></div>" +
        '<div class="rating-card mb-8" id="satisfaction-card"><h3 style="font-size:22px;font-weight:700;margin-bottom:8px;color:#0F172A">' + t("dashboard.satisfaction.title") + '</h3><p class="muted" style="margin-bottom:20px;opacity:.85;font-size:15px">' + t("dashboard.satisfaction.desc") + '</p><div class="stars" id="stars">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-r="' + n + '" class="' + (n <= rating ? "on" : "") + '" aria-label="' + n + ' star">' + ic("star") + "</button>"; }).join("") + "</div></div>" +
        '<div class="grid g2 mb-8"><div class="nudge-a"><div class="row mb-2">' + ic("bulb", "lg") + '<h3 style="font-weight:600">' + t("dashboard.microHabit") + '</h3></div><p style="font-size:14px;line-height:1.7">' + t("ai.microHabit") + "</p></div>" +
        '<div class="nudge-p"><div class="row mb-2 primary">' + ic("trend", "lg") + '<h3 style="font-weight:600;color:var(--foreground)">' + t("dashboard.cognitiveReframe") + '</h3></div><p style="font-size:14px;line-height:1.7;font-style:italic">"' + t("ai.cognitiveReframe") + '"</p></div></div>' +
        '<div class="muted-box"><h3 style="font-size:20px;font-weight:600;margin-bottom:16px">' + t("dashboard.ready") + '</h3><p class="muted" style="max-width:672px;margin:0 auto 24px;opacity:.85">' + t("dashboard.readyDesc") + '</p><div class="row center" style="gap:16px;flex-wrap:wrap"><a class="btn btn-primary" href="' + appUrl("/commitment-wall") + '">' + ic("msg") + t("dashboard.createCommitment") + ic("arrow") + '</a><button class="btn btn-accent" id="btn-dl-result">' + ic("download", "lg") + (lang === "en" ? "Download Result Image (4:3)" : "Download Gambar Result (4:3)") + '</button></div></div></div></div>');
      var dlBtn = $("#btn-dl-result");
      if (dlBtn) {
        dlBtn.onclick = function () {
          downloadResultImage(name, a, labels);
        };
      }
      var starBtns = document.querySelectorAll("#stars button");
      function applyStarRating(r) {
        starBtns.forEach(function (btn) {
          btn.classList.remove("hover-preview");
          var val = +btn.dataset.r;
          if (val <= r) {
            btn.classList.add("on");
          } else {
            btn.classList.remove("on");
          }
        });
      }

      starBtns.forEach(function (b) {
        b.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          var r = +b.dataset.r;
          rating = r;
          applyStarRating(r);

          var did = deviceId();
          localStorage.setItem("satisfactionRating", r);

          var all = jget("allSatisfactionRatings", []);
          var i = all.findIndex(function (x) {
            return x.deviceId === did;
          });

          if (i >= 0) {
            all[i].rating = r;
          } else {
            all.push({ deviceId: did, rating: r });
          }
          jset("allSatisfactionRatings", all);

          DB.addRating(did, r)
            .then(function () {
              toast(lang === "en" ? "Rating saved to database! Thank you." : "Rating tersimpan di database! Terima kasih.");
              window.dispatchEvent(new Event("statsUpdated"));
            })
            .catch(function (err) {
              console.error("Failed to save rating to Supabase:", err);
            });
        };
      });
    }
  }

  /* Commitment Wall */
  var NOTE_COLORS = ["rgba(255,215,0,.8)", "rgba(0,209,255,.8)", "#E1F5FE", "#FFE4B5", "#E0F7FA", "#FFF9C4"];
  function noteColor(c) {
    var m = { "FFD700": 0, "00D1FF": 1, "E1F5FE": 2, "FFE4B5": 3, "E0F7FA": 4, "FFF9C4": 5 };
    var hex = /#([0-9A-Fa-f]{6})/.exec(c || ""); return hex && m[hex[1].toUpperCase()] != null ? NOTE_COLORS[m[hex[1].toUpperCase()]] : NOTE_COLORS[2];
  }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString(lang === "en" ? "en-US" : "id-ID", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }

  function mergeCommitments(server) {
    var merged = server.slice();
    var local = jget("commitments", []);
    local.forEach(function (l) {
      if (!merged.some(function (c) { return c.id === l.id; })) {
        merged.push(l);
      }
    });
    jset("commitments", merged);
    return merged;
  }
  function Wall() {
    var list = [], showForm = false, did = deviceId();
    function fetchAll() {
      return DB.getCommitments()
        .then(function (data) {
          list = mergeCommitments(data || []);
        })
        .catch(function () {
          list = jget("commitments", []);
        })
        .then(function () {
          if (getCleanPath().indexOf("/commitment-wall") >= 0) {
            draw();
          }
        });
    }

    function sorted() {
      return list.slice().sort(function (a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
    }

    var lastListJson = "";
    function draw(force) {
      var currentJson = JSON.stringify(list);
      if (!force && currentJson === lastListJson && $("#wall")) {
        // Data hasn't changed, don't re-render to avoid unnecessary refresh animation
        return;
      }
      lastListJson = currentJson;

      var ae = document.activeElement;
      var keep = ae && (ae.id === "cn" || ae.id === "ct");
      if (keep && showForm) {
        // Don't clobber the form while typing: only refresh the wall
        $("#wall").innerHTML = notes();
        $("#cnt").textContent = list.length;
        $("#stu").textContent = new Set(list.map(function (c) { return c.author; })).size;
        $("#mir").textContent = list.length;
        return;
      }
      mount0();
    }
    function notes() {
      if (!list.length) return '<p class="center muted" style="column-span:all;padding:48px">' + t("commitment.empty") + "</p>";
      return sorted().map(function (c) {
        var own = c.deviceId === did;
        return '<div class="note" style="background:' + noteColor(c.color) + '">' + (own ? '<div class="acts"><button class="icon-btn" data-e="' + esc(c.id) + '" title="Edit">' + ic("edit") + '</button><button class="icon-btn" data-d="' + esc(c.id) + '" title="Delete" style="color:#dc2626">' + ic("trash") + "</button></div>" : "") +
          '<p class="t">' + esc(c.text) + (c.edited ? ' <em style="opacity:.6;font-size:12px">(' + (lang === "en" ? "edited" : "diedit") + ")</em>" : "") + '</p><div class="meta"><b>' + esc(c.author || t("commitment.anonymous")) + "</b><span>" + fmtDate(c.timestamp) + "</span></div></div>";
      }).join("");
    }
    function mount0() {
      mount('<div class="page">' + navbar("/commitment-wall") + '<div class="container py-8"><div class="mb-8" style="max-width:896px"><div class="pill mb-4">' + ic("msg") + t("commitment.badge") + '</div><div class="row mb-4" style="gap:16px;flex-wrap:wrap"><h1 style="font-size:44px;font-weight:700">' + t("commitment.title") + '</h1><span class="live"><i></i>Live</span></div><p class="muted" style="font-size:18px;max-width:672px;opacity:.85">' + t("commitment.description") + "</p></div>" +
        '<div class="grid g2 mb-8" style="max-width:576px;gap:16px"><div class="card center" style="padding:16px"><div class="stat-v" style="font-size:28px;margin:0" id="cnt">' + list.length + '</div><div class="muted" style="font-size:14px;opacity:.85">' + t("commitment.total") + '</div></div><div class="card center" style="padding:16px"><div class="stat-v" style="font-size:28px;margin:0;color:var(--secondary)" id="stu">' + new Set(list.map(function (c) { return c.author; })).size + '</div><div class="muted" style="font-size:14px;opacity:.85">' + t("commitment.students") + "</div></div></div>" +
        (showForm ? '<div class="card shadow mb-8"><h3 style="font-weight:600;margin-bottom:16px">' + t("commitment.writeYours") + '</h3><form id="cf"><div class="field" style="margin-bottom:16px"><label>' + t("commitment.nameInitial") + '</label><input class="input" id="cn" required placeholder="' + esc(t("commitment.nameExample")) + '"/></div><div class="field" style="margin-bottom:16px"><label>' + t("commitment.textLabel") + '</label><textarea class="input" id="ct" rows="4" maxlength="200" required placeholder="' + esc(t("commitment.textPlaceholder")) + '"></textarea></div><div class="row"><button class="btn btn-primary" style="flex:1">' + t("commitment.send") + '</button><button type="button" class="btn btn-outline" id="cc">' + t("commitment.cancel") + "</button></div></form></div>"
          : '<div class="mb-8"><button class="btn btn-grad" id="sf">' + ic("msg", "lg") + t("commitment.createMine") + "</button></div>") +
        '<div class="wall" id="wall">' + notes() + '</div><div class="mirror"><h3 style="font-size:24px;font-weight:700;margin-bottom:12px">' + t("commitment.mirrorTitle") + '</h3><b id="mir">' + list.length + '</b><p style="opacity:.9;margin:8px 0">' + t("commitment.mirrorStudents") + '</p><p style="font-weight:600">' + t("commitment.joinMovement") + "</p></div></div></div>");
      bind();
    }
    function bind() {
      var sf = $("#sf");
      if (sf) {
        sf.onclick = function () {
          showForm = true;
          draw(true);
          $("#cn").focus();
        };
      }

      var cc = $("#cc");
      if (cc) {
        cc.onclick = function () {
          showForm = false;
          draw(true);
        };
      }

      var cf = $("#cf");
      if (cf) {
        cf.onsubmit = function (e) {
          e.preventDefault();
          var colors = ["#FFD700", "#00D1FF", "#E1F5FE", "#FFE4B5", "#E0F7FA", "#FFF9C4"];
          var randomColor = colors[Math.floor(Math.random() * colors.length)];
          var c = {
            id: Date.now().toString(),
            text: $("#ct").value.trim(),
            author: $("#cn").value.trim(),
            timestamp: new Date().toISOString(),
            color: "bg-[" + randomColor + "]",
            deviceId: did
          };

          if (!c.text || !c.author) return;

          list.unshift(c);
          jset("commitments", list);
          showForm = false;
          draw(true);

          DB.addCommitment(c)
            .then(function () {
              toast(lang === "en" ? "Commitment saved to database!" : "Komitmen berhasil tersimpan di database!");
              window.dispatchEvent(new Event("statsUpdated"));
              return fetchAll();
            })
            .catch(function (err) {
              console.error("Failed to add commitment to Supabase:", err);
              toast(lang === "en" ? "Failed to save to database." : "Gagal simpan komitmen ke database.");
            });
        };
      }
      document.querySelectorAll("[data-e]").forEach(function (b) { b.onclick = function () { editModal(b.dataset.e, false, fetchAll); }; });
      document.querySelectorAll("[data-d]").forEach(function (b) { b.onclick = function () { delModal(b.dataset.d, fetchAll); }; });
    }
    function find(id) { return list.filter(function (c) { return c.id === id; })[0]; }
    function editModal(id, admin, done) { return window.__edit(find(id), id, admin, done, did); }
    function delModal(id, done) { return window.__del("commitment", id, done); }
    window.__list = function () { return list; };
    mount0();
    poll(fetchAll, 3000);
  }

  /* Shared modals */
  window.__edit = function (c, id, admin, done, did) {
    if (!c) return;
    var r = $("#modal-root");
    r.innerHTML =
      '<div class="overlay" id="ov">' +
      '<div class="modal">' +
      '<div class="row between mb-4">' +
      '<h3 style="margin:0">' + (admin ? "Edit Commitment" : t("commitment.writeYours")) + '</h3>' +
      '<button id="mx">' + ic("x", "lg") + '</button>' +
      '</div>' +
      (admin ? '<p class="mb-2" style="font-size:14px">Author: <b>' + esc(c.author) + "</b></p>" : "") +
      '<textarea class="input mb-4" id="et" rows="4" maxlength="200">' + esc(c.text) + '</textarea>' +
      '<div class="row">' +
      '<button class="btn btn-primary" id="es" style="flex:1">Save</button>' +
      '<button class="btn btn-outline" id="ec">' + t("commitment.cancel") + '</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    function close() {
      r.innerHTML = "";
    }

    $("#mx").onclick = $("#ec").onclick = close;
    $("#ov").onclick = function (e) {
      if (e.target.id === "ov") close();
    };

    $("#es").onclick = function () {
      var txt = $("#et").value.trim();
      if (!txt) return;

      DB.editCommitment(id, txt)
        .then(function () {
          var l = jget("commitments", []).map(function (x) {
            return x.id === id ? Object.assign({}, x, { text: txt, edited: true }) : x;
          });
          jset("commitments", l);
          close();
          done();
        })
        .catch(console.error);
    };
  };

  window.__del = function (kind, id, done) {
    var r = $("#modal-root");
    var title = kind === "commitment" ? "Delete Commitment?" : "Delete Participant Data?";
    r.innerHTML =
      '<div class="overlay" id="ov">' +
      '<div class="modal center">' +
      '<h3>' + title + '</h3>' +
      '<p class="muted" style="margin-bottom:24px;opacity:.85">This action cannot be undone.</p>' +
      '<div class="row">' +
      '<button class="btn btn-danger" id="ds" style="flex:1">' + ic("trash") + 'Delete</button>' +
      '<button class="btn btn-outline" id="dc">' + t("commitment.cancel") + '</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    function close() {
      r.innerHTML = "";
    }

    $("#dc").onclick = close;
    $("#ov").onclick = function (e) {
      if (e.target.id === "ov") close();
    };

    $("#ds").onclick = function () {
      var btn = $("#ds");
      if (btn) {
        btn.disabled = true;
        btn.textContent = lang === "en" ? "Deleting..." : "Menghapus...";
      }

      function finishLocal() {
        if (kind === "commitment") {
          jset("commitments", jget("commitments", []).filter(function (x) {
            return x.id !== id;
          }));
        } else {
          jset("allParticipants", jget("allParticipants", []).filter(function (x) {
            return x.id !== id;
          }));
        }
        window.dispatchEvent(new Event("statsUpdated"));
        close();
        if (typeof done === "function") done();
      }

      DB.deleteItem(kind, id)
        .then(function () {
          finishLocal();
        })
        .catch(function (err) {
          console.warn("Delete item on Supabase failed, removing locally:", err);
          finishLocal();
        });
    };
  };

  /* Admin */
  function Admin() {
    var parts = [], coms = [], tab = "participants", q = "", loading = false;
    var lastDataHash = "";

    function load() {
      loading = true;

      return Promise.all([
        DB.getParticipants()
          .then(function (data) {
            var m = (data || []).slice();
            jget("allParticipants", []).forEach(function (l) {
              if (!m.some(function (p) { return p.id === l.id; })) {
                m.push(l);
              }
            });
            parts = m;
          })
          .catch(function () {
            parts = jget("allParticipants", []);
          }),

        DB.getCommitments()
          .then(function (data) {
            coms = mergeCommitments(data || []);
          })
          .catch(function () {
            coms = jget("commitments", []);
          })
      ]).then(function () {
        loading = false;
        var onAdminPage = getCleanPath().indexOf("/adminganteng") >= 0;
        var modalOpen = Boolean($("#modal-root").innerHTML);
        var searchFocused = document.activeElement && document.activeElement.id === "q";

        if (onAdminPage && !modalOpen && !searchFocused) {
          draw();
        }
      });
    }

    function draw(force) {
      var currentHash = tab + "|" + parts.length + "|" + coms.length + "|" + q + "|" + JSON.stringify(parts.map(function (x) { return x.id; })) + "|" + JSON.stringify(coms.map(function (x) { return x.id + x.text; }));
      if (!force && currentHash === lastDataHash && $(".school-group, .folder, .empty")) {
        // Data unchanged, avoid re-rendering to eliminate flickering
        return;
      }
      lastDataHash = currentHash;

      var fp = parts.filter(function (p) {
        var s = q.toLowerCase();
        return !s || (p.name || "").toLowerCase().indexOf(s) >= 0 || (p.school || "").toLowerCase().indexOf(s) >= 0;
      });

      var body = "";
      if (tab === "participants") {
        var groups = {};
        fp.forEach(function (p) {
          var sch = (p.school || "").trim() || (lang === "en" ? "Other / Unspecified" : "Lainnya / Tidak Disebutkan");
          if (!groups[sch]) groups[sch] = [];
          groups[sch].push(p);
        });

        var sortedSchools = Object.keys(groups).sort(function (a, b) {
          return a.localeCompare(b);
        });

        var schoolHtml = sortedSchools.map(function (sch) {
          var items = groups[sch];
          var cardsHtml = items.map(function (p) {
            var a = generateAnalysis(p.answers || []);
            return '<div class="card folder" data-id="' + esc(p.id) + '">' +
              '<div class="icon-box sm bg-p10 mb-4">' + ic("folder", "lg") + '</div>' +
              '<h3>' + esc(p.name) + '</h3>' +
              '<p class="muted" style="font-size:14px;margin-bottom:12px;opacity:.85">' + esc(p.school || "-") + '</p>' +
              '<span class="risk ' + a.risk + '">' + t("risk." + a.risk) + '</span>' +
              '<p class="row muted" style="font-size:12px;margin-top:12px;opacity:.7">' + ic("cal") + fmtDate(p.timestamp) + '</p>' +
              '<div class="folder-actions">' +
                '<a class="btn-view-result" href="' + appUrl("/adminganteng/" + esc(p.id)) + '" data-vr="' + esc(p.id) + '">' + ic("eye") + '<span>View Result</span></a>' +
                '<button class="btn-download-result" data-dl="' + esc(p.id) + '" title="Download Image">' + ic("download") + '<span>Download</span></button>' +
                '<button class="btn-card-del" data-px="' + esc(p.id) + '" title="Hapus Data">' + ic("trash") + '<span>Hapus</span></button>' +
              '</div>' +
            '</div>';
          }).join("");

          return '<div class="school-group">' +
            '<div class="school-header">' +
              '<div class="school-title">' + ic("folder", "lg") + '<span>' + esc(sch) + '</span></div>' +
              '<span class="school-count">' + items.length + ' ' + (lang === "en" ? "Students" : "Siswa") + '</span>' +
            '</div>' +
            '<div class="grid g3">' + cardsHtml + '</div>' +
          '</div>';
        }).join("");

        body = '<div style="position:relative" class="mb-8">' +
          '<span style="position:absolute;left:16px;top:14px;color:var(--primary)">' + ic("search", "lg") + '</span>' +
          '<input id="q" class="search" placeholder="' + (lang === "en" ? "Search by name or school..." : "Cari nama atau sekolah...") + '" value="' + esc(q) + '"/>' +
        '</div>' +
        (fp.length ? schoolHtml : '<div class="empty"><div class="icon-box bg-p10" style="margin:0 auto 16px;width:80px;height:80px;border-radius:50%">' + ic("folder", "xxl") + '</div><h3 style="font-size:20px;font-weight:600">' + (lang === "en" ? "No Participants Found" : "Data Peserta Tidak Ditemukan") + '</h3><p class="muted" style="opacity:.8">' + (q ? (lang === "en" ? "Try another search." : "Coba kata kunci pencarian lain.") : (lang === "en" ? "Participant data will appear here in real time." : "Data peserta akan otomatis muncul di sini.")) + '</p></div>');
      } else {
        body = coms.length ? '<div class="grid g3">' + coms.slice().sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).map(function (c) {
          return '<div class="note" style="background:' + noteColor(c.color) + '"><div class="acts"><button class="icon-btn" data-ce="' + esc(c.id) + '">' + ic("edit") + '</button><button class="icon-btn" data-cd="' + esc(c.id) + '" style="color:#dc2626">' + ic("trash") + '</button></div><p class="t">' + esc(c.text) + (c.edited ? " <em>(edited)</em>" : "") + '</p><div class="meta"><b>' + esc(c.author) + "</b><span>" + fmtDate(c.timestamp) + "</span></div></div>";
        }).join("") + "</div>" : '<div class="empty"><h3 style="font-size:20px;font-weight:600">No Commitments Yet</h3></div>';
      }

      mount('<div class="page"><div class="container py-8"><div class="row between mb-8" style="flex-wrap:wrap;gap:16px"><div class="row" style="gap:16px"><a class="btn btn-outline" href="' + appUrl("/") + '" style="padding:8px 14px">' + ic("back") + '</a><div><h1 style="font-size:28px;font-weight:700">Admin Dashboard</h1><p class="muted" style="font-size:14px;opacity:.85">Participant Archive System</p></div></div><div class="row" style="gap:12px"><span class="pill">' + ic("folder") + parts.length + ' Files</span><span class="live"><i></i>Live</span></div></div>' +
        '<div class="tabs"><button class="tab ' + (tab === "participants" ? "on" : "") + '" data-tab="participants">' + ic("users") + "Participants (" + parts.length + ')</button><button class="tab ' + (tab === "commitments" ? "on" : "") + '" data-tab="commitments">' + ic("msg") + "Commitments (" + coms.length + ")</button></div>" + body + "</div></div>");

      document.querySelectorAll("[data-tab]").forEach(function (b) {
        b.onclick = function () {
          tab = b.dataset.tab;
          draw(true);
        };
      });

      var qi = $("#q");
      if (qi) {
        qi.oninput = function () {
          q = qi.value;
          var pos = qi.selectionStart;
          draw(true);
          var n = $("#q");
          if (n) {
            n.focus();
            n.setSelectionRange(pos, pos);
          }
        };
      }

      document.querySelectorAll(".folder").forEach(function (f) {
        f.onclick = function (e) {
          if (e.target.closest("[data-px]") || e.target.closest("[data-vr]") || e.target.closest("[data-dl]")) return;
          navigate("/adminganteng/" + f.dataset.id);
        };
      });

      document.querySelectorAll("[data-dl]").forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          e.preventDefault();
          var id = b.dataset.dl;
          var p = parts.filter(function (x) { return x.id === id; })[0];
          if (p) {
            var a = generateAnalysis(p.answers || []);
            var labels = ["focus", "screenTime", "impulsivity", "selfControl", "awareness"].map(function (x) { return t("ai.radar." + x); });
            downloadResultImage(p.name, a, labels);
          }
        };
      });

      document.querySelectorAll("[data-px]").forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          e.preventDefault();
          window.__del("participant", b.dataset.px, load);
        };
      });

      document.querySelectorAll("[data-ce]").forEach(function (b) {
        b.onclick = function () {
          var c = coms.filter(function (x) {
            return x.id === b.dataset.ce;
          })[0];
          window.__edit(c, c && c.id, true, load);
        };
      });

      document.querySelectorAll("[data-cd]").forEach(function (b) {
        b.onclick = function () {
          window.__del("commitment", b.dataset.cd, load);
        };
      });
    }

    draw(true);
    poll(load, 3000);
  }

  function AdminDetail(id) {
    function render(p) {
      if (!p) { mount('<div class="page"><div class="container w-2xl py-16 center"><h2 style="font-size:24px;font-weight:700;margin-bottom:16px">Participant Not Found</h2><a class="btn btn-primary" href="' + appUrl("/adminganteng") + '">' + ic("back") + " Back</a></div></div>"); return; }
      var a = generateAnalysis(p.answers || []), k = a.key, Q = QUESTIONS[lang === "en" ? "en" : "id"];
      var labels = ["focus", "screenTime", "impulsivity", "selfControl", "awareness"].map(function (x) { return t("ai.radar." + x); });
      function label(qi, v) {
        var q = Q[qi]; if (!q) return esc(v);
        if (q.type === "multiple-choice") { var o = q.options.filter(function (x) { return x.value === v; })[0]; return esc(o ? o.label : v); }
        return q.statements.map(function (s, i) { var o = q.likertOptions.filter(function (x) { return x.value === (v || {})[i]; })[0]; return '<div style="margin-top:4px">• ' + esc(s) + ' → <b>' + esc(o ? o.label : (v || {})[i]) + "</b></div>"; }).join("");
      }
      mount('<div class="page"><div class="container w-6xl py-8"><div class="row between mb-8" style="flex-wrap:wrap;gap:16px"><div class="row" style="gap:16px"><a class="btn btn-outline" href="' + appUrl("/adminganteng") + '" style="padding:8px 14px">' + ic("back") + '</a><div><h1 style="font-size:22px;font-weight:700">' + esc(p.name) + '</h1><p class="muted" style="font-size:13px;opacity:.85">' + esc(p.school) + " · " + fmtDate(p.timestamp) + '</p></div></div><div class="row" style="gap:10px"><button class="btn btn-accent" id="dl-detail">' + ic("download") + 'Download Image</button><button class="btn btn-danger" id="dp">' + ic("trash") + 'Delete</button></div></div>' +
        '<div class="gradient-card mb-8"><div class="row between" style="align-items:flex-start"><div><h2 style="font-size:22px;font-weight:700;margin-bottom:4px">' + t("ai.label." + k) + '</h2><p style="font-size:14px;opacity:.9">' + t("ai.desc." + k) + '</p></div><div class="risk ' + a.risk + '">' + t("risk." + a.risk) + '</div></div><div class="glass"><b style="font-size:12px">Behavior Type</b><p style="font-size:12px;opacity:.9">' + t("ai.behavior." + k) + "</p></div></div>" +
        '<div class="grid g2 lg mb-8"><div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Root Cause Analysis</h3><p class="prose" style="font-size:13px">' + esc(t("ai.root." + k)) + '</p></div><div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:8px">Digital Behavior Profile</h3>' + radar(labels, a.radar) + "</div></div>" +
        '<div class="grid g2 lg mb-8"><div class="gradient-card center"><p style="font-size:13px;opacity:.75">' + t("dashboard.distractionScore") + "</p>" + circ(a.distraction, "#FFD700") + '</div><div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:16px">Habit Breakdown</h3>' +
        [["Positive Usage", a.pos, "#22c55e"], ["Distraction Level", a.dis, "#ef4444"], ["Academic Motivation", a.mot, "#0096FF"]].map(function (b) { return '<div style="margin-bottom:14px"><div class="row between" style="font-size:12px"><span>' + b[0] + "</span><b>" + b[1] + '%</b></div><div class="bar"><div style="width:' + b[1] + "%;background:" + b[2] + '"></div></div></div>'; }).join("") + "</div></div>" +
        '<div class="card"><h3 style="font-weight:600;margin-bottom:8px">Raw Answers</h3>' + (p.answers || []).map(function (an) { return '<div class="ans"><div class="muted" style="font-size:12px;opacity:.8">' + esc((Q[an.questionId] || {}).category) + '</div><div style="font-weight:500">' + esc((Q[an.questionId] || {}).question) + '</div><div style="margin-top:4px">' + label(an.questionId, an.answer) + "</div></div>"; }).join("") + "</div></div></div>");
      $("#dp").onclick = function () { window.__del("participant", p.id, function () { navigate("/adminganteng"); }); };
      var dlBtn = $("#dl-detail");
      if (dlBtn) {
        dlBtn.onclick = function () {
          downloadResultImage(p.name, a, labels);
        };
      }
    }
    var cur = null, first = true;
    function load() {
      DB.getParticipants().then(function (participants) {
        var p = (participants || []).filter(function (x) { return x.id === id; })[0] || jget("allParticipants", []).filter(function (x) { return x.id === id; })[0];
        var s = JSON.stringify(p); if (first || s !== cur) { if (!$("#modal-root").innerHTML) render(p); cur = s; first = false; }
      }).catch(function () { if (first) { render(jget("allParticipants", []).filter(function (x) { return x.id === id; })[0]); first = false; } });
    }
    poll(load, 3000);
  }

  function NotFound() {
    mount('<div class="page" style="display:flex;align-items:center;justify-content:center"><div class="center fade" style="padding:24px"><div style="font-size:96px;font-weight:700;color:var(--primary)">404</div><h2 style="font-size:24px;font-weight:700;margin:8px 0">Page Not Found</h2><p class="muted" style="margin-bottom:24px;opacity:.85">The page you are looking for does not exist.</p><a class="btn btn-primary" href="' + appUrl("/") + '">' + ic("home") + "Back to Home</a></div></div>");
  }

  /* ---------- Language switcher ---------- */
  var menuOpen = false;
  function switcher() {
    $("#lang-switcher").innerHTML =
      (menuOpen
        ? '<div class="lang-menu">' +
          '<button data-l="en" class="' + (lang === "en" ? "on" : "") + '"><span style="font-size:20px">🇬🇧</span>English</button>' +
          '<button data-l="id" class="' + (lang === "id" ? "on" : "") + '"><span style="font-size:20px">🇮🇩</span>Bahasa Indonesia</button>' +
          '</div>'
        : "") +
      '<button class="lang-fab" aria-label="Language">' + ic("globe", "lg") + '</button>';

    $("#lang-switcher .lang-fab").onclick = function () {
      menuOpen = !menuOpen;
      switcher();
    };

    document.querySelectorAll(".lang-menu button").forEach(function (b) {
      b.onclick = function () {
        lang = b.dataset.l;
        localStorage.setItem("language", lang);
        document.documentElement.lang = lang;
        menuOpen = false;
        switcher();
        route();
      };
    });
  }

  /* ---------- Router ---------- */
  function route() {
    clearPollers();
    $("#modal-root").innerHTML = "";

    var h = getCleanPath();
    if (h === "/") {
      Home();
    } else if (h === "/test") {
      Test();
    } else if (h === "/dashboard") {
      Dashboard();
    } else if (h === "/commitment-wall") {
      Wall();
    } else if (h === "/adminganteng") {
      Admin();
    } else if (h.indexOf("/adminganteng/") === 0) {
      AdminDetail(decodeURIComponent(h.slice(14)));
    } else {
      NotFound();
    }
  }

  window.addEventListener("popstate", route);
  window.addEventListener("hashchange", route);
  window.addEventListener("statsUpdated", function () {
    if (getCleanPath() === "/") {
      route();
    }
  });

  // Intercept internal link clicks to use navigate() for smooth SPA transitions
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a || !a.getAttribute("href")) return;
    var href = a.getAttribute("href");
    // Ignore external or non-http links
    if (href.indexOf("http://") === 0 || href.indexOf("https://") === 0 || href.indexOf("//") === 0 || href.indexOf("mailto:") === 0) return;
    if (href.indexOf("#") === 0) return;

    var base = getBasePath();
    var targetPath = href;
    if (base && href.indexOf(base) === 0) {
      targetPath = href.slice(base.length);
    }
    if (targetPath.charAt(0) !== "/") targetPath = "/" + targetPath;

    e.preventDefault();
    navigate(targetPath);
  });

  /* ---------- Global Console Reset Commands ---------- */
  window.resetAnalysis = function () {
    localStorage.removeItem("testCompleted");
    localStorage.removeItem("testAnswers");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("satisfactionRating");
    console.log("✅ Analisis lokal berhasil di-reset!");
    route();
  };

  window.resetCommitments = function () {
    localStorage.removeItem("commitments");
    console.log("✅ Commitment lokal berhasil di-reset!");
    route();
  };

  window.resetAll = function () {
    localStorage.removeItem("testCompleted");
    localStorage.removeItem("testAnswers");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("satisfactionRating");
    localStorage.removeItem("commitments");
    localStorage.removeItem("allParticipants");
    localStorage.removeItem("allSatisfactionRatings");
    console.log("✅ Semua data analisis & commitment lokal berhasil dibersihkan!");
    navigate("/");
  };

  /* ---------- Auto-sync local cache to Supabase ---------- */
  function syncLocalToSupabase() {
    if (!supa) return;

    // 1. Sinkronkan rating yang belum tersimpan
    var r = localStorage.getItem("satisfactionRating");
    var did = deviceId();
    if (r) {
      DB.addRating(did, parseInt(r, 10)).catch(function () {});
    }

    // 2. Sinkronkan peserta dari cache lokal ke database Supabase
    var localParts = jget("allParticipants", []);
    if (localParts && localParts.length) {
      DB.getParticipants().then(function (remoteParts) {
        var remoteIds = new Set((remoteParts || []).map(function (x) { return x.id; }));
        localParts.forEach(function (lp) {
          if (lp && lp.id && !remoteIds.has(lp.id)) {
            DB.saveParticipant(lp).catch(function () {});
          }
        });
      }).catch(function () {});
    }

    // 3. Sinkronkan komitmen dari cache lokal ke database Supabase
    var localComms = jget("commitments", []);
    if (localComms && localComms.length) {
      DB.getCommitments().then(function (remoteComms) {
        var remoteIds = new Set((remoteComms || []).map(function (x) { return x.id; }));
        localComms.forEach(function (lc) {
          if (lc && lc.id && !remoteIds.has(lc.id)) {
            DB.addCommitment(lc).catch(function () {});
          }
        });
      }).catch(function () {});
    }
  }

  document.documentElement.lang = lang;
  switcher();
  syncLocalToSupabase();
  route();
})();
