// RektaBuild — Enterprise Motion, Command Palette, Toasts, Notifications, Analytics & Tables

(() => {
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  // ─── Toast Notification System ─────────────────────────────────────────────
  const toastContainer = document.getElementById("toastContainer");

  const showToast = (type, message) => {
    if (!toastContainer || !message) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type || "info"}`;
    toast.setAttribute("role", "status");
    toast.innerHTML = `
      <span class="leading-snug">${message}</span>
      <button type="button" class="btn btn-ghost btn-sm" style="padding:0 4px;" aria-label="Close">&times;</button>
    `;
    const remove = () => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector("button").addEventListener("click", remove);
    toastContainer.appendChild(toast);
    setTimeout(remove, 4500);
  };
  window.RektaToast = showToast;

  // Convert server flash messages into toasts & record in Notification Center
  const flashMessages = [];
  document.querySelectorAll("[data-flash-toast]").forEach((el) => {
    const type = el.dataset.flashToast || "info";
    const msg = el.dataset.flashMessage || "";
    if (msg) {
      showToast(type, msg);
      flashMessages.push({ id: Date.now() + Math.random(), type, text: msg, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), read: false });
    }
    el.remove();
  });

  // ─── Theme Toggle with Circular Void Transition ────────────────────────────
  const themeButtons = document.querySelectorAll("[data-theme-toggle]");
  const sunIcon = document.querySelector("[data-theme-icon='sun']");
  const moonIcon = document.querySelector("[data-theme-icon='moon']");

  const syncThemeIcons = (theme) => {
    if (!sunIcon || !moonIcon) return;
    sunIcon.style.display = theme === "dark" ? "block" : "none";
    moonIcon.style.display = theme === "dark" ? "none" : "block";
  };

  syncThemeIcons(root.getAttribute("data-theme") || "light");

  const toggleTheme = (e) => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    const applyTheme = () => {
      root.setAttribute("data-theme", next);
      localStorage.setItem("rekta-theme", next);
      syncThemeIcons(next);
    };

    if (prefersReducedMotion || !document.startViewTransition) {
      applyTheme();
      return;
    }

    const trigger = e?.currentTarget || document.querySelector("[data-theme-toggle]");
    const rect = trigger ? trigger.getBoundingClientRect() : { left: window.innerWidth - 40, top: 24, width: 24, height: 24 };
    const x = (e && e.clientX) || rect.left + rect.width / 2;
    const y = (e && e.clientY) || rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    root.classList.add("theme-transitioning");
    const transition = document.startViewTransition(() => applyTheme());

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 1150,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });

    transition.finished.finally(() => {
      root.classList.remove("theme-transitioning");
    });
  };

  themeButtons.forEach((btn) => btn.addEventListener("click", toggleTheme));

  // ─── Desktop Sidebar Collapse & Mobile Drawer ──────────────────────────────
  const sidebar = document.getElementById("appSidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuBtn = document.querySelector("[data-sidebar-toggle]");
  const collapseBtn = document.querySelector("[data-sidebar-collapse]");

  collapseBtn?.addEventListener("click", () => {
    const collapsed = root.classList.toggle("sidebar-collapsed");
    localStorage.setItem("rekta-sidebar-collapsed", collapsed ? "1" : "0");
  });

  const closeSidebar = () => {
    sidebar?.classList.remove("is-open");
    overlay?.classList.remove("is-open");
  };

  menuBtn?.addEventListener("click", () => {
    sidebar?.classList.toggle("is-open");
    overlay?.classList.toggle("is-open");
  });
  overlay?.addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".nav-group")?.classList.toggle("is-collapsed");
    });
  });

  // ─── Dropdowns (Notification Center, Profile, Row Menus) ───────────────────
  const closeAllDropdowns = (except = null) => {
    document.querySelectorAll(".dropdown.is-open").forEach((d) => {
      if (d !== except) d.classList.remove("is-open");
    });
  };

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-dropdown-toggle]");
    if (toggle) {
      const dd = toggle.closest(".dropdown");
      const wasOpen = dd.classList.contains("is-open");
      closeAllDropdowns(dd);
      dd.classList.toggle("is-open", !wasOpen);
      return;
    }
    if (!e.target.closest(".dropdown-menu")) {
      closeAllDropdowns();
    }
  });

  // ─── Notification Center ───────────────────────────────────────────────────
  const notifListEl = document.getElementById("notifList");
  const notifDot = document.getElementById("notifDot");
  const notifMarkReadBtn = document.getElementById("notifMarkRead");
  const notifClearBtn = document.getElementById("notifClear");

  const loadNotifs = () => {
    try {
      return JSON.parse(localStorage.getItem("rekta-notifs") || "[]");
    } catch {
      return [];
    }
  };
  const saveNotifs = (list) => localStorage.setItem("rekta-notifs", JSON.stringify(list.slice(0, 15)));

  let notifs = [...flashMessages, ...loadNotifs()];
  if (flashMessages.length) saveNotifs(notifs);

  const renderNotifs = () => {
    if (!notifListEl) return;
    const unreadCount = notifs.filter((n) => !n.read).length;
    if (notifDot) notifDot.style.display = unreadCount > 0 ? "block" : "none";

    if (!notifs.length) {
      notifListEl.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem 1rem;">
          <div class="empty-state-title">All caught up</div>
          <div class="empty-state-desc">No notifications at the moment.</div>
        </div>`;
      return;
    }

    notifListEl.innerHTML = notifs
      .map(
        (n) => `
      <div class="px-3 py-2 rounded-md text-xs flex items-start justify-between gap-2 ${n.read ? "opacity-65" : ""}"
           style="background: ${n.read ? "transparent" : "var(--accent-soft)"};">
        <div>
          <div class="font-medium" style="color: var(--text-primary);">${n.text}</div>
          <div class="mt-0.5" style="color: var(--text-secondary);">${n.time || ""}</div>
        </div>
        ${!n.read ? '<span class="w-2 h-2 rounded-full mt-1 flex-shrink-0" style="background: var(--accent);"></span>' : ""}
      </div>`
      )
      .join("");
  };

  renderNotifs();

  notifMarkReadBtn?.addEventListener("click", () => {
    notifs = notifs.map((n) => ({ ...n, read: true }));
    saveNotifs(notifs);
    renderNotifs();
  });

  notifClearBtn?.addEventListener("click", () => {
    notifs = [];
    saveNotifs(notifs);
    renderNotifs();
  });

  // ─── Command Palette (Ctrl + K) ────────────────────────────────────────────
  const cmdBackdrop = document.getElementById("cmdPalette");
  const cmdInput = document.getElementById("cmdInput");
  const cmdList = document.getElementById("cmdList");
  const cmdTriggers = document.querySelectorAll("[data-cmd-open]");

  const commands = [
    { label: "Go to Dashboard", group: "Navigation", url: "/dashboard" },
    { label: "Supplier List", group: "Suppliers", url: "/suppliers" },
    { label: "New Supplier", group: "Action", url: "/suppliers/new" },
    { label: "Product Sources", group: "Suppliers", url: "/product-sources" },
    { label: "New Product Source", group: "Action", url: "/product-sources/new" },
    { label: "Purchase Orders", group: "Purchasing", url: "/orders" },
    { label: "Create Purchase Order", group: "Action", url: "/orders/new" },
    { label: "Receiving / Receipts", group: "Receiving", url: "/receipts" },
    { label: "Product List", group: "Catalog", url: "/products" },
    { label: "New Product", group: "Action", url: "/products/new" },
    { label: "Reports & PDF Export", group: "Reports", url: "/reports" },
    { label: "Export Product Sources CSV", group: "Export", url: "/product-sources/export.csv" },
    { label: "Toggle Light / Dark Mode", group: "Theme", action: () => toggleTheme() },
  ];

  let cmdIndex = 0;
  let cmdFiltered = [...commands];

  const renderCommands = () => {
    if (!cmdList) return;
    const q = (cmdInput?.value || "").trim().toLowerCase();
    cmdFiltered = commands.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
    if (cmdIndex >= cmdFiltered.length) cmdIndex = Math.max(0, cmdFiltered.length - 1);

    if (!cmdFiltered.length) {
      cmdList.innerHTML = `<div class="empty-state" style="padding:1.5rem;"><div class="empty-state-title">No matching commands</div></div>`;
      return;
    }

    cmdList.innerHTML = cmdFiltered
      .map(
        (c, i) => `
      <div class="cmd-item ${i === cmdIndex ? "is-selected" : ""}" data-cmd-idx="${i}">
        <span>${c.label}</span>
      </div>`
      )
      .join("");

    cmdList.querySelectorAll("[data-cmd-idx]").forEach((el) => {
      el.addEventListener("click", () => runCommand(parseInt(el.dataset.cmdIdx, 10)));
    });
  };

  const runCommand = (idx) => {
    const item = cmdFiltered[idx];
    if (!item) return;
    closeCmd();
    if (item.action) item.action();
    else if (item.url) window.location.href = item.url;
  };

  const openCmd = () => {
    if (!cmdBackdrop) return;
    cmdBackdrop.classList.add("is-open");
    if (cmdInput) {
      cmdInput.value = "";
      cmdIndex = 0;
      renderCommands();
      setTimeout(() => cmdInput.focus(), 40);
    }
  };

  const closeCmd = () => cmdBackdrop?.classList.remove("is-open");

  cmdTriggers.forEach((btn) => btn.addEventListener("click", openCmd));
  cmdBackdrop?.addEventListener("click", (e) => {
    if (e.target === cmdBackdrop) closeCmd();
  });
  cmdInput?.addEventListener("input", () => {
    cmdIndex = 0;
    renderCommands();
  });
  cmdInput?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cmdIndex = Math.min(cmdFiltered.length - 1, cmdIndex + 1);
      renderCommands();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cmdIndex = Math.max(0, cmdIndex - 1);
      renderCommands();
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(cmdIndex);
    }
  });

  // ─── Custom Confirmation Modal ─────────────────────────────────────────────
  const modal = document.getElementById("confirmModal");
  const modalMsg = document.getElementById("confirmModalMessage");
  const modalOk = document.getElementById("confirmModalOk");
  const modalCancel = document.getElementById("confirmModalCancel");
  let pendingForm = null;

  const closeModal = () => {
    modal?.classList.remove("is-open");
    pendingForm = null;
  };

  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      if (form.dataset.confirmed === "true") return;
      e.preventDefault();
      if (!modal || !modalMsg) {
        if (window.confirm(form.dataset.confirm)) {
          form.dataset.confirmed = "true";
          form.submit();
        }
        return;
      }
      pendingForm = form;
      modalMsg.textContent = form.dataset.confirm;
      modal.classList.add("is-open");
      modalCancel?.focus();
    });
  });

  modalOk?.addEventListener("click", () => {
    if (pendingForm) {
      pendingForm.dataset.confirmed = "true";
      pendingForm.submit();
    }
    closeModal();
  });
  modalCancel?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (cmdBackdrop?.classList.contains("is-open")) closeCmd();
      else openCmd();
    } else if (e.key === "Escape") {
      closeCmd();
      closeModal();
      closeSidebar();
      closeAllDropdowns();
    }
  });

  // ─── Form Validation & Submit Loading Feedback ─────────────────────────────
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      let valid = true;
      form.querySelectorAll("[required]").forEach((el) => {
        if (!el.checkValidity()) {
          el.classList.add("is-invalid");
          valid = false;
        } else {
          el.classList.remove("is-invalid");
        }
      });
      if (!valid) {
        e.preventDefault();
        return;
      }
      if (form.dataset.confirm && form.dataset.confirmed !== "true") return;
      const submitBtn = form.querySelector('button[type="submit"]:not(.btn-danger)');
      if (submitBtn && !submitBtn.classList.contains("is-loading")) {
        submitBtn.classList.add("is-loading");
      }
    });

    form.querySelectorAll(".form-control").forEach((el) => {
      el.addEventListener("input", () => {
        if (el.checkValidity()) el.classList.remove("is-invalid");
      });
    });
  });

  // ─── Dashboard Date Badge & Animated Counters ──────────────────────────────
  const dateBadge = document.getElementById("currentDateBadge");
  if (dateBadge) {
    dateBadge.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  document.querySelectorAll("[data-counter]").forEach((el) => {
    const target = parseInt(el.dataset.counter || "0", 10);
    if (isNaN(target) || target <= 0 || prefersReducedMotion) {
      el.textContent = String(isNaN(target) ? 0 : target);
      return;
    }
    const duration = 340;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // ─── Real-Data Dashboard Analytics Chart ───────────────────────────────────
  const chartContainer = document.getElementById("platformOverviewChart");
  if (chartContainer) {
    let payload = { counts: [], orders: [], receipts: [] };
    try {
      payload = JSON.parse(chartContainer.dataset.analytics || "{}");
    } catch {
      payload = { counts: [], orders: [], receipts: [] };
    }

    const rangeButtons = document.querySelectorAll("[data-chart-range]");
    const chartLegend = document.getElementById("chartLegend");
    const chartTotals = document.getElementById("chartTotals");

    const bindTooltip = () => {
      const tooltip = document.getElementById("chartTooltip");
      const crosshair = document.getElementById("chartCrosshair");
      chartContainer.querySelectorAll("[data-tip]").forEach((el) => {
        el.addEventListener("mouseenter", () => {
          if (crosshair && el.dataset.cx) {
            crosshair.setAttribute("x1", el.dataset.cx);
            crosshair.setAttribute("x2", el.dataset.cx);
            crosshair.classList.add("is-visible");
          }
          if (!tooltip) return;
          tooltip.textContent = el.dataset.tip;
          const rect = chartContainer.getBoundingClientRect();
          const bRect = el.getBoundingClientRect();
          tooltip.style.left = `${Math.max(0, Math.min(rect.width - 130, bRect.left - rect.left + bRect.width / 2 - 48))}px`;
          tooltip.style.top = `${Math.max(0, bRect.top - rect.top - 34)}px`;
          tooltip.classList.add("is-visible");
        });
        el.addEventListener("mouseleave", () => {
          tooltip?.classList.remove("is-visible");
          crosshair?.classList.remove("is-visible");
        });
      });
    };

    const renderSummaryBars = () => {
      const items = payload.counts || [];
      if (!items.length) return;
      const totalRecords = items.reduce((s, d) => s + (d.value || 0), 0);
      if (chartTotals) chartTotals.textContent = `${totalRecords} total records`;

      const maxVal = Math.max(1, ...items.map((d) => d.value));
      const w = 560, h = 215, padL = 36, padR = 16, padT = 18, padB = 34;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const colW = plotW / items.length;
      const barW = Math.min(48, colW * 0.52);

      const defs = items
        .map(
          (d, i) => `
          <linearGradient id="barGrad${i}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${d.color}" stop-opacity="0.95" />
            <stop offset="100%" stop-color="${d.color}" stop-opacity="0.55" />
          </linearGradient>`
        )
        .join("");

      const grid = [0, 0.5, 1]
        .map((r) => {
          const y = padT + plotH * (1 - r);
          return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3 3" />
                  <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-secondary)">${Math.round(maxVal * r)}</text>`;
        })
        .join("");

      const bars = items
        .map((d, i) => {
          const bh = d.value > 0 ? Math.max(6, (d.value / maxVal) * plotH) : 3;
          const x = padL + i * colW + (colW - barW) / 2;
          const y = padT + plotH - bh;
          return `<g>
            <rect class="chart-bar" x="${x}" y="${y}" width="${barW}" height="${bh}" rx="5" fill="url(#barGrad${i})"
                  style="animation-delay:${i * 55}ms" data-tip="${d.label}: ${d.value}" />
            <text x="${x + barW / 2}" y="${h - 12}" text-anchor="middle" font-size="11" fill="var(--text-secondary)">${d.label}</text>
          </g>`;
        })
        .join("");

      if (chartLegend) {
        chartLegend.innerHTML = `<span class="text-xs" style="color: var(--text-secondary);">Live counts across suppliers, catalog, orders, and receiving</span>`;
      }

      chartContainer.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" role="img" aria-label="System record counts">
          <defs>${defs}</defs>
          ${grid}${bars}
        </svg>
        <div class="chart-tooltip" id="chartTooltip"></div>`;
      bindTooltip();
    };

    const renderTimeline = (days) => {
      const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const bucket = {};
      let orderSum = 0;
      let receiptSum = 0;

      (payload.orders || []).forEach((o) => {
        if (o.date >= cutoff) {
          bucket[o.date] = bucket[o.date] || { orders: 0, receipts: 0 };
          bucket[o.date].orders++;
          orderSum++;
        }
      });
      (payload.receipts || []).forEach((r) => {
        if (r.date >= cutoff) {
          bucket[r.date] = bucket[r.date] || { orders: 0, receipts: 0 };
          bucket[r.date].receipts++;
          receiptSum++;
        }
      });

      if (chartTotals) chartTotals.textContent = `Orders: ${orderSum} · Receipts: ${receiptSum}`;

      const dates = Object.keys(bucket).sort();
      if (dates.length < 2) {
        if (chartLegend) {
          chartLegend.innerHTML = `<span class="text-xs" style="color: var(--text-secondary);">Last ${days} days</span>`;
        }
        chartContainer.innerHTML = `
          <div class="empty-state" style="padding: 2.25rem 1rem;">
            <div class="empty-state-title">Not enough historical dates for a trend line</div>
            <div class="empty-state-desc">At least 2 distinct transaction dates in this range are required. Select "Summary" to view current record totals.</div>
          </div>`;
        return;
      }

      const w = 560, h = 215, padL = 36, padR = 16, padT = 18, padB = 34;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const maxVal = Math.max(1, ...dates.map((d) => Math.max(bucket[d].orders, bucket[d].receipts)));

      const grid = [0, 0.5, 1]
        .map((r) => {
          const y = padT + plotH * (1 - r);
          return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="3 3" />
                  <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-secondary)">${Math.round(maxVal * r)}</text>`;
        })
        .join("");

      const pts = (key) =>
        dates.map((d, i) => ({
          x: padL + (i / (dates.length - 1)) * plotW,
          y: padT + plotH - (bucket[d][key] / maxVal) * plotH,
          val: bucket[d][key],
          date: d,
        }));

      const orderPts = pts("orders");
      const receiptPts = pts("receipts");
      const linePath = (arr) => arr.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      const areaPath = (arr) => `${linePath(arr)} L${arr[arr.length - 1].x.toFixed(1)},${padT + plotH} L${arr[0].x.toFixed(1)},${padT + plotH} Z`;

      const dots = (arr, color, label) =>
        arr
          .map(
            (p, idx) =>
              `<circle class="chart-dot" cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="var(--bg-surface)" stroke-width="1.75"
                       style="animation-delay:${idx * 60}ms" data-cx="${p.x}" data-tip="${p.date} · ${label}: ${p.val}" />`
          )
          .join("");

      const xLabels = dates
        .filter((_, i) => i === 0 || i === dates.length - 1 || i === Math.floor(dates.length / 2))
        .map((d) => {
          const idx = dates.indexOf(d);
          const x = padL + (idx / (dates.length - 1)) * plotW;
          return `<text x="${x}" y="${h - 12}" text-anchor="middle" font-size="10" fill="var(--text-secondary)">${d.slice(5)}</text>`;
        })
        .join("");

      if (chartLegend) {
        chartLegend.innerHTML = `
          <span class="inline-flex items-center gap-1.5 text-xs"><span class="w-2.5 h-2.5 rounded-full" style="background:#0D9488;"></span> Orders</span>
          <span class="inline-flex items-center gap-1.5 text-xs"><span class="w-2.5 h-2.5 rounded-full" style="background:#0284C7;"></span> Receipts</span>`;
      }

      chartContainer.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" role="img" aria-label="Orders and receipts activity">
          <defs>
            <linearGradient id="tealAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0D9488" stop-opacity="0.28" />
              <stop offset="100%" stop-color="#0D9488" stop-opacity="0.01" />
            </linearGradient>
            <linearGradient id="blueAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0284C7" stop-opacity="0.20" />
              <stop offset="100%" stop-color="#0284C7" stop-opacity="0.01" />
            </linearGradient>
          </defs>
          ${grid}
          <line id="chartCrosshair" class="chart-crosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" />
          <path d="${areaPath(orderPts)}" fill="url(#tealAreaGrad)" class="chart-area-anim" />
          <path d="${areaPath(receiptPts)}" fill="url(#blueAreaGrad)" class="chart-area-anim" />
          <path d="${linePath(orderPts)}" fill="none" stroke="#0D9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chart-line-anim" />
          <path d="${linePath(receiptPts)}" fill="none" stroke="#0284C7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chart-line-anim" />
          ${dots(orderPts, "#0D9488", "Orders")}
          ${dots(receiptPts, "#0284C7", "Receipts")}
          ${xLabels}
        </svg>
        <div class="chart-tooltip" id="chartTooltip"></div>`;
      bindTooltip();
    };

    rangeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        rangeButtons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const range = btn.dataset.chartRange;
        if (range === "summary") renderSummaryBars();
        else renderTimeline(parseInt(range, 10));
      });
    });

    renderSummaryBars();
  }

  // ─── Interactive Purchase Order Status Donut Chart ─────────────────────────
  const donutEl = document.getElementById("poStatusDonut");
  if (donutEl) {
    let payload = { statusCounts: {} };
    try {
      payload = JSON.parse(donutEl.dataset.analytics || "{}");
    } catch {
      payload = { statusCounts: {} };
    }

    const statusMeta = [
      { key: "PENDING", label: "Pending", color: "#D97706" },
      { key: "APPROVED", label: "Approved", color: "#0D9488" },
      { key: "PLACED", label: "Placed", color: "#0284C7" },
      { key: "PARTIALLY_RECEIVED", label: "Partial", color: "#6366F1" },
      { key: "RECEIVED", label: "Completed", color: "#059669" },
      { key: "CANCELLED", label: "Cancelled", color: "#DC2626" },
    ];

    const entries = statusMeta
      .map((m) => ({ ...m, count: (payload.statusCounts || {})[m.key] || 0 }))
      .filter((m) => m.count > 0);

    const total = entries.reduce((s, e) => s + e.count, 0);

    if (!total) {
      donutEl.innerHTML = `
        <div class="empty-state" style="padding: 1.75rem 1rem;">
          <div class="empty-state-title">No purchase orders yet</div>
          <div class="empty-state-desc">Order status distribution will appear once purchase orders are created.</div>
        </div>`;
    } else {
      const size = 160;
      const r = 56;
      const cx = size / 2;
      const cy = size / 2;
      const circ = 2 * Math.PI * r;
      let offset = 0;

      const circles = entries
        .map((e, i) => {
          const pct = (e.count / total) * 100;
          const len = (e.count / total) * circ;
          const dashOffset = circ - len;
          const rot = (offset / circ) * 360 - 90;
          offset += len;
          return `<circle class="donut-segment" cx="${cx}" cy="${cy}" r="${r}" fill="transparent"
                          stroke="${e.color}" stroke-width="18"
                          stroke-dasharray="${circ}" stroke-dashoffset="${prefersReducedMotion ? dashOffset : circ}"
                          data-target-offset="${dashOffset}" data-idx="${i}"
                          data-tip="${e.label}: ${e.count} (${pct.toFixed(0)}%)"
                          transform="rotate(${rot} ${cx} ${cy})" />`;
        })
        .join("");

      const legend = entries
        .map((e, i) => {
          const pct = ((e.count / total) * 100).toFixed(0);
          return `
            <div class="donut-legend-item text-xs" data-donut-legend="${i}">
              <span class="inline-flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${e.color};"></span>
                <span style="color: var(--text-primary);">${e.label}</span>
              </span>
              <span class="font-medium tabular-nums" style="color: var(--text-secondary);">${e.count} <span class="opacity-70">(${pct}%)</span></span>
            </div>`;
        })
        .join("");

      donutEl.innerHTML = `
        <div class="flex flex-col items-center gap-3 relative">
          <div class="relative inline-flex items-center justify-center">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Order status distribution">
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="var(--bg-surface-muted)" stroke-width="18" />
              ${circles}
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span class="text-2xl font-bold leading-none" style="color: var(--text-primary);">${total}</span>
              <span class="text-[11px] mt-1" style="color: var(--text-secondary);">Total POs</span>
            </div>
          </div>
          <div class="w-full flex flex-col gap-0.5">${legend}</div>
          <div class="chart-tooltip" id="donutTooltip"></div>
        </div>`;

      requestAnimationFrame(() => {
        donutEl.querySelectorAll(".donut-segment").forEach((seg) => {
          seg.style.strokeDashoffset = seg.dataset.targetOffset;
        });
      });

      const dTooltip = document.getElementById("donutTooltip");
      const segs = donutEl.querySelectorAll(".donut-segment");
      const legs = donutEl.querySelectorAll("[data-donut-legend]");

      const highlight = (idx, showTip, targetEl) => {
        segs.forEach((s) => {
          const match = s.dataset.idx === String(idx);
          s.style.opacity = idx === null || match ? "1" : "0.35";
          s.setAttribute("stroke-width", match ? "21" : "18");
        });
        legs.forEach((l) => l.classList.toggle("is-active", l.dataset.donutLegend === String(idx)));

        if (dTooltip) {
          if (showTip && targetEl) {
            const seg = donutEl.querySelector(`.donut-segment[data-idx="${idx}"]`);
            dTooltip.textContent = seg?.dataset.tip || "";
            dTooltip.style.left = "50%";
            dTooltip.style.top = "-6px";
            dTooltip.style.transform = "translate(-50%, 0)";
            dTooltip.classList.add("is-visible");
          } else {
            dTooltip.classList.remove("is-visible");
          }
        }
      };

      segs.forEach((s) => {
        s.addEventListener("mouseenter", () => highlight(s.dataset.idx, true, s));
        s.addEventListener("mouseleave", () => highlight(null, false));
      });
      legs.forEach((l) => {
        l.addEventListener("mouseenter", () => highlight(l.dataset.donutLegend, true, l));
        l.addEventListener("mouseleave", () => highlight(null, false));
      });
    }
  }

  // ─── Reusable Table Search, Filter, Sort & Pagination ──────────────────────
  document.querySelectorAll("table[data-table]").forEach((table) => {
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    let allRows = Array.from(tbody.querySelectorAll("tr[data-row]"));
    if (!allRows.length) return;

    const card = table.closest(".card") || table.parentElement;
    const searchInput = card.querySelector("[data-table-search]");
    const filterSelect = card.querySelector("[data-table-filter]");
    const paginationBar = card.querySelector("[data-table-pagination]");
    const pageSize = parseInt(table.dataset.pageSize || "10", 10);
    let currentPage = 1;

    table.querySelectorAll("thead th[data-sort]").forEach((th, colIdx) => {
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      indicator.textContent = "↕";
      th.appendChild(indicator);

      th.addEventListener("click", () => {
        const dir = th.dataset.sortDir === "asc" ? "desc" : "asc";
        table.querySelectorAll("thead th[data-sort]").forEach((h) => {
          delete h.dataset.sortDir;
          const ind = h.querySelector(".sort-indicator");
          if (ind) ind.textContent = "↕";
        });
        th.dataset.sortDir = dir;
        indicator.textContent = dir === "asc" ? "↑" : "↓";

        const cellIdx = Array.from(th.parentElement.children).indexOf(th);
        allRows.sort((a, b) => {
          const av = (a.children[cellIdx]?.textContent || "").trim();
          const bv = (b.children[cellIdx]?.textContent || "").trim();
          const an = parseFloat(av.replace(/[^0-9.-]/g, ""));
          const bn = parseFloat(bv.replace(/[^0-9.-]/g, ""));
          let cmp = 0;
          if (!isNaN(an) && !isNaN(bn) && /^[\d₱.,\s-]+$/.test(av) && /^[\d₱.,\s-]+$/.test(bv)) {
            cmp = an - bn;
          } else {
            cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
          }
          return dir === "asc" ? cmp : -cmp;
        });
        allRows.forEach((r) => tbody.appendChild(r));
        currentPage = 1;
        render();
      });
    });

    const render = () => {
      const q = (searchInput?.value || "").trim().toLowerCase();
      const filterVal = filterSelect?.value || "";

      const filtered = allRows.filter((row) => {
        const textMatch = !q || row.textContent.toLowerCase().includes(q);
        const filterMatch = !filterVal || (row.dataset.filter || "") === filterVal;
        return textMatch && filterMatch;
      });

      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;

      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;

      allRows.forEach((r) => (r.style.display = "none"));
      filtered.slice(start, end).forEach((r) => (r.style.display = ""));

      let emptyFilterRow = tbody.querySelector("tr[data-empty-filter]");
      if (filtered.length === 0) {
        if (!emptyFilterRow) {
          const cols = table.querySelectorAll("thead th").length || 1;
          emptyFilterRow = document.createElement("tr");
          emptyFilterRow.dataset.emptyFilter = "true";
          emptyFilterRow.innerHTML = `<td colspan="${cols}"><div class="empty-state"><div class="empty-state-title">No matching records</div><div class="empty-state-desc">Try adjusting your search or filter criteria.</div></div></td>`;
          tbody.appendChild(emptyFilterRow);
        }
        emptyFilterRow.style.display = "";
      } else if (emptyFilterRow) {
        emptyFilterRow.style.display = "none";
      }

      if (paginationBar) {
        const showingStart = filtered.length ? start + 1 : 0;
        const showingEnd = Math.min(end, filtered.length);
        paginationBar.innerHTML = `
          <span>Showing ${showingStart}–${showingEnd} of ${filtered.length}</span>
          <div class="pagination-controls">
            <button type="button" class="page-btn" data-page="prev" ${currentPage <= 1 ? "disabled" : ""}>Prev</button>
            ${Array.from({ length: totalPages }, (_, i) => i + 1)
              .map((p) => `<button type="button" class="page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`)
              .join("")}
            <button type="button" class="page-btn" data-page="next" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
          </div>`;

        paginationBar.querySelectorAll("[data-page]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const target = btn.dataset.page;
            if (target === "prev" && currentPage > 1) currentPage--;
            else if (target === "next" && currentPage < totalPages) currentPage++;
            else if (!isNaN(parseInt(target, 10))) currentPage = parseInt(target, 10);
            render();
          });
        });
      }
    };

    searchInput?.addEventListener("input", () => {
      currentPage = 1;
      render();
    });
    filterSelect?.addEventListener("change", () => {
      currentPage = 1;
      render();
    });

    render();
  });

  // ─── Monthly Report Chart (/reports) ──────────────────────────────────────
  const repChartEl = document.getElementById("reportMonthlyChart");
  if (repChartEl) {
    let payload = {};
    try { payload = JSON.parse(repChartEl.dataset.reportChart || "{}"); } catch {}
    const series = Array.isArray(payload.series) ? payload.series : [];
    if (!series.length) {
      repChartEl.innerHTML = `<div class="chart-empty" style="padding: 1.5rem 1rem;"><div class="chart-empty-title">No ${payload.type || "activity"} recorded for ${payload.monthLabel || "this period"}</div><div class="chart-empty-desc">Use the month selector above to review past months or create new transactions.</div></div>`;
    } else {
      const w = 680, h = 185, padL = 40, padR = 16, padT = 16, padB = 28;
      const plotW = w - padL - padR, plotH = h - padT - padB;
      const metricKey = payload.type === "receipts" ? "accepted" : "count";
      const maxVal = Math.max(...series.map((d) => d[metricKey] || 0), 1);
      const step = plotW / series.length;
      const barW = Math.min(34, Math.max(10, step * 0.56));
      const gridLines = [0, 0.5, 1].map((t) => {
        const y = padT + plotH * (1 - t);
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="chart-grid-line"/><text x="${padL - 8}" y="${y + 3}" text-anchor="end" class="chart-axis-label">${Math.round(maxVal * t)}</text>`;
      }).join("");
      const bars = series.map((d, i) => {
        const val = d[metricKey] || 0;
        const barH = Math.max(4, (val / maxVal) * plotH);
        const x = padL + i * step + (step - barW) / 2;
        const y = padT + plotH - barH;
        const label = d.date.slice(5);
        const tip = payload.type === "receipts"
          ? `${d.date}: ${d.accepted} accepted, ${d.rejected} rejected`
          : `${d.date}: ${d.count} PO(s) · ₱${Number(d.value || 0).toFixed(2)}`;
        return `<g><rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="#0D9488" class="chart-bar-anim" style="animation-delay:${i * 40}ms"><title>${tip}</title></rect><text x="${x + barW / 2}" y="${h - 8}" text-anchor="middle" class="chart-axis-label">${label}</text></g>`;
      }).join("");
      repChartEl.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="w-full" style="max-height:190px;">${gridLines}${bars}</svg>`;
    }
  }
})();
