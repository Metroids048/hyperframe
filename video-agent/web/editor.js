(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    done = new Set([
      "complete",
      "failed",
      "cancelled",
      "interrupted",
      "needs_input",
    ]),
    editingKinds = new Set([
      "edit",
      "asset",
      "analyze",
      "restore",
      "operations",
    ]);
  const embedded = new URLSearchParams(location.search).has("embedded");
  document.body.classList.toggle("embedded", embedded);
  let project = null,
    revision = null,
    selection = null,
    samples = [],
    cloud = null,
    posting = false,
    uploading = false,
    uploadRequest = null,
    pendingFiles = [];
  let generation = 0,
    refreshId = 0,
    stream = null,
    pollTimer = null,
    refreshTimer = null,
    eventSequence = 0,
    failures = 0,
    comparing = false,
    selectedVersion = null,
    messageKey = "",
    optimistic = null;
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, action, cls = "quiet") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = action;
    return b;
  };
  const active = (j) => !done.has(j.status),
    jobs = () => project?.jobs || [],
    editJobs = () =>
      jobs().filter((j) => active(j) && editingKinds.has(j.kind)),
    renderJobs = () => jobs().filter((j) => active(j) && j.kind === "render"),
    editing = () => uploading || editJobs().length > 0;
  const editorUrl = (id) =>
    "/edit" +
    (id ? "?project=" + encodeURIComponent(id) : "") +
    (embedded ? (id ? "&" : "?") + "embedded=1" : "");
  const stamp = (s) =>
    `${Math.floor(Math.max(0, s) / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(Math.max(0, s) % 60)
      .toString()
      .padStart(2, "0")}`;
  const totalFrames = () => Math.round((revision?.media?.duration || 0) * 30);
  function err(e) {
    $("error").textContent = e?.message || e || "";
    $("error").hidden = !e;
  }
  function remember(k, v) {
    try {
      v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  }
  function recall(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  const draftKey = () => "edit-draft-" + (project?.id || "new");
  function saveDraft() {
    remember(draftKey(), $("prompt").value);
    remember(
      draftKey() + "-selection",
      selection ? JSON.stringify(selection) : null,
    );
  }
  function setSelection(s, label) {
    selection = s ? { ...s, revisionId: s.revisionId || revision?.id } : null;
    $("selection").hidden = !selection;
    $("selection-text").textContent =
      label ||
      (selection
        ? selection.text ||
          `${selection.kind === "frame" ? "当前画面" : "时间范围"} · ${(selection.startFrame / 30).toFixed(2)}～${(selection.endFrame / 30).toFixed(2)} 秒`
        : "");
    saveDraft();
  }
  function restoreDraft() {
    $("prompt").value = recall(draftKey()) || "";
    try {
      const s = JSON.parse(recall(draftKey() + "-selection"));
      setSelection(s?.revisionId === revision?.id ? s : null);
    } catch {
      setSelection(null);
    }
  }
  async function api(url, options = {}) {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      ...options,
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error("服务响应暂时无法读取，请重试。");
    }
    if (!r.ok) throw Error(d.error || "请求未完成，请重试。");
    return d;
  }
  const json = (body) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  function current() {
    if (!project || !revision) throw Error("请先添加视频。");
    if (revision.id !== project.currentRevisionId)
      throw Error("正在查看历史版本，点击“从此版继续”后再修改。");
    return revision;
  }
  function setPreviewSource(src) {
    const old = $("player");
    if (!src || old.getAttribute("src") === src) return;
    $("voice-audition").pause();
    $("voice-audition").hidden = true;
    old.pause?.();
    const player = el("hyperframes-player");
    player.id = "player";
    player.setAttribute("controls", "");
    if (old.muted) player.setAttribute("muted", "");
    player.setAttribute("volume", String(old.volume ?? 1));
    player.setAttribute("src", src);
    player.addEventListener("play", () => $("voice-audition").pause());
    player.addEventListener("timeupdate", (e) => {
      $("playhead").textContent = stamp(
        e.detail?.currentTime ?? player.currentTime ?? 0,
      );
    });
    player.addEventListener("playbackerror", () =>
      err("浏览器暂未播放声音，请再次点击播放或试听旁白。"),
    );
    old.replaceWith(player);
  }
  function playAt(time) {
    if (comparing) {
      comparing = false;
      drawPreview();
    }
    $("player").seek?.(
      Math.max(0, Math.min(time, (revision?.media?.duration || 0) - 1 / 30)),
    );
    Promise.resolve($("player").play?.()).catch(() =>
      err("请点击预览中的播放键开始播放。"),
    );
  }
  function refreshButtons() {
    const has = !!revision,
      isCurrent = has && revision.id === project?.currentRevisionId,
      canEdit = isCurrent && !editing() && !posting,
      importing =
        uploading || jobs().some((j) => j.kind === "asset" && active(j));
    $("empty").hidden = has || importing;
    $("import-loading").hidden = has || !importing;
    $("viewer").hidden = !has;
    $("preview-tools").hidden = !has;
    $("send").disabled =
      posting ||
      uploading ||
      !project ||
      (!revision && !importing) ||
      !$("prompt").value.trim() ||
      (has && !isCurrent);
    $("send").textContent = posting
      ? "正在发送…"
      : editing()
        ? "排队发送 ↑"
        : "发送 ↑";
    $("prompt").disabled = false;
    $("chat-note").textContent = !project
      ? "先添加素材。Enter 发送，Shift+Enter 换行。"
      : has && !isCurrent
        ? "正在查看历史版本，点击“从此版继续”即可修改。"
        : editing()
          ? "可以继续写要求；发送后按顺序基于最新结果执行。"
          : renderJobs().length
            ? "正在导出指定版本，可以继续聊天和修改。"
            : "修改后先预览，满意时再导出。Enter 发送，Shift+Enter 换行。";
    const exporting = renderJobs().some(
      (j) =>
        (j.revisionId || j.payload?.revisionId || j.baseRevisionId) ===
        revision?.id,
    );
    for (const id of ["export", "export-inline"])
      $(id).disabled = !has || uploading || exporting || posting;
    $("undo").disabled = !canEdit || !revision?.parentId;
    $("restore").hidden = !has || isCurrent;
    $("restore").disabled = editing() || posting;
    $("versions").disabled = !has;
    $("versions").hidden = !has;
    $("undo").hidden = !has;
    $("analyze").disabled = !project || editing() || posting;
    for (const id of ["reference-frame", "composer-reference", "open-range"])
      $(id).disabled = !canEdit || comparing;
    for (const id of [
      "upload",
      "add-asset",
      "chat-attach",
      "source-upload",
      "new-project",
      "pick-sample",
    ])
      $(id).disabled = uploading || posting;
    $("projects").disabled = uploading || posting;
    $("show-library").disabled = !project;
    document
      .querySelectorAll("[data-sample-id]")
      .forEach((b) => (b.disabled = uploading || posting));
  }
  function drawSuggestions() {
    const common = [
        {
          label: "精简内容",
          text: "精简这段视频，删除停顿和重复表达，保留主要信息和完整句子。",
        },
        {
          label: "自动加字幕",
          text: "给原片讲话加中文字幕，保留原声，不添加旁白。",
        },
        { label: "调整时间", text: "只保留视频的前 10 秒，其他保持不变。" },
        {
          label: "加一句旁白",
          text: "从第 1 秒添加中文旁白「欢迎观看」，正常语速，把原声调低，同时为这段旁白加字幕。",
        },
        {
          label: "竖屏版本",
          text: "改成 9:16 竖屏，保持人物或重要内容在画面内。",
        },
      ],
      examples = samples.find((s) => s.id === project?.sampleId)?.prompts || [];
    $("chat-prompts").replaceChildren(
      ...[...examples, ...common].slice(0, 5).map((p) =>
        button(p.label, () => {
          $("prompt").value = p.text;
          saveDraft();
          refreshButtons();
          $("prompt").focus();
        }),
      ),
    );
  }
  function drawVoice() {
    const voices =
      revision?.timeline?.audio?.filter((c) => c.role === "voice") || [];
    $("voice-preview").hidden = !voices.length;
    $("voice-summary").textContent = voices.length
      ? `${voices.length} 段旁白 · 可单独试听`
      : "";
    $("voice-actions").replaceChildren(
      ...voices.map((c, i) =>
        button(`试听旁白 ${i + 1}`, async () => {
          const source = project.assets[c.assetId];
          if (!source?.mediaUrl) return;
          const a = $("voice-audition");
          $("player").pause?.();
          a.src = source.mediaUrl;
          a.hidden = false;
          a.playbackRate = c.rate || 1;
          a.onloadedmetadata = () => {
            a.currentTime = (c.in || 0) / 30;
          };
          a.ontimeupdate = () => {
            if (
              a.currentTime >=
              ((c.in || 0) + (c.end - c.start) * (c.rate || 1)) / 30
            )
              a.pause();
          };
          try {
            await a.play();
          } catch {
            err("请点击下方音频播放键试听。");
          }
        }),
      ),
    );
  }
  function drawPreview() {
    document.body.classList.toggle("landing", !revision);
    $("source-label").textContent = project
      ? `${Object.keys(project.assets || {}).length} 份素材 · 原片和历史版本保留`
      : "原片会保留，每次修改都有记录";
    $("title").textContent = project?.name || "把剪辑，说出来。";
    $("version-label").textContent = revision
      ? `版本 ${String(revision.number).padStart(2, "0")} · ${revision.id === project.currentRevisionId ? "当前版本" : "历史版本"}`
      : "从一段原片开始";
    $("versions").replaceChildren(
      ...(project?.revisions || []).map((r) => {
        const o = el(
          "option",
          `第 ${r.number} 版 · ${(r.description || "").slice(0, 22)}`,
        );
        o.value = r.id;
        return o;
      }),
    );
    $("versions").value = revision?.id || "";
    if (revision) {
      const target = comparing ? project.revisions[0] : revision;
      setPreviewSource(target.previewUrl);
      $("spec").textContent =
        `${target.media.width} × ${target.media.height} · ${target.media.duration.toFixed(2)} 秒 · 30 fps`;
      $("preview-label").textContent = comparing
        ? "原片对比"
        : `版本 ${revision.number} · 可播放预览`;
    }
    $("change-summary").hidden = !revision || revision.number === 1;
    if (revision)
      $("change-text").textContent = revision.description || "当前版本已准备好";
    $("compare-original").textContent = comparing
      ? "返回修改后视频"
      : "对比原片";
    $("compare-original").setAttribute("aria-pressed", String(comparing));
    $("downloads").replaceChildren();
    $("downloads").hidden = !revision?.videoUrl;
    $("delivery-note").hidden = !revision?.videoUrl && !renderJobs().length;
    if (revision?.videoUrl)
      for (const [label, url] of [
        [`下载第 ${revision.number} 版 MP4`, revision.videoUrl + "?download=1"],
        ["字幕 SRT", revision.subtitlesUrl],
        ["可编辑工程", revision.packageUrl],
      ]) {
        if (!url) continue;
        const a = el("a", label);
        a.href = url;
        a.download = "";
        $("downloads").append(a);
      }
    drawVoice();
    refreshButtons();
  }
  function clipRanges() {
    let at = 0;
    return (revision?.timeline?.clips || []).map((c) => {
      const rate = c.rate || c.speed || 1,
        start = c.start ?? at,
        end = c.end ?? start + Math.round((c.out - c.in) / rate);
      at = end;
      return { ...c, start, end, rate };
    });
  }
  function drawLibrary() {
    $("assets").replaceChildren();
    $("transcript").replaceChildren();
    let count = 0;
    for (const a of Object.values(project?.assets || {})) {
      const card = button(
        "",
        () => {
          if (!revision) return;
          const c = clipRanges().find((x) => x.assetId === a.id);
          setSelection({
            assetId: a.id,
            kind: "range",
            startFrame: c?.start || 0,
            endFrame: c?.end || 1,
            text: `素材：${a.name}`,
          });
          $("prompt").focus();
          closeLibrary();
        },
        "asset",
      );
      if (a.thumbnailUrl) {
        const im = el("img");
        im.src = a.thumbnailUrl;
        im.alt = "";
        im.loading = "lazy";
        card.append(im);
      } else
        card.append(el("div", a.kind === "video" ? "▷" : "♫", "audio-icon"));
      const info = el("div");
      info.append(
        el("strong", a.name),
        el(
          "small",
          a.status === "ready"
            ? `${(a.duration || 0).toFixed(1)} 秒 · ${a.kind === "video" ? "视频" : "音频"}`
            : "正在准备",
        ),
      );
      card.append(info);
      $("assets").append(card);
      const segments = a.analysis?.transcript?.segments || [];
      if (segments.length) $("transcript").append(el("h3", a.name));
      for (const s of segments) {
        count++;
        const matches = clipRanges().filter(
          (c) =>
            c.assetId === a.id && s.start * 30 < c.out && s.end * 30 > c.in,
        );
        if (!matches.length) {
          const n = el(
            "div",
            `${stamp(s.start)} · ${s.text}`,
            "transcript-absent",
          );
          n.title = "这句话不在当前成片中";
          $("transcript").append(n);
          continue;
        }
        for (const c of matches) {
          const start = Math.max(
              c.start,
              c.start + Math.round((s.start * 30 - c.in) / c.rate),
            ),
            end = Math.min(
              c.end,
              c.start + Math.round((s.end * 30 - c.in) / c.rate),
            );
          if (end <= start) continue;
          const b = button("", () => {
            if (editing() || revision.id !== project.currentRevisionId) {
              err("等当前修改完成后，再引用这句话。");
              return;
            }
            setSelection({
              assetId: a.id,
              kind: "range",
              startFrame: start,
              endFrame: end,
              text: s.text,
            });
            $("player").seek?.(start / 30);
            closeLibrary();
            $("prompt").focus();
          });
          b.append(
            el("time", `${stamp(start / 30)} · 点击引用`),
            el("span", s.text),
          );
          $("transcript").append(b);
        }
      }
    }
    if (!count)
      $("transcript").append(
        el(
          "p",
          "需要字幕或按句剪辑时，搭档会读取文字稿。也可以点击“读取文字稿”。",
          "muted",
        ),
      );
  }
  function changeTime(r) {
    const o = (r.operations || []).find((o) =>
      [
        "caption_add",
        "caption_update",
        "audio_add",
        "voiceover",
        "delete_range",
        "insert",
        "overlay_add",
        "transition",
      ].includes(o.type),
    );
    return Math.max(
      0,
      Math.min((o?.start ?? o?.at ?? 0) / 30 - 0.4, r.media.duration - 1 / 30),
    );
  }
  function drawMessages() {
    const all = project?.messages || [],
      key = JSON.stringify([
        all,
        jobs().map((j) => [j.id, j.status]),
        optimistic,
      ]);
    if (key === messageKey) return;
    messageKey = key;
    const box = $("messages"),
      atEnd = box.scrollHeight - box.clientHeight - box.scrollTop < 90;
    const nodes = all.map((m) => {
      const task = jobs().find((j) => j.id === m.jobId),
        resolved = m.error && task?.status === "complete",
        n = el(
          "article",
          undefined,
          "message " +
            m.role +
            (m.error ? (resolved ? " resolved" : " failure") : ""),
        );
      n.append(el("div", resolved ? "这次修改已重试完成。" : m.text));
      if (m.role === "user" && task && active(task))
        n.append(
          el(
            "small",
            task.status === "queued"
              ? "已排队 · 将基于最新结果执行"
              : "正在修改…",
          ),
        );
      const r = project.revisions.find((r) => r.id === m.revisionId);
      if (r && m.role === "assistant" && !m.error) {
        n.append(
          el("small", `版本 ${r.number} · ${r.description || "修改已完成"}`),
        );
        const actions = el("div", undefined, "message-actions");
        actions.append(
          button("播放修改处 ▷", () => {
            selectVersion(r.id);
            playAt(changeTime(r));
          }),
        );
        if (r.videoUrl) {
          const a = el("a", "下载这一版", "chat-result");
          a.href = r.videoUrl + "?download=1";
          a.download = "";
          actions.append(a);
        }
        n.append(actions);
      }
      if (m.error && m.jobId && !resolved)
        n.append(button("重试这次修改", () => retry(m.jobId), "message-retry"));
      return n;
    });
    if (optimistic)
      nodes.push(
        el("article", optimistic.text + "\n正在发送…", "message user pending"),
      );
    if (!nodes.length) {
      const welcome = el("div", undefined, "welcome");
      welcome.append(
        el("div", "你的剪辑搭档，已就位。", "welcome-title"),
        el(
          "p",
          project
            ? "素材准备好后，说说你想保留什么、删掉什么，或者怎样调整字幕和声音。"
            : "把素材放进来，再用一句话开始。你可以连续提出修改，每次结果都能预览和撤销。",
        ),
      );
      nodes.push(welcome);
    }
    box.replaceChildren(...nodes);
    if (atEnd || optimistic) box.scrollTop = box.scrollHeight;
  }
  function drawJobs() {
    const edits = editJobs(),
      j = edits.find((j) => j.status === "running") || edits[0],
      last = [...jobs()].reverse().find((j) => editingKinds.has(j.kind)),
      visible =
        j ||
        (last &&
        ["failed", "interrupted", "needs_input", "cancelled"].includes(
          last.status,
        )
          ? last
          : null);
    if (!uploading) {
      $("chat-task").hidden = !visible;
      $("chat-task").classList.toggle("is-loading", !!j);
      $("chat-task").setAttribute("aria-busy", String(!!j));
      $("chat-progress").hidden = !j;
      $("chat-progress").value = j?.progress || 0;
      $("chat-stage").textContent = visible
        ? (visible.error || visible.question || visible.stage || "等待执行") +
          (edits.length > 1 ? ` · 另有 ${edits.length - 1} 项排队` : "")
        : "";
      $("chat-cancel").hidden = !j;
      $("chat-retry").hidden =
        !visible ||
        !["failed", "interrupted", "cancelled"].includes(visible.status);
      $("chat-retry").dataset.jobId = visible?.id || "";
      if (j?.kind === "asset")
        $("import-stage").textContent = j.stage || "正在准备预览…";
    }
    const renders = renderJobs(),
      r =
        renders.find((j) => j.status === "running") ||
        renders[0] ||
        [...jobs()].reverse().find((j) => j.kind === "render");
    $("export-status").hidden = !r;
    if (r) {
      const targetId =
          r.revisionId || r.payload?.revisionId || r.baseRevisionId,
        target = project.revisions.find((x) => x.id === targetId);
      $("export-stage").textContent =
        (target ? `第 ${target.number} 版 · ` : "") +
        (r.error ||
          r.stage ||
          (active(r)
            ? "等待导出"
            : r.status === "complete"
              ? "导出完成"
              : "导出已停止"));
      $("export-progress").value = r.progress || 0;
      $("export-progress").hidden = !active(r);
      $("cancel-export").hidden = !active(r);
      $("cancel-export").dataset.jobId = r.id;
      $("retry-export").hidden = ![
        "failed",
        "interrupted",
        "cancelled",
      ].includes(r.status);
      $("retry-export").dataset.jobId = r.id;
      if (
        r.status === "complete" &&
        targetId !== revision?.id &&
        target?.videoUrl
      ) {
        const a = el("a", ` 下载第 ${target.number} 版 MP4`);
        a.href = target.videoUrl + "?download=1";
        a.download = "";
        $("export-stage").append(a);
      }
    }
    refreshButtons();
  }
  function draw() {
    drawSuggestions();
    drawPreview();
    drawLibrary();
    drawMessages();
    drawJobs();
    $("projects").value = project?.id || "";
  }
  async function list() {
    const ps = await api("/api/edit-projects"),
      first = el("option", "选择项目");
    first.value = "";
    $("projects").replaceChildren(
      first,
      ...ps.map((p) => {
        const o = el("option", p.name);
        o.value = p.id;
        return o;
      }),
    );
    $("projects").value = project?.id || "";
  }
  function applyProject(p) {
    const previousCurrent = project?.currentRevisionId;
    project = p;
    if (
      selectedVersion === previousCurrent &&
      p.currentRevisionId !== previousCurrent
    )
      selectedVersion = null;
    const next =
      p.revisions.find(
        (r) => r.id === (selectedVersion || p.currentRevisionId),
      ) ||
      p.revisions.at(-1) ||
      null;
    if (next?.id !== revision?.id) {
      comparing = false;
      if (selection && selection.revisionId !== next?.id) setSelection(null);
    }
    revision = next;
    draw();
  }
  async function refreshProject() {
    if (!project?.id) return;
    const pid = project.id,
      g = generation,
      request = ++refreshId,
      p = await api("/api/edit-projects/" + pid);
    if (g !== generation || request !== refreshId || project?.id !== pid)
      return;
    failures = 0;
    $("reconnect").hidden = true;
    applyProject(p);
  }
  function connectionFailed() {
    failures++;
    if (failures >= 2) $("reconnect").hidden = false;
  }
  function disconnect() {
    stream?.close();
    stream = null;
    clearTimeout(pollTimer);
    clearTimeout(refreshTimer);
  }
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () => refreshProject().catch(connectionFailed),
      80,
    );
  }
  function connectEvents() {
    disconnect();
    if (!project?.id) return;
    const pid = project.id,
      g = generation;
    eventSequence = Number(recall("edit-events-" + pid)) || 0;
    if (window.EventSource) {
      stream = new EventSource(
        `/api/edit-projects/${pid}/events?after=${eventSequence}`,
      );
      stream.onopen = () => {
        failures = 0;
        $("reconnect").hidden = true;
      };
      stream.onmessage = (e) => {
        if (g !== generation) return;
        let event;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        if (event.projectId && event.projectId !== pid) return;
        const sequence = Number(event.sequence || e.lastEventId || 0);
        if (sequence && sequence <= eventSequence) return;
        eventSequence = Math.max(eventSequence, sequence);
        remember("edit-events-" + pid, String(eventSequence));
        const task = jobs().find((j) => j.id === event.jobId);
        if (task) {
          for (const key of ["status", "stage", "progress", "revisionId"])
            if (event[key] !== undefined) task[key] = event[key];
          drawJobs();
        }
        if (
          !task ||
          done.has(event.status) ||
          /revision|message|complete|asset/.test(event.type || "")
        )
          scheduleRefresh();
      };
      stream.onerror = () => {};
    }
    async function poll() {
      if (g !== generation || project?.id !== pid) return;
      try {
        await refreshProject();
      } catch {
        connectionFailed();
      }
      if (g === generation)
        pollTimer = setTimeout(poll, jobs().some(active) ? 1500 : 8000);
    }
    pollTimer = setTimeout(poll, 500);
  }
  async function openProject(id) {
    saveDraft();
    disconnect();
    const g = ++generation;
    selectedVersion = null;
    comparing = false;
    optimistic = null;
    const p = await api("/api/edit-projects/" + id);
    if (g !== generation) return;
    selection = null;
    revision = null;
    project = null;
    applyProject(p);
    history.replaceState(null, "", editorUrl(id));
    restoreDraft();
    refreshButtons();
    connectEvents();
  }
  function closeLibrary() {
    $("library").hidden = true;
    $("library-backdrop").hidden = true;
    document.body.classList.remove("library-open");
  }
  function openLibrary() {
    $("library").hidden = false;
    $("library-backdrop").hidden = false;
    document.body.classList.add("library-open");
  }
  function resetSource() {
    saveDraft();
    disconnect();
    generation++;
    project = null;
    revision = null;
    selection = null;
    selectedVersion = null;
    comparing = false;
    optimistic = null;
    pendingFiles = [];
    messageKey = "";
    closeLibrary();
    $("player").pause?.();
    $("voice-audition").pause();
    $("attachments").hidden = true;
    $("reconnect").hidden = true;
    history.replaceState(null, "", editorUrl());
    restoreDraft();
    err("");
    draw();
  }
  function selectVersion(id) {
    selectedVersion = id;
    revision = project.revisions.find((r) => r.id === id) || revision;
    comparing = false;
    setSelection(null);
    drawPreview();
    drawLibrary();
    drawJobs();
  }
  async function submit(action, body) {
    const pid = project?.id;
    if (!pid) throw Error("请先添加素材。");
    err("");
    const result = await api(`/api/edit-projects/${pid}/${action}`, json(body));
    if (project?.id === pid) await refreshProject();
    return result;
  }
  async function cancel(id) {
    if (!id || !project) return;
    try {
      await api(`/api/edit-projects/${project.id}/jobs/${id}/cancel`, {
        method: "POST",
      });
      await refreshProject();
    } catch (e) {
      err(e);
    }
  }
  async function retry(id) {
    try {
      err("");
      await api(`/api/edit-projects/${project.id}/jobs/${id}/retry`, {
        method: "POST",
      });
      await refreshProject();
    } catch (e) {
      err(e);
    }
  }
  function attachmentList() {
    $("attachments").hidden = !pendingFiles.length;
    $("attachments").replaceChildren(
      ...pendingFiles.map((f) =>
        el(
          "span",
          `${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} MB`,
          "attachment",
        ),
      ),
    );
  }
  async function uploadOne(f, pid) {
    $("chat-task").hidden = false;
    $("chat-task").classList.add("is-loading");
    $("chat-progress").hidden = false;
    $("chat-cancel").hidden = false;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadRequest = xhr;
      xhr.open("POST", `/api/edit-projects/${pid}/assets`);
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
      xhr.setRequestHeader("Idempotency-Key", crypto.randomUUID());
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      const report = (pct) => {
        const message =
          pct === 100
            ? `${f.name} 已上传，正在准备预览…`
            : `上传 ${f.name} · ${pct}%`;
        $("chat-stage").textContent = message;
        $("import-stage").textContent = message;
        $("chat-progress").value = pct;
      };
      report(0);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) report(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        uploadRequest = null;
        try {
          const d = JSON.parse(xhr.responseText);
          xhr.status >= 200 && xhr.status < 300
            ? resolve(d)
            : reject(Error(d.error || "上传未完成"));
        } catch {
          reject(Error("上传响应无法读取，请重试。"));
        }
      };
      xhr.onerror = () => {
        uploadRequest = null;
        reject(Error("上传连接中断，请重新添加未上传的素材。"));
      };
      xhr.onabort = () => {
        uploadRequest = null;
        reject(Error("上传已停止。已经上传的素材仍会保留。"));
      };
      xhr.send(f);
    });
  }
  async function chooseFiles(files) {
    const batch = Array.from(files || []);
    if (!batch.length || uploading) return;
    try {
      for (const f of batch) {
        if (!/\.(mp4|mov|webm|mp3|wav|m4a)$/i.test(f.name))
          throw Error(
            `暂不支持 ${f.name}，请使用 MP4、MOV、WebM、MP3、WAV 或 M4A。`,
          );
        if (f.size > 1024 ** 3) throw Error(`${f.name} 超过 1 GB，请先压缩。`);
      }
      if (!project && !batch.some((f) => /\.(mp4|mov|webm)$/i.test(f.name)))
        throw Error("新项目至少需要一段视频。");
      err("");
      uploading = true;
      pendingFiles = batch;
      attachmentList();
      refreshButtons();
      if (!project) {
        const draft = $("prompt").value,
          first = batch.find((f) => /\.(mp4|mov|webm)$/i.test(f.name)),
          p = await api(
            "/api/edit-projects",
            json({ name: first.name.replace(/\.[^.]+$/, ""), initialText: "" }),
          );
        generation++;
        applyProject(p);
        $("prompt").value = draft;
        saveDraft();
        remember("edit-draft-new", null);
        history.replaceState(null, "", editorUrl(p.id));
        connectEvents();
      }
      const pid = project.id,
        ordered = revision
          ? batch
          : [...batch].sort(
              (a, b) =>
                Number(/\.(mp4|mov|webm)$/i.test(b.name)) -
                Number(/\.(mp4|mov|webm)$/i.test(a.name)),
            );
      for (const f of ordered) {
        await uploadOne(f, pid);
        pendingFiles = pendingFiles.filter((x) => x !== f);
        attachmentList();
        await refreshProject();
      }
      await list();
    } catch (e) {
      err(e);
    } finally {
      uploading = false;
      pendingFiles = [];
      attachmentList();
      drawJobs();
      refreshButtons();
      $("prompt").focus();
    }
  }
  function referenceFrame() {
    try {
      current();
      const start = Math.min(
        Math.max(0, Math.round(($("player").currentTime || 0) * 30)),
        Math.max(0, totalFrames() - 1),
      );
      setSelection({ kind: "frame", startFrame: start, endFrame: start + 1 });
      $("prompt").focus();
    } catch (e) {
      err(e);
    }
  }
  for (const id of ["upload", "add-asset", "chat-attach", "source-upload"])
    $(id).onclick = () => {
      $("file").value = "";
      $("file").click();
    };
  $("file").onchange = () => chooseFiles($("file").files);
  const dropZone = document.querySelector(".app");
  dropZone.ondragover = (e) => {
    if ([...(e.dataTransfer?.types || [])].includes("Files")) {
      e.preventDefault();
      document.body.classList.add("dragging");
    }
  };
  dropZone.ondragleave = (e) => {
    if (!dropZone.contains(e.relatedTarget))
      document.body.classList.remove("dragging");
  };
  dropZone.ondrop = (e) => {
    e.preventDefault();
    document.body.classList.remove("dragging");
    chooseFiles(e.dataTransfer.files);
  };
  $("new-project").onclick = resetSource;
  $("projects").onchange = () => {
    if ($("projects").value) openProject($("projects").value).catch(err);
  };
  $("versions").onchange = () => selectVersion($("versions").value);
  $("clear-selection").onclick = () => setSelection(null);
  $("show-library").onclick = openLibrary;
  $("close-library").onclick = closeLibrary;
  $("library-backdrop").onclick = closeLibrary;
  $("reference-frame").onclick = $("composer-reference").onclick =
    referenceFrame;
  $("open-range").onclick = () => {
    const start = Math.min(
      $("player").currentTime || 0,
      Math.max(0, (revision?.media?.duration || 0) - 1 / 30),
    );
    $("range-start").value = start.toFixed(3);
    $("range-end").value = Math.min(revision.media.duration, start + 3).toFixed(
      3,
    );
    $("range-dialog").showModal();
  };
  $("close-range").onclick = () => $("range-dialog").close();
  $("reference-range").onclick = () => {
    try {
      current();
      const start = Math.round(Number($("range-start").value) * 30),
        end = Math.round(Number($("range-end").value) * 30);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > totalFrames()
      )
        throw Error(
          `引用范围需在 0～${revision.media.duration.toFixed(2)} 秒内，且终点晚于起点。`,
        );
      setSelection({ kind: "range", startFrame: start, endFrame: end });
      $("range-dialog").close();
      $("prompt").focus();
      err("");
    } catch (e) {
      err(e);
    }
  };
  $("chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("prompt").value.trim();
    if (!text || posting) return;
    if (!project) {
      err("先添加视频，写好的要求会保留。");
      return;
    }
    if (revision && revision.id !== project.currentRevisionId) {
      err("请先点击“从此版继续”。");
      return;
    }
    const queued = editing(),
      pid = project.id,
      g = generation;
    if (queued && selection) {
      err("这条要求引用了当前版本。等当前修改完成后重新引用，再发送。");
      return;
    }
    posting = true;
    optimistic = { text };
    err("");
    drawMessages();
    refreshButtons();
    try {
      await api(
        `/api/edit-projects/${pid}/messages`,
        json({
          text,
          baseRevisionId: revision?.id || null,
          selection: queued ? null : selection,
          afterCurrent: queued,
          autoExport: false,
        }),
      );
      if (g !== generation) return;
      if ($("prompt").value.trim() === text) $("prompt").value = "";
      optimistic = null;
      setSelection(null);
      saveDraft();
      await refreshProject();
    } catch (e) {
      optimistic = null;
      err(e);
      drawMessages();
    } finally {
      posting = false;
      refreshButtons();
    }
  };
  $("prompt").addEventListener("input", () => {
    saveDraft();
    refreshButtons();
  });
  $("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!$("send").disabled) $("chat-form").requestSubmit();
    }
  });
  $("undo").onclick = async () => {
    try {
      const r = current();
      await submit("restore", { baseRevisionId: r.id, revisionId: r.parentId });
    } catch (e) {
      err(e);
    }
  };
  $("restore").onclick = async () => {
    try {
      const target = revision.id;
      selectedVersion = null;
      await submit("restore", {
        baseRevisionId: project.currentRevisionId,
        revisionId: target,
      });
    } catch (e) {
      err(e);
    }
  };
  $("analyze").onclick = () => submit("analyze", {}).catch(err);
  $("watch-change").onclick = () => playAt(changeTime(revision));
  $("compare-original").onclick = () => {
    comparing = !comparing;
    drawPreview();
  };
  $("export").onclick = $("export-inline").onclick = async () => {
    if (!revision) return;
    const target = revision.id;
    try {
      posting = true;
      refreshButtons();
      await submit("render", { revisionId: target });
    } catch (e) {
      err(e);
    } finally {
      posting = false;
      refreshButtons();
    }
  };
  $("chat-cancel").onclick = () => {
    if (uploadRequest) {
      uploadRequest.abort();
      return;
    }
    const j = editJobs().find((x) => x.status === "running") || editJobs()[0];
    if (j) cancel(j.id);
  };
  $("chat-retry").onclick = () => retry($("chat-retry").dataset.jobId);
  $("cancel-export").onclick = () => cancel($("cancel-export").dataset.jobId);
  $("retry-export").onclick = () => retry($("retry-export").dataset.jobId);
  $("reconnect-button").onclick = async () => {
    try {
      await refreshProject();
      connectEvents();
      err("");
    } catch (e) {
      err(e);
    }
  };
  $("pick-sample").onclick = () => $("source-dialog").showModal();
  $("close-sources").onclick = () => $("source-dialog").close();
  async function importSample(sample) {
    const draft = $("prompt").value;
    $("source-dialog").close();
    uploading = true;
    refreshButtons();
    err("");
    try {
      const p = await api(
        `/api/edit-samples/${encodeURIComponent(sample.id)}/start`,
        json({}),
      );
      await openProject(p.id);
      if (!$("prompt").value && draft) {
        $("prompt").value = draft;
        saveDraft();
      }
      await list();
    } catch (e) {
      err(e);
    } finally {
      uploading = false;
      refreshButtons();
      $("prompt").focus();
    }
  }
  function drawSamples() {
    for (const id of ["sample-gallery", "source-options"])
      $(id).replaceChildren(
        ...samples.map((s) => {
          const card = el("article", undefined, "sample-card");
          if (s.imageUrl) {
            const im = el("img");
            im.src = s.imageUrl;
            im.alt = s.title;
            im.loading = "lazy";
            card.append(im);
          }
          const body = el("div", undefined, "sample-copy");
          body.append(
            el("h3", s.title),
            el(
              "p",
              `${s.duration ? s.duration + " 秒 · " : ""}${s.description || ""}`,
            ),
          );
          if (s.language)
            body.append(
              el(
                "small",
                /^(en|english)/i.test(s.language)
                  ? "英语讲话 · 可要求中文字幕"
                  : s.language === "zh"
                    ? "普通话讲话"
                    : s.language,
              ),
            );
          if (s.burnedInSubtitles)
            body.append(
              el(
                "small",
                "原片已有字幕 · 新增文字请避开原字幕",
                "sample-caption-note",
              ),
            );
          if (s.attribution || s.license || s.pageUrl) {
            const source = el("details", undefined, "sample-source");
            source.append(el("summary", "素材来源与许可"));
            if (s.attribution) source.append(el("p", s.attribution));
            for (const [label, url] of [
              [s.license || "查看许可", s.licenseUrl],
              ["原始来源", s.pageUrl || s.sourceUrl],
            ]) {
              if (!url || !/^https?:\/\//i.test(url)) continue;
              const link = el("a", label);
              link.href = url;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              source.append(link);
            }
            body.append(source);
          }
          const b = button("导入原片 ↗", () => importSample(s));
          b.dataset.sampleId = s.id;
          body.append(b);
          card.append(body);
          return card;
        }),
      );
    if (!samples.length)
      $("sample-gallery").append(
        el("p", "样例正在准备中，你可以先添加自己的视频。", "muted"),
      );
    drawSuggestions();
    refreshButtons();
  }
  function showCloud(c) {
    cloud = c;
    const subscription = c.connectionMode === "subscription";
    $("provider-status").textContent = c.configured
      ? subscription
        ? "Codex 订阅 · 可以开始对话"
        : "模型已连接 · 可以开始对话"
      : "连接模型，即可开始对话";
    $("model-help").textContent = c.configured ? "连接正常" : "连接模型";
    $("connection-dot").classList.toggle("connected", !!c.configured);
    $("subscription-help").hidden = !subscription;
    $("api-connection").hidden = subscription;
    if (c.model) $("model-name").value = c.model;
    $("capability-summary").replaceChildren();
    if (c.workflows?.length)
      $("capability-summary").append(
        el(
          "p",
          "可用流程：" +
            c.workflows
              .map((w) =>
                typeof w === "string" ? w : w.label || w.name || w.id,
              )
              .join("、"),
        ),
      );
    if (c.skills?.length)
      $("capability-summary").append(
        el("p", `${c.skills.length} 项剪辑技能会按要求自动调用。`),
      );
  }
  async function refreshConnection() {
    try {
      showCloud(await api("/api/edit-capabilities"));
    } catch {
      $("provider-status").textContent = "连接状态暂不可用";
    }
  }
  $("model-help").onclick = () => {
    $("model-dialog").showModal();
    refreshConnection();
  };
  $("close-model").onclick = $("close-subscription").onclick = () =>
    $("model-dialog").close();
  $("connect-form").onsubmit = async (e) => {
    e.preventDefault();
    $("connect").disabled = true;
    $("connect-status").textContent = "正在验证连接…";
    try {
      showCloud(
        await api("/api/edit-connection", {
          ...json({
            apiKey: $("api-key").value.trim(),
            model: $("model-name").value.trim(),
          }),
          signal: AbortSignal.timeout(135000),
        }),
      );
      $("api-key").value = "";
      $("connect-status").textContent = "连接成功。";
      $("model-dialog").close();
    } catch (e) {
      $("connect-status").textContent = e.message;
    } finally {
      $("connect").disabled = false;
    }
  };
  $("verify-subscription").onclick = async () => {
    $("verify-subscription").disabled = true;
    $("subscription-status").textContent = "正在验证…";
    try {
      showCloud(
        await api("/api/edit-connection", {
          ...json({}),
          signal: AbortSignal.timeout(185000),
        }),
      );
      $("subscription-status").textContent = "连接成功，可以开始剪辑。";
    } catch (e) {
      $("subscription-status").textContent = e.message;
    } finally {
      $("verify-subscription").disabled = false;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshConnection();
      if (project) refreshProject().catch(connectionFailed);
    }
  });
  addEventListener("online", () => {
    if (project) connectEvents();
    refreshConnection();
  });
  addEventListener("offline", () => {
    $("reconnect").hidden = false;
  });
  addEventListener("pagehide", saveDraft);
  if (embedded) {
    const reportSize = () => {
      if (innerWidth <= 800)
        parent.postMessage(
          {
            type: "video-editor-size",
            height: Math.ceil(
              document.querySelector(".app").getBoundingClientRect().height,
            ),
          },
          location.origin,
        );
    };
    new ResizeObserver(reportSize).observe(document.querySelector(".app"));
    addEventListener("resize", reportSize);
  }
  draw();
  restoreDraft();
  refreshButtons();
  refreshConnection();
  api("/api/edit-samples")
    .then((value) => {
      samples = value;
      drawSamples();
    })
    .catch(() => {
      samples = [];
      drawSamples();
    });
  list()
    .then(() => {
      const id = new URLSearchParams(location.search).get("project");
      if (id) return openProject(id);
    })
    .catch(err);
})();
