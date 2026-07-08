/** Creative Reports — client-side UI (tabs, tables, jobs, import). */
(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  // ---- Sidebar ----
  (function initSidebar() {
    var app = $("#app");
    var sidebar = $("#sidebar");
    var backdrop = $("#sidebar-backdrop");
    var toggle = $("#sidebar-toggle");
    var mobileBtn = $("#mobile-menu-btn");
    if (!sidebar || !app) return;

    var expanded = localStorage.getItem("sidebar-expanded") === "1";
    if (expanded && window.innerWidth > 768) {
      sidebar.classList.add("expanded");
      app.classList.add("sidebar-expanded");
    }

    function setMobileOpen(open) {
      sidebar.classList.toggle("mobile-open", open);
      if (backdrop) backdrop.classList.toggle("visible", open);
      if (backdrop) backdrop.hidden = !open;
    }

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (window.innerWidth <= 768) {
          setMobileOpen(false);
          return;
        }
        var isExpanded = sidebar.classList.toggle("expanded");
        app.classList.toggle("sidebar-expanded", isExpanded);
        localStorage.setItem("sidebar-expanded", isExpanded ? "1" : "0");
      });
    }

    if (mobileBtn) {
      mobileBtn.addEventListener("click", function () {
        setMobileOpen(true);
      });
    }

    if (backdrop) {
      backdrop.addEventListener("click", function () {
        setMobileOpen(false);
      });
    }

    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) setMobileOpen(false);
    });
  })();

  function toast(msg, ok) {
    const box = $("#toast");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + (ok ? "ok" : "err");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 5000);
  }

  // ---- Tabs ----
  $$("[data-tabs]").forEach(function (wrap) {
    const tabs = $$(".tab", wrap);
    const panels = $$(".tab-panel", wrap.parentElement || document);
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const key = tab.getAttribute("data-tab");
        tabs.forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        panels.forEach(function (p) {
          if (p.getAttribute("data-panel") === key) p.classList.add("active");
          else if (wrap.contains(tab) && p.closest(".card-body, .main, .content")) {
            const parent = tab.closest(".card-body, .main");
            if (parent && parent.contains(p)) p.classList.remove("active");
          }
        });
        // sibling panels only within same card-body
        const body = tab.closest(".card-body");
        if (body) {
          $$(".tab-panel", body).forEach(function (p) {
            p.classList.toggle("active", p.getAttribute("data-panel") === key);
          });
        }
      });
    });
  });

  // ---- Table filter ----
  $$(".table-filter").forEach(function (input) {
    input.addEventListener("input", function () {
      const key = input.getAttribute("data-target");
      const table = document.querySelector('[data-table="' + key + '"]');
      if (!table) return;
      const q = input.value.toLowerCase();
      $$("tbody tr", table).forEach(function (tr) {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  });

  // ---- Table sort ----
  $$("table.sortable").forEach(function (table) {
    $$("thead th", table).forEach(function (th, idx) {
      if (th.classList.contains("no-sort")) return;
      th.addEventListener("click", function () {
        const tbody = $("tbody", table);
        if (!tbody) return;
        $$(".drill-detail-row", tbody).forEach(function (r) {
          r.remove();
        });
        $$(".drillable-row.active", tbody).forEach(function (r) {
          r.classList.remove("active");
        });
        $$(".drill-view-btn.active", tbody).forEach(function (btn) {
          btn.classList.remove("active");
          btn.setAttribute("aria-expanded", "false");
          btn.textContent = "View demo";
        });
        const rows = Array.from(tbody.querySelectorAll("tr:not(.drill-detail-row)"));
        const type = th.getAttribute("data-type") || "text";
        const asc = th.getAttribute("data-dir") !== "asc";
        th.setAttribute("data-dir", asc ? "asc" : "desc");
        rows.sort(function (a, b) {
          const ac = a.children[idx];
          const bc = b.children[idx];
          const av = type === "num" ? parseFloat(ac.getAttribute("data-sort") || ac.textContent) || 0 : ac.textContent.trim().toLowerCase();
          const bv = type === "num" ? parseFloat(bc.getAttribute("data-sort") || bc.textContent) || 0 : bc.textContent.trim().toLowerCase();
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
        rows.forEach(function (r) {
          tbody.appendChild(r);
        });
      });
    });
  });

  // ---- Jobs ----
  async function runJob(job, postSlack) {
    const btn = document.activeElement;
    if (btn && btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.dataset.orig = btn.textContent || "";
      btn.innerHTML = '<span class="spin"></span> Running…';
    }
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: job, brand: "NOBL", postToSlack: postSlack !== false }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "Job failed");
      toast(job + " completed" + (data.runId ? " · run " + data.runId.slice(0, 8) : ""), true);
      setTimeout(function () {
        location.reload();
      }, 1200);
    } catch (err) {
      toast((err && err.message) || "Job failed", false);
    } finally {
      if (btn && btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = btn.dataset.orig || "Run";
      }
    }
  }

  document.addEventListener("click", function (e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const jobBtn = t.closest("[data-job]");
    if (jobBtn) {
      e.preventDefault();
      const job = jobBtn.getAttribute("data-job");
      const postSlack = jobBtn.getAttribute("data-post-slack") !== "false";
      if (job) runJob(job, postSlack);
    }
  });

  // ---- Connection tests ----
  document.addEventListener("click", async function (e) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest("[data-test]");
    if (!btn) return;
    e.preventDefault();
    const type = btn.getAttribute("data-test");
    const key = btn.getAttribute("data-test-key") || undefined;
    btn.setAttribute("disabled", "true");
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type, key: key }),
      });
      const data = await res.json();
      toast((type || "test") + ": " + (data.detail || (data.ok ? "OK" : "failed")), !!data.ok);
    } catch (err) {
      toast("Test failed", false);
    } finally {
      btn.removeAttribute("disabled");
    }
  });

  // ---- Import ----
  const dropzone = $("#dropzone");
  const fileInput = $("#import-file");
  const importBtn = $("#import-btn");
  const importForm = $("#import-form");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", function () {
      fileInput.click();
    });
    dropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      dropzone.classList.add("drag");
    });
    dropzone.addEventListener("dragleave", function () {
      dropzone.classList.remove("drag");
    });
    dropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      dropzone.classList.remove("drag");
      if (e.dataTransfer && e.dataTransfer.files[0]) {
        fileInput.files = e.dataTransfer.files;
        if (importBtn) importBtn.disabled = false;
      }
    });
    fileInput.addEventListener("change", function () {
      if (importBtn) importBtn.disabled = !fileInput.files || !fileInput.files.length;
    });
  }

  if (importForm) {
    importForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
      if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = "Importing…";
      }
      const fd = new FormData(importForm);
      try {
        const res = await fetch("/api/import", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Import failed");
        toast("Imported " + data.parsed + " ads · run " + (data.runId || "").slice(0, 8), true);
        setTimeout(function () {
          location.href = "/overview";
        }, 1200);
      } catch (err) {
        toast((err && err.message) || "Import failed", false);
        if (importBtn) importBtn.disabled = false;
        if (importBtn) importBtn.textContent = "Import & Analyze";
      }
    });
  }

  // ---- Reports viewer ----
  const reportsDataEl = $("#reports-data");
  if (reportsDataEl) {
    let reports = [];
    try {
      reports = JSON.parse(reportsDataEl.textContent || "[]");
    } catch (e) {}
    let activeId = $("#reports-app")?.getAttribute("data-initial-id") || "";

    function selectReport(id) {
      const r = reports.find(function (x) {
        return x.id === id;
      });
      if (!r) return;
      activeId = id;
      $$(".report-item").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-report-id") === id);
      });
      const title = $("#report-title");
      const md = $("#report-markdown");
      const slack = $("#report-slack");
      if (title) title.textContent = r.title;
      if (md) md.innerHTML = renderMd(r.markdown);
      if (slack) {
        slack.innerHTML =
          '<div class="av">CR</div><div class="body"><div class="head"><strong>Creative Reports</strong> <span class="badge muted">bot</span></div><div style="margin-top:8px">' +
          slackHtml(r.slack_summary) +
          "</div></div>";
      }
    }

    function esc(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    function slackHtml(s) {
      return esc(s).replace(/\*(.+?)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
    }
    function renderMd(src) {
      return esc(src)
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>\n?)+/g, function (m) {
          return "<ul>" + m + "</ul>";
        })
        .replace(/\n\n/g, "</p><p>")
        .replace(/^(.+)$/gm, function (line) {
          if (/^<[hul]/.test(line)) return line;
          return line ? "<p>" + line + "</p>" : "";
        });
    }

    $$(".report-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectReport(btn.getAttribute("data-report-id") || "");
      });
    });

    const slackPost = $("#btn-slack-post");
    if (slackPost) {
      slackPost.addEventListener("click", async function () {
        if (!activeId) return;
        slackPost.disabled = true;
        try {
          const res = await fetch("/api/slack/post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportId: activeId }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Slack post failed");
          toast("Posted to Slack", true);
        } catch (err) {
          toast((err && err.message) || "Slack failed", false);
        } finally {
          slackPost.disabled = false;
        }
      });
    }
  }

  // ---- Creative analysis: inline demo drill-down ----
  const drillDataEl = $("#demo-drill-data");
  if (drillDataEl) {
    let drillData = { l7: { categories: {}, openers: {}, colors: {} }, l30: { categories: {}, openers: {}, colors: {} }, windows: {} };
    try {
      drillData = JSON.parse(drillDataEl.textContent || "{}");
    } catch (e) {}

    const dimLabels = { categories: "Category", openers: "Opener", colors: "Color" };
    const fmtCur = function (n) {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
    };
    const fmtPct = function (n) {
      return Math.round((n || 0) * 100) + "%";
    };
    const fmtRoas = function (n) {
      return (n || 0).toFixed(2) + "x";
    };

    function esc(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function renderDemoTable(rows) {
      if (!rows || !rows.length) {
        return '<p class="muted drill-empty">No on-camera demo-coded spend for this selection.</p>';
      }
      var html =
        '<table class="data-table drill-demo-table"><thead><tr>' +
        "<th>Demo</th><th>W/L</th><th>Spend</th><th>Share</th><th>NV %</th><th>Meta ROAS</th><th>Attrib. ROAS</th>" +
        "</tr></thead><tbody>";
      rows.forEach(function (r) {
        html +=
          "<tr><td><strong>" +
          esc(r.label) +
          "</strong></td>" +
          '<td class="tabular"><span class="wl-win">' +
          r.wins +
          'W</span> / <span class="wl-loss">' +
          r.losses +
          "L</span></td>" +
          '<td class="tabular">' +
          fmtCur(r.spend) +
          "</td>" +
          '<td class="tabular">' +
          fmtPct(r.share) +
          "</td>" +
          '<td class="tabular">' +
          fmtPct(r.nvPct) +
          "</td>" +
          '<td class="tabular">' +
          fmtRoas(r.metaRoas) +
          "</td>" +
          '<td class="tabular">' +
          fmtRoas(r.twRoas) +
          "</td></tr>";
      });
      html += "</tbody></table>";
      return html;
    }

    function clearDrillRows() {
      $$(".drill-detail-row").forEach(function (r) {
        r.remove();
      });
      $$(".drillable-row.active").forEach(function (r) {
        r.classList.remove("active");
      });
      $$(".drill-view-btn.active").forEach(function (btn) {
        btn.classList.remove("active");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "View demo";
      });
    }

    function getDrillRows(dim, key, win) {
      var winData = drillData[win] || {};
      var map = winData[dim] || {};
      return map[key] || [];
    }

    function toggleDrill(btn) {
      var row = btn.closest("tr.drillable-row");
      if (!row) return;
      var table = row.closest("table");
      var next = row.nextElementSibling;
      if (next && next.classList.contains("drill-detail-row")) {
        clearDrillRows();
        return;
      }

      clearDrillRows();

      var dim = row.getAttribute("data-drill-dim") || "";
      var key = row.getAttribute("data-drill-key") || "";
      var label = row.getAttribute("data-drill-label") || "";
      var win = row.getAttribute("data-drill-window") || "l7";
      var rows = getDrillRows(dim, key, win);
      var winLabel = win === "l7" ? drillData.windows && drillData.windows.l7 : drillData.windows && drillData.windows.l30;
      var colCount = table ? parseInt(table.getAttribute("data-drill-cols") || "0", 10) : 0;
      if (!colCount && table) colCount = table.querySelectorAll("thead th").length;

      var detail = document.createElement("tr");
      detail.className = "drill-detail-row";
      detail.innerHTML =
        '<td colspan="' +
        colCount +
        '"><div class="drill-inline">' +
        '<div class="drill-inline-head">' +
        '<div class="drill-inline-kicker">' +
        esc((dimLabels[dim] || dim) + " · Creator demo · " + (win === "l7" ? "L7" : "L30")) +
        "</div>" +
        "<strong>" +
        esc(label) +
        "</strong>" +
        (winLabel ? '<span class="muted drill-inline-dates">' + esc(winLabel) + "</span>" : "") +
        "</div>" +
        renderDemoTable(rows) +
        "</div></td>";
      row.after(detail);
      row.classList.add("active");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      btn.textContent = "Close";
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!(t instanceof HTMLElement)) return;
      var btn = t.closest(".drill-view-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      toggleDrill(btn);
    });

    $$("[data-tabs] .tab").forEach(function (tab) {
      tab.addEventListener("click", clearDrillRows);
    });
  }
})();
