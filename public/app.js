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
    let editing = false;

    function activeReport() {
      return reports.find(function (x) { return x.id === activeId; });
    }

    function setEditMode(enabled) {
      editing = enabled;
      const editor = $("#report-editor");
      const tabs = $("#report-viewer .tabs");
      const panels = $$("#report-viewer .tab-panel");
      if (editor) editor.hidden = !enabled;
      if (tabs) tabs.hidden = enabled;
      panels.forEach(function (panel) { panel.hidden = enabled; });
    }

    function selectReport(id) {
      const r = reports.find(function (x) {
        return x.id === id;
      });
      if (!r) return;
      if (editing && !window.confirm("Discard unsaved report changes?")) return;
      setEditMode(false);
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
      window.history.replaceState({}, "", "/reports?id=" + encodeURIComponent(id));
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
      const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
      const out = [];
      let i = 0;
      let inList = false;
      let inQuote = false;
      function inline(t) {
        return esc(t)
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
          .replace(/`([^`]+?)`/g, "<code>$1</code>");
      }
      function closeList() {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
      }
      function closeQuote() {
        if (inQuote) {
          out.push("</div>");
          inQuote = false;
        }
      }
      function closeBlocks() {
        closeList();
        closeQuote();
      }
      function cells(row) {
        return row.trim().replace(/^\||\|$/g, "").split("|").map(function (c) {
          return c.trim();
        });
      }
      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*---+\s*$/.test(line)) {
          closeBlocks();
          i++;
          continue;
        }
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
          closeBlocks();
          out.push('<div class="table-wrap"><table><thead><tr>' + cells(line).map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") + "</tr></thead><tbody>");
          i += 2;
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
            out.push("<tr>" + cells(lines[i]).map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>");
            i++;
          }
          out.push("</tbody></table></div>");
          continue;
        }
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          closeBlocks();
          const level = h[1].length;
          out.push("<h" + level + ">" + inline(h[2].replace(/^\d+\.\s+/, "")) + "</h" + level + ">");
          i++;
          continue;
        }
        if (/^>\s?/.test(line)) {
          closeList();
          if (!inQuote) {
            out.push('<div class="report-callout">');
            inQuote = true;
          }
          out.push("<p>" + inline(line.replace(/^>\s?/, "")) + "</p>");
          i++;
          continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          closeQuote();
          if (!inList) {
            out.push("<ul>");
            inList = true;
          }
          out.push("<li>" + inline(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
          i++;
          continue;
        }
        if (line.trim() === "") {
          closeBlocks();
          i++;
          continue;
        }
        closeBlocks();
        out.push("<p>" + inline(line) + "</p>");
        i++;
      }
      closeBlocks();
      return out.join("\n");
    }

    $$(".report-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectReport(btn.getAttribute("data-report-id") || "");
      });
    });

    const editBtn = $("#btn-edit-report");
    const cancelEditBtn = $("#btn-cancel-edit");
    const editor = $("#report-editor");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        const r = activeReport();
        if (!r) return;
        $("#report-edit-title").value = r.title || "";
        $("#report-edit-slack").value = r.slack_summary || "";
        $("#report-edit-markdown").value = r.markdown || "";
        setEditMode(true);
        $("#report-edit-title").focus();
      });
    }
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", function () { setEditMode(false); });
    if (editor) {
      editor.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!activeId || !editor.reportValidity()) return;
        const saveBtn = $("#btn-save-report");
        saveBtn.disabled = true;
        try {
          const res = await fetch("/api/reports/" + encodeURIComponent(activeId), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: $("#report-edit-title").value,
              slackSummary: $("#report-edit-slack").value,
              markdown: $("#report-edit-markdown").value,
            }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Report update failed");
          const index = reports.findIndex(function (r) { return r.id === activeId; });
          reports[index] = data.report;
          const itemTitle = document.querySelector('.report-item[data-report-id="' + CSS.escape(activeId) + '"] .r-title');
          if (itemTitle) itemTitle.textContent = data.report.title;
          setEditMode(false);
          selectReport(activeId);
          toast("Report updated", true);
        } catch (err) {
          toast((err && err.message) || "Report update failed", false);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    const deleteBtn = $("#btn-delete-report");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async function () {
        const r = activeReport();
        if (!r) return;
        const confirmed = window.confirm('Permanently delete "' + r.title + '"?\n\nPreviously sent Slack messages will remain, but their report link will stop working.');
        if (!confirmed) return;
        deleteBtn.disabled = true;
        try {
          const res = await fetch("/api/reports/" + encodeURIComponent(activeId), { method: "DELETE" });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Report delete failed");
          window.location.assign("/reports");
        } catch (err) {
          toast((err && err.message) || "Report delete failed", false);
          deleteBtn.disabled = false;
        }
      });
    }

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
