/* Isolated-world content script: comment search for YouTube watch pages.
   A magnifier icon in the comments header expands into a search field.
   Typing fetches ALL comments via the MAIN-world fetcher once, then filters
   instantly and renders matching comments in a results box under the header. */
(() => {
  const WIDGET_ID = "ycs-widget";
  const RESULTS_ID = "ycs-results";
  const STYLE_ID = "ycs-style";
  const MARK = "ycs-mark";
  const MAX_RESULTS = 300;

  const SEARCH_SVG =
    '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
  const THUMB_UP_SVG =
    '<svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';

  /* Theme comes from CSS custom properties set on the widget root — they
     inherit into shadow roots, unlike stylesheet selectors. */
  const WIDGET_CSS = `
#${WIDGET_ID}{display:inline-flex;align-items:center;height:36px;margin-left:12px;border-radius:18px;border:1px solid transparent;overflow:hidden;font-family:Roboto,Arial,sans-serif;vertical-align:middle}
#${WIDGET_ID}.ycs-open{background:var(--ycs-chip);border-color:var(--ycs-border)}
#${WIDGET_ID} .ycs-toggle-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0;border:none;border-radius:50%;background:var(--ycs-chip);cursor:pointer;padding:0;color:var(--ycs-fg)}
#${WIDGET_ID} .ycs-toggle-btn:hover{background:var(--ycs-chip-hov)}
#${WIDGET_ID} .ycs-toggle-btn svg{width:20px;height:20px;fill:currentColor}
#${WIDGET_ID} input{width:0;opacity:0;border:none;background:transparent;outline:none;color:var(--ycs-fg);font-size:14px;padding:0;transition:width .18s ease,opacity .15s ease,padding .18s ease}
#${WIDGET_ID}.ycs-open input{width:200px;opacity:1;padding:0 6px}
#${WIDGET_ID} input::placeholder{color:var(--ycs-sub)}
#${WIDGET_ID} .ycs-count{display:none;font-size:12px;color:var(--ycs-sub);white-space:nowrap}
#${WIDGET_ID}.ycs-open .ycs-count{display:inline}
#${WIDGET_ID} .ycs-close{display:none;width:28px;height:28px;align-items:center;justify-content:center;border:none;border-radius:50%;background:transparent;color:var(--ycs-sub);font-size:17px;cursor:pointer;flex-shrink:0}
#${WIDGET_ID}.ycs-open .ycs-close{display:inline-flex}
#${WIDGET_ID} .ycs-close:hover{color:var(--ycs-fg)}

#${RESULTS_ID}{font-family:Roboto,Arial,sans-serif;font-size:14px;color:var(--ycs-fg,#0f0f0f);max-height:480px;overflow-y:auto;margin:8px 0 16px}
#${RESULTS_ID} .ycs-status{padding:12px 0;color:var(--ycs-sub,#606060);font-size:13px}
#${RESULTS_ID} .ycs-comment{display:flex;gap:12px;padding:10px 0;border-top:1px solid var(--ycs-border,rgba(0,0,0,.1))}
#${RESULTS_ID} .ycs-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:var(--ycs-chip,rgba(0,0,0,.06))}
#${RESULTS_ID} .ycs-meta{display:flex;align-items:center;gap:8px;font-size:13px}
#${RESULTS_ID} .ycs-author{font-weight:500;color:var(--ycs-fg,#0f0f0f);text-decoration:none}
#${RESULTS_ID} .ycs-time{color:var(--ycs-sub,#606060);font-size:12px}
#${RESULTS_ID} .ycs-reply{font-size:11px;padding:2px 6px;border-radius:8px;background:var(--ycs-chip,rgba(0,0,0,.06));color:var(--ycs-sub,#606060)}
#${RESULTS_ID} .ycs-text{margin-top:4px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
#${RESULTS_ID} .ycs-actions{display:flex;align-items:center;gap:6px;margin-top:6px;color:var(--ycs-sub,#606060)}
#${RESULTS_ID} .ycs-actions svg{width:15px;height:15px;fill:currentColor}
#${RESULTS_ID} .ycs-actions .ycs-like-count{font-size:12px}
#${RESULTS_ID} mark.${MARK}{background:rgba(250,204,21,.6);color:inherit;border-radius:2px;padding:0 1px}`;

  let state = freshState();
  let pageObserver = null;
  let hideObserver = null;
  let themeObserver = null;
  let inputTimer = null;
  let widgetEl = null;
  let resultsEl = null;

  function freshState() {
    return {
      videoId: null,
      query: "",
      comments: null,
      loading: false,
      requestId: 0,
      open: false,
    };
  }

  const vid = () => new URL(location.href).searchParams.get("v");
  const isWatch = () => location.pathname === "/watch" && !!vid();
  const isDark = () => document.documentElement.hasAttribute("dark");

  function h(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  /* ------------- shadow-DOM-aware helpers ------------- */

  function deepAll(root, sel) {
    const out = [...root.querySelectorAll(sel)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) out.push(...deepAll(el.shadowRoot, sel));
    }
    return out;
  }

  function ensureStyles(root) {
    const target = root === document ? document.head : root;
    if (target.querySelector?.("#" + STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = WIDGET_CSS;
    target.appendChild(st);
  }

  /* Explicit colors per YouTube's own theme attribute — bulletproof against
     unresolved --yt-spec-* vars inside shadow roots. */
  function themeVars() {
    return isDark()
      ? {
          "--ycs-fg": "#f1f1f1",
          "--ycs-sub": "#aaaaaa",
          "--ycs-chip": "rgba(255,255,255,0.1)",
          "--ycs-chip-hov": "rgba(255,255,255,0.2)",
          "--ycs-border": "rgba(255,255,255,0.12)",
        }
      : {
          "--ycs-fg": "#0f0f0f",
          "--ycs-sub": "#606060",
          "--ycs-chip": "rgba(0,0,0,0.05)",
          "--ycs-chip-hov": "rgba(0,0,0,0.12)",
          "--ycs-border": "rgba(0,0,0,0.12)",
        };
  }

  function applyTheme(el) {
    if (!el) return;
    for (const [k, v] of Object.entries(themeVars())) el.style.setProperty(k, v);
  }

  function applyThemeAll() {
    applyTheme(widgetEl);
    applyTheme(resultsEl);
  }

  /* ---------------- UI ---------------- */

  function buildWidget() {
    const w = h("div");
    w.id = WIDGET_ID;

    const toggle = h("button", "ycs-toggle-btn");
    toggle.title = "Search comments";
    toggle.setAttribute("aria-label", "Search comments");
    toggle.innerHTML = SEARCH_SVG;

    const input = h("input");
    input.id = "ycs-input";
    input.type = "text";
    input.placeholder = "Search comments…";

    const count = h("span", "ycs-count");

    const close = h("button", "ycs-close", "×");
    close.title = "Close";

    toggle.addEventListener("click", () =>
      w.classList.contains("ycs-open") ? collapseWidget() : openWidget()
    );
    input.addEventListener("input", () => {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => setQuery(input.value.trim()), 200);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeWidget();
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    close.addEventListener("click", closeWidget);

    w.append(toggle, input, count, close);
    applyTheme(w);
    return w;
  }

  function headerEl() {
    return (
      document.querySelector("ytd-comments-header-renderer") ||
      deepAll(document, "ytd-comments-header-renderer")[0]
    );
  }

  function mountWidget() {
    if (!isWatch() || (widgetEl && widgetEl.isConnected)) return;
    const header = headerEl();
    if (!header) return;
    // Header internals may live in a shadow root — look inside it too.
    const host =
      header.querySelector("#title") ||
      deepAll(header, "#title")[0] ||
      deepAll(header, "#header")[0];
    if (!host) return;
    ensureStyles(host.getRootNode());
    widgetEl = buildWidget();
    host.appendChild(widgetEl);
  }

  function openWidget() {
    if (!widgetEl) return;
    state.open = true;
    widgetEl.classList.add("ycs-open");
    ensureResultsBox();
    setTimeout(() => widgetEl.querySelector("#ycs-input")?.focus(), 100);
  }

  /* Collapse the input back into the magnifier without clearing the search. */
  function collapseWidget() {
    state.open = false;
    widgetEl?.classList.remove("ycs-open");
  }

  /* Fully clears the query, restores the original comments, collapses. */
  function closeWidget() {
    state.open = false;
    state.query = "";
    const input = widgetEl?.querySelector("#ycs-input");
    if (input) input.value = "";
    setOriginalCommentsHidden(false);
    renderResults();
    resultsEl?.remove();
    resultsEl = null;
    widgetEl?.classList.remove("ycs-open");
  }

  /* Results box sits right under the comments header, above the comment list. */
  function ensureResultsBox() {
    if (resultsEl && resultsEl.isConnected) return;
    const header = headerEl();
    if (!header) return;
    resultsEl = h("div");
    resultsEl.id = RESULTS_ID;
    applyTheme(resultsEl);
    ensureStyles(header.getRootNode());
    header.after ? header.after(resultsEl) : header.parentElement.insertBefore(resultsEl, header.nextSibling);
  }

  /* Hide YouTube's own comment list while a filter is active so the page
     doesn't show two comment sections at once. Only the thread renderers and
     the continuation spinner are hidden — the header (which hosts our widget)
     and other elements stay visible. */
  function setOriginalCommentsHidden(hide) {
    const root =
      document.querySelector("ytd-comments") ||
      deepAll(document, "ytd-comments")[0];
    if (!root) return;
    for (const s of deepAll(
      root,
      "ytd-comment-thread-renderer, ytd-continuation-item-renderer"
    )) {
      s.style.display = hide ? "none" : "";
    }
    // Keep hiding newly lazy-loaded threads while a query is active. Only
    // style attributes are touched, so this can't loop on itself.
    if (hide && !hideObserver) {
      hideObserver = new MutationObserver(
        debounce(() => {
          if (state.query) setOriginalCommentsHidden(true);
        }, 200)
      );
      hideObserver.observe(root, { childList: true, subtree: true });
    } else if (!hide && hideObserver) {
      hideObserver.disconnect();
      hideObserver = null;
    }
  }

  function setStatus(msg) {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    if (msg) resultsEl.appendChild(h("div", "ycs-status", msg));
  }

  function updateCount(n) {
    const el = widgetEl?.querySelector(".ycs-count");
    if (el) el.textContent = n != null ? `${n}` : "";
  }

  /* ---------------- Search (v1-style: filter fetched comments) ---------------- */

  /* Accent-insensitive fold: "história" -> "historia", "ç" -> "c", etc. */
  const fold = (s) => s.normalize("NFD").toLowerCase().replace(/\p{M}/gu, "");

  function matches(q) {
    const lq = fold(q);
    return state.comments.filter(
      (c) => fold(c.text).includes(lq) || fold(c.author).includes(lq)
    );
  }

  /* Folded matching needs index mapping back to the original string:
     "história" folds to "historia", shifting every offset after the ó. */
  function highlightInto(container, str, q) {
    const lq = fold(q);
    if (!lq) {
      container.append(str);
      return;
    }
    const folded = [];
    const starts = [];
    const ends = [];
    let oi = 0;
    for (const ch of str) {
      for (const m of fold(ch)) {
        folded.push(m);
        starts.push(oi);
        ends.push(oi + ch.length);
      }
      oi += ch.length;
    }
    const fs = folded.join("");
    let i = 0;
    let last = 0;
    let j;
    while ((j = fs.indexOf(lq, i)) !== -1) {
      const oStart = starts[j];
      let oEnd = ends[j + lq.length - 1];
      // swallow trailing combining marks so accents render correctly
      while (oEnd < str.length && /\p{M}/u.test(str[oEnd])) oEnd++;
      container.append(str.slice(last, oStart));
      container.appendChild(h("mark", MARK, str.slice(oStart, oEnd)));
      last = oEnd;
      i = j + lq.length;
    }
    container.append(str.slice(last));
  }

  function commentCard(c, q) {
    const card = h("div", "ycs-comment");

    const img = h("img", "ycs-avatar");
    img.src = c.avatar || "";
    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    img.alt = "";

    const body = h("div");
    body.style.flex = "1";

    const meta = h("div", "ycs-meta");
    const author = h(c.channelId ? "a" : "span", "ycs-author", c.author);
    if (c.channelId) {
      author.href = `/channel/${c.channelId}`;
      author.target = "_blank";
      author.rel = "noopener";
    }
    meta.append(author, h("span", "ycs-time", c.published || ""));
    if (c.isReply) meta.appendChild(h("span", "ycs-reply", "reply"));

    const txt = h("div", "ycs-text");
    highlightInto(txt, c.text, q);

    const foot = h("div", "ycs-actions");
    if (c.likes) {
      const like = document.createElement("span");
      like.innerHTML = THUMB_UP_SVG;
      foot.append(like, h("span", "ycs-like-count", c.likes));
    }

    body.append(meta, txt, foot);
    card.append(img, body);
    return card;
  }

  function renderResults() {
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    const q = state.query;
    setOriginalCommentsHidden(!!q);

    if (!q) {
      updateCount(null);
      setStatus("");
      return;
    }
    if (state.loading) {
      setStatus("Loading comments… this can take a while on videos with many comments.");
      updateCount(null);
      return;
    }
    if (!state.comments) return; // not started yet
    if (!state.comments.length) {
      setStatus("No comments found — comments may be disabled on this video.");
      updateCount(0);
      return;
    }

    const list = matches(q);
    updateCount(list.length);
    if (!list.length) {
      setStatus(`No results for "${q}" in ${state.comments.length.toLocaleString()} comments.`);
      return;
    }
    setStatus(`${list.length.toLocaleString()} result${list.length === 1 ? "" : "s"}`);
    for (const c of list.slice(0, MAX_RESULTS)) resultsEl.appendChild(commentCard(c, q));
    if (list.length > MAX_RESULTS) {
      resultsEl.appendChild(h("div", "ycs-status", `Showing first ${MAX_RESULTS} results.`));
    }
  }

  function setQuery(q) {
    state.query = q;
    if (!q) {
      renderResults();
      return;
    }
    if (!state.comments && !state.loading) loadComments();
    renderResults();
  }

  function loadComments() {
    state.requestId++;
    state.loading = true;
    window.postMessage(
      {
        source: "ycs-req",
        type: "fetch",
        requestId: state.requestId,
        videoId: vid(),
        continuation: null,
      },
      "*"
    );
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.source !== "ycs-res") return;
    const d = e.data;
    if (d.requestId !== state.requestId) return;
    if (d.type === "done") {
      state.loading = false;
      state.comments = d.comments;
      renderResults();
    } else if (d.type === "error") {
      state.loading = false;
      setStatus("Failed to load comments: " + d.error);
    }
  });

  /* ---------------- Lifecycle (YouTube is a SPA) ---------------- */

  function ensurePageObserver() {
    if (pageObserver) return;
    pageObserver = new MutationObserver(debounce(mountWidget, 300));
    pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function ensureThemeObserver() {
    if (themeObserver) return;
    themeObserver = new MutationObserver(applyThemeAll);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["dark"],
    });
  }

  function teardown() {
    setOriginalCommentsHidden(false);
    widgetEl?.remove();
    widgetEl = null;
    resultsEl?.remove();
    resultsEl = null;
    hideObserver?.disconnect();
    hideObserver = null;
    pageObserver?.disconnect();
    pageObserver = null;
    themeObserver?.disconnect();
    themeObserver = null;
  }

  function onNav() {
    if (!isWatch()) {
      teardown();
      return;
    }
    const v = vid();
    if (v !== state.videoId) {
      const nextId = state.requestId + 1; // ignore stale in-flight responses
      teardown();
      state = freshState();
      state.videoId = v;
      state.requestId = nextId;
    }
    mountWidget();
    ensurePageObserver();
    ensureThemeObserver();
    // Preload all comments in the background so the first search is instant.
    if (state.comments === null && !state.loading) loadComments();
  }

  /* Clicking anywhere outside the widget/results collapses the input but
     keeps the current search applied. composedPath() crosses shadow roots. */
  document.addEventListener(
    "click",
    (e) => {
      if (!widgetEl?.classList.contains("ycs-open")) return;
      const path = e.composedPath();
      if (!path.includes(widgetEl) && !path.includes(resultsEl)) collapseWidget();
    },
    true
  );

  document.addEventListener("yt-navigate-finish", onNav);
  document.addEventListener("yt-page-data-updated", onNav);
  ensureStyles(document);
  onNav();
})();
