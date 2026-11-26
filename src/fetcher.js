/* Runs in the page's MAIN world so requests to youtubei carry the user's
   session cookies and are not blocked by CORS. Communicates with the
   isolated-world content script via window.postMessage. */
(() => {
  if (window.__ycsFetcher) return;
  window.__ycsFetcher = true;

  const cfg = () => (window.ytcfg && window.ytcfg.data_) || {};

  function clientContext() {
    const c = cfg();
    // Prefer the full context YouTube itself configured for this page.
    return c.INNERTUBE_CONTEXT || {
      client: {
        clientName: "WEB",
        clientVersion: c.INNERTUBE_CLIENT_VERSION || "2.20240501.00.00",
        hl: c.HL || "en",
        gl: c.GL || "US",
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      },
      user: { lockedSafetyMode: false },
      request: { useSsl: true },
    };
  }

  async function next(body) {
    const c = cfg();
    const res = await fetch(
      `/youtubei/v1/next?key=${encodeURIComponent(c.INNERTUBE_API_KEY || "")}&prettyPrint=false`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": c.INNERTUBE_CLIENT_VERSION || "",
          ...(c.VISITOR_DATA ? { "X-Goog-Visitor-Id": c.VISITOR_DATA } : {}),
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error(`YouTube API returned HTTP ${res.status}`);
    return res.json();
  }

  /* The comments-section continuation token can be generated deterministically
     from the video id (same technique yt-dlp uses). This avoids depending on
     the lazy-loaded comments section being present in the `next` response. */
  function generatedCommentToken(videoId) {
    const enc = new TextEncoder();
    const bytes = [
      0x12, 0x0d, 0x12, 0x0b, ...enc.encode(videoId), 0x18, 0x06,
      0x32, 0x27, 0x22, 0x11, 0x22, 0x0b, ...enc.encode(videoId),
      0x30, 0x00, 0x78, 0x02, 0x30, 0x00, 0x42, 0x10,
      ...enc.encode("comments-section"),
    ];
    return btoa(String.fromCharCode(...bytes));
  }

  function* walk(node) {
    if (!node || typeof node !== "object") return;
    yield node;
    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      yield* walk(v);
    }
  }

  function find(node, pred) {
    for (const n of walk(node)) if (pred(n)) return n;
    return null;
  }

  const text = (r) => {
    if (!r) return "";
    if (r.simpleText != null) return r.simpleText;
    return (r.runs || []).map((x) => x.text || "").join("");
  };

  const digits = (s) => {
    const m = (s || "").replace(/[^\d]/g, "");
    return m ? Number(m) : null;
  };

  /* Old format: commentRenderer */
  function parseComment(cr, isReply) {
    return {
      id: cr.commentId || "",
      author: text(cr.authorText),
      channelId: cr.authorEndpoint?.browseEndpoint?.browseId || "",
      avatar: (cr.authorThumbnail?.thumbnails || []).slice(-1)[0]?.url || "",
      text: text(cr.contentText),
      published: text(cr.publishedTimeText),
      // keep the locale-formatted string ("2,2 mil" / "2.2K") as YouTube shows it
      likes: text(cr.voteCount) || text(cr.likeCount) || "",
      isReply: !!isReply,
    };
  }

  /* New format: commentEntityPayload referenced via commentViewModel keys */
  function parseEntityComment(payloads, isReply) {
    const cp = payloads.map((p) => p.commentEntityPayload).find(Boolean);
    const id = cp?.properties?.commentId;
    if (!id) return null;
    return {
      id,
      author: cp.author?.displayName || "",
      channelId: cp.author?.channelId || "",
      avatar: cp.author?.avatarThumbnailUrl || "",
      text: cp.properties?.content?.content || "",
      published: cp.properties?.publishedTime || "",
      likes: String(
        cp.toolbar?.likeCountA11y ?? cp.toolbar?.likeCountText ?? ""
      ),
      isReply: !!isReply,
    };
  }

  function entityMap(resp) {
    const map = new Map();
    for (const m of resp?.frameworkUpdates?.entityBatchUpdate?.mutations || []) {
      if (m.entityKey && m.payload) map.set(m.entityKey, m.payload);
    }
    return map;
  }

  const entityPayloads = (entities, keys) =>
    (keys || []).map((k) => entities.get(k)).filter(Boolean);

  /* Extract the comment out of a commentThreadRenderer or a bare item,
     handling both the old renderer format and the new view-model format. */
  function parseThreadComment(thread, entities, isReply) {
    const vm =
      thread.commentViewModel?.commentViewModel || // inside commentThreadRenderer
      thread.commentViewModel; // bare commentViewModel item
    if (vm) {
      const comment = parseEntityComment(
        entityPayloads(entities, [vm.commentKey, vm.toolbarStateKey]),
        isReply
      );
      if (comment) return comment;
    }
    const cr = thread.comment?.commentRenderer || thread.commentRenderer;
    if (cr) return parseComment(cr, isReply);
    return null;
  }

  function continuationOf(cir) {
    return (
      cir?.continuationEndpoint?.continuationCommand?.token ||
      cir?.button?.buttonRenderer?.command?.continuationCommand?.token ||
      cir?.continuationEndpoint?.reloadContinuationItemsCommand?.continuation?.token ||
      null
    );
  }

  function continuationIn(node) {
    const cir = find(node, (n) => n.continuationItemRenderer)?.continuationItemRenderer;
    return continuationOf(cir);
  }

  function pageItems(resp) {
    const items = [];
    for (const ep of resp.onResponseReceivedEndpoints || []) {
      const cmd =
        ep.reloadContinuationItemsCommand ||
        ep.appendContinuationItemsAction ||
        ep.restartContinuationItemsCommand;
      if (cmd?.continuationItems) items.push(...cmd.continuationItems);
    }
    return items;
  }

  function headerFrom(items) {
    for (const item of items) {
      if (item.commentsHeaderRenderer) return item.commentsHeaderRenderer;
    }
    return null;
  }

  function parseSortOptions(header) {
    const items = header?.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems || [];
    return items
      .map((i) => {
        const ep = i.serviceEndpoint || i.continuationEndpoint || {};
        return {
          title: i.title || "",
          token:
            ep.continuationCommand?.token ||
            ep.continuationEndpoint?.continuationCommand?.token ||
            ep.reloadContinuationItemsCommand?.continuation?.token ||
            ep.continuationEndpoint?.reloadContinuationItemsCommand?.continuation?.token ||
            null,
          selected: !!i.selected,
        };
      })
      .filter((i) => i.title && i.token);
  }

  const totalFrom = (header) =>
    header ? digits(text(header.countText)) ?? digits(text(header.commentsCount)) : null;

  /* Process one page of continuationItems. Returns the next page token. */
  function processItems(items, entities, state) {
    let nextToken = null;
    for (const item of items) {
      if (item.continuationItemRenderer) {
        nextToken = continuationOf(item.continuationItemRenderer);
        continue;
      }
      const thread = item.commentThreadRenderer;
      if (thread) {
        const c = parseThreadComment(thread, entities, false);
        if (c && !state.seen.has(c.id)) {
          state.seen.add(c.id);
          state.comments.push(c);
          state.newThisPage++;
        }
        // Replies: old format uses `contents`, new format uses `subThreads`.
        const reps = thread.replies?.commentRepliesRenderer;
        const subs = [...(reps?.contents || []), ...(reps?.subThreads || [])];
        for (const s of subs) {
          if (s.continuationItemRenderer) {
            const t = continuationOf(s.continuationItemRenderer);
            if (t) state.replyTokens.push(t);
            continue;
          }
          const r = parseThreadComment(
            s.commentThreadRenderer || s,
            entities,
            true
          );
          if (r && !state.seen.has(r.id)) {
            state.seen.add(r.id);
            state.comments.push(r);
            state.newThisPage++;
          }
        }
        continue;
      }
      if (item.commentRenderer || item.commentViewModel) {
        const r = parseThreadComment(item, entities, true);
        if (r && !state.seen.has(r.id)) {
          state.seen.add(r.id);
          state.comments.push(r);
          state.newThisPage++;
        }
      }
    }
    return nextToken;
  }

  async function fetchReplyThread(token, state) {
    let t = token;
    let guard = 0;
    while (t && guard++ < 50) {
      const resp = await next({ context: clientContext(), continuation: t });
      const entities = entityMap(resp);
      t = null;
      for (const item of pageItems(resp)) {
        if (item.continuationItemRenderer) {
          t = continuationOf(item.continuationItemRenderer);
          continue;
        }
        const r = parseThreadComment(item.commentThreadRenderer || item, entities, true);
        if (r && !state.seen.has(r.id)) {
          state.seen.add(r.id);
          state.comments.push(r);
        }
      }
    }
  }

  async function mapLimit(arr, size, fn) {
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(size, arr.length) }, async () => {
        while (i < arr.length) await fn(arr[i++]);
      })
    );
  }

  /* Fallback: ask `next` for the watch data and locate the comments
     itemSectionRenderer (covers "comment-item-section" and newer variants). */
  async function findSectionToken(videoId) {
    const first = await next({
      context: clientContext(),
      videoId,
      racyCheckOk: true,
      contentCheckOk: true,
    });
    const section = find(
      first,
      (n) =>
        n.itemSectionRenderer &&
        (/comment/i.test(n.itemSectionRenderer.sectionIdentifier || "") ||
          find(n.itemSectionRenderer, (x) => x.continuationItemRenderer))
    );
    return section ? continuationIn(section) : null;
  }

  const hasCommentItems = (items) =>
    items.some(
      (i) => i.commentThreadRenderer || i.commentRenderer || i.commentViewModel
    );

  async function fetchAllComments(videoId, continuation, emit) {
    const state = { comments: [], replyTokens: [], seen: new Set(), newThisPage: 0 };
    let total = null;
    let sortOptions = [];
    let token = continuation || generatedCommentToken(videoId);

    let resp = await next({ context: clientContext(), continuation: token });
    let items = pageItems(resp);
    let entities = entityMap(resp);

    if (!continuation && !hasCommentItems(items)) {
      // Generated token didn't produce comments: try the watch-data path.
      const t = await findSectionToken(videoId).catch(() => null);
      if (!t) {
        const msg = find(resp, (n) => n.messageRenderer?.text);
        return { comments: [], total: 0, sortOptions: [], note: text(msg?.text) };
      }
      token = t;
      resp = await next({ context: clientContext(), continuation: token });
      items = pageItems(resp);
      entities = entityMap(resp);
    }

    let guard = 0;
    while (guard++ < 500) {
      const header = headerFrom(items);
      if (header) {
        total = total ?? totalFrom(header);
        if (!sortOptions.length) sortOptions = parseSortOptions(header);
      }
      state.newThisPage = 0;
      token = processItems(items, entities, state);
      emit("progress", { loaded: state.comments.length, total });
      // Stop if the API is looping or we hit the safety cap.
      if (!token || (!state.newThisPage && guard > 1) || state.comments.length >= 100000) break;
      resp = await next({ context: clientContext(), continuation: token });
      items = pageItems(resp);
      entities = entityMap(resp);
    }

    if (state.replyTokens.length) {
      emit("progress", { loaded: state.comments.length, total, phase: "replies" });
      await mapLimit(state.replyTokens, 4, (t) =>
        fetchReplyThread(t, state).catch(() => {})
      );
      emit("progress", { loaded: state.comments.length, total });
    }

    return { comments: state.comments, total: total ?? state.comments.length, sortOptions };
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window || !e.data || e.data.source !== "ycs-req" || e.data.type !== "fetch") {
      return;
    }
    const { requestId, videoId, continuation } = e.data;
    const emit = (type, payload) =>
      window.postMessage({ source: "ycs-res", type, requestId, ...payload }, "*");
    try {
      const result = await fetchAllComments(videoId, continuation, emit);
      emit("done", result);
    } catch (err) {
      emit("error", { error: String(err && err.message ? err.message : err) });
    }
  });
})();
