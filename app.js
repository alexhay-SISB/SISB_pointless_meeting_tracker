(() => {
  "use strict";

  const STORAGE_KEY = "sisb-pointless-meetings";
  const SETTINGS_KEY = "sisb-pmt-github-settings";
  const SCORE_LABELS = {
    1: "Pointless",
    2: "Totally pointless",
    3: "Unfathomably ridiculous",
    4: "I didn't know—I fell asleep",
    5: "Bose"
  };

  const state = { meetings: [], syncing: false };
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    form: $("#meetingForm"),
    date: $("#meetingDate"),
    dayPreview: $("#dayPreview"),
    list: $("#meetingList"),
    empty: $("#emptyState"),
    formMessage: $("#formMessage"),
    submitText: $("#submitText"),
    submitButton: $("#meetingForm .submit-button"),
    syncNotice: $("#syncNotice"),
    dialog: $("#settingsDialog"),
    settingsForm: $("#settingsForm"),
    settingsMessage: $("#settingsMessage")
  };

  function localToday() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function parseLocalDate(value) {
    return new Date(`${value}T12:00:00`);
  }

  function getSettings() {
    const configured = window.MEETING_TRACKER_CONFIG || {};
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) { saved = {}; }
    return {
      owner: saved.owner || configured.owner || "",
      repo: saved.repo || configured.repo || "",
      branch: saved.branch || configured.branch || "main",
      dataPath: configured.dataPath || "meetings.json",
      token: saved.token || ""
    };
  }

  function hasRemoteConfig(settings = getSettings()) {
    return Boolean(settings.owner && settings.repo);
  }

  function hasWriteAccess(settings = getSettings()) {
    return hasRemoteConfig(settings) && Boolean(settings.token);
  }

  function setMessage(element, message = "", isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function updateSyncNotice() {
    const settings = getSettings();
    if (hasWriteAccess(settings)) {
      elements.syncNotice.classList.add("synced");
      elements.syncNotice.innerHTML = `<span><strong>GitHub sync active:</strong> saving to ${escapeHtml(settings.owner)}/${escapeHtml(settings.repo)}.</span><button type="button" id="noticeSettings">Sync settings</button>`;
    } else if (hasRemoteConfig(settings)) {
      elements.syncNotice.classList.remove("synced");
      elements.syncNotice.innerHTML = `<span><strong>View-only mode:</strong> reading the shared history from GitHub.</span><button type="button" id="noticeSettings">Enable adding</button>`;
    } else {
      elements.syncNotice.classList.remove("synced");
      elements.syncNotice.innerHTML = `<span><strong>Local mode:</strong> entries are only saved on this browser.</span><button type="button" id="noticeSettings">Connect GitHub sync</button>`;
    }
    $("#noticeSettings").addEventListener("click", openSettings);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function normaliseMeetings(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => entry && entry.date && entry.runner)
      .map((entry) => ({
        id: String(entry.id || `${entry.date}-${entry.createdAt || Math.random()}`),
        date: String(entry.date),
        day: String(entry.day || parseLocalDate(entry.date).toLocaleDateString("en-GB", { weekday: "long" })),
        runner: String(entry.runner).slice(0, 80),
        emailWords: Math.max(0, Number(entry.emailWords) || 0),
        useful: String(entry.useful || "No"),
        score: Math.min(5, Math.max(1, Number(entry.score) || 1)),
        createdAt: String(entry.createdAt || `${entry.date}T12:00:00.000Z`)
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function readLocalMeetings() {
    try { return normaliseMeetings(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
    catch (_) { return []; }
  }

  function saveLocalMeetings(meetings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
  }

  async function fetchRemoteMeetings(settings = getSettings()) {
    const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${settings.dataPath}?ref=${encodeURIComponent(settings.branch)}&t=${Date.now()}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
    });
    if (!response.ok) throw new Error(response.status === 404 ? "meetings.json was not found in that repository." : `GitHub returned ${response.status}.`);
    const file = await response.json();
    return normaliseMeetings(JSON.parse(base64ToText(file.content)));
  }

  async function loadMeetings(showStatus = false) {
    const settings = getSettings();
    if (showStatus) setMessage(elements.formMessage, "Checking the latest evidence…");
    try {
      if (hasRemoteConfig(settings)) {
        state.meetings = await fetchRemoteMeetings(settings);
      } else {
        const response = await fetch(`meetings.json?t=${Date.now()}`, { cache: "no-store" });
        const seeded = response.ok ? normaliseMeetings(await response.json()) : [];
        const local = readLocalMeetings();
        state.meetings = normaliseMeetings([...seeded, ...local.filter((item) => !seeded.some((seed) => seed.id === item.id))]);
      }
      render();
      if (showStatus) setMessage(elements.formMessage, "Evidence refreshed.");
    } catch (error) {
      const local = readLocalMeetings();
      if (local.length) { state.meetings = local; render(); }
      if (showStatus) setMessage(elements.formMessage, error.message, true);
    }
  }

  function render() {
    elements.list.replaceChildren();
    const template = $("#meetingTemplate");

    state.meetings.forEach((meeting) => {
      const node = template.content.cloneNode(true);
      const date = parseLocalDate(meeting.date);
      node.querySelector(".meeting-day").textContent = meeting.day;
      node.querySelector(".meeting-date").textContent = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      node.querySelector(".meeting-runner").textContent = meeting.runner;
      node.querySelector(".meeting-words").textContent = meeting.emailWords.toLocaleString("en-GB");
      node.querySelector(".meeting-useful").textContent = `Useful? ${meeting.useful}`;
      const badge = node.querySelector(".score-badge");
      badge.textContent = `${meeting.score}/5`;
      badge.classList.toggle("bose", meeting.score === 5);
      node.querySelector(".score-description").textContent = SCORE_LABELS[meeting.score];
      elements.list.appendChild(node);
    });

    elements.empty.hidden = state.meetings.length > 0;
    $("#meetingCount").textContent = state.meetings.length.toLocaleString("en-GB");
    $("#totalWords").textContent = state.meetings.reduce((sum, meeting) => sum + meeting.emailWords, 0).toLocaleString("en-GB");
    const average = state.meetings.length ? state.meetings.reduce((sum, meeting) => sum + meeting.score, 0) / state.meetings.length : 0;
    $("#averageScore").textContent = average ? average.toFixed(1) : "—";
    $("#averageVerdict").textContent = average ? SCORE_LABELS[Math.min(5, Math.max(1, Math.round(average)))].toLowerCase() : "no evidence yet";
    $("#boseCount").textContent = state.meetings.filter((meeting) => meeting.score === 5).length.toLocaleString("en-GB");
    updateSyncNotice();
  }

  function bytesToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToText(value) {
    const binary = atob(value.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function commitMeetings(meetings, settings = getSettings()) {
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${settings.dataPath}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${settings.token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(settings.branch)}`, { headers, cache: "no-store" });
    if (!currentResponse.ok) throw new Error(currentResponse.status === 401 ? "GitHub rejected the token." : "Could not read meetings.json from GitHub.");
    const current = await currentResponse.json();
    const latestMeetings = normaliseMeetings(JSON.parse(base64ToText(current.content)));
    const newItems = meetings.filter((item) => !latestMeetings.some((existing) => existing.id === item.id));
    const merged = normaliseMeetings([...newItems, ...latestMeetings]);
    const updateResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Log pointless meeting: ${newItems[0]?.date || "update records"}`,
        content: bytesToBase64(`${JSON.stringify(merged, null, 2)}\n`),
        sha: current.sha,
        branch: settings.branch
      })
    });
    if (!updateResponse.ok) {
      const detail = await updateResponse.json().catch(() => ({}));
      throw new Error(detail.message || "GitHub could not save the entry.");
    }
    return merged;
  }

  async function saveMeeting(input) {
    if (state.syncing) throw new Error("A meeting is already being filed.");
    const dateValue = input.date;
    const date = parseLocalDate(dateValue);
    const meeting = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: dateValue,
      day: date.toLocaleDateString("en-GB", { weekday: "long" }),
      runner: input.runner.trim(),
      emailWords: Number(input.emailWords),
      useful: input.useful,
      score: Number(input.score),
      createdAt: new Date().toISOString()
    };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(meeting.date) || Number.isNaN(date.getTime())) throw new Error("Enter a valid meeting date.");
    if (!meeting.runner || meeting.runner.length > 80) throw new Error("Enter who ran the meeting (80 characters maximum).");
    if (!Number.isInteger(meeting.emailWords) || meeting.emailWords < 0 || meeting.emailWords > 100000) throw new Error("Email words must be a whole number from 0 to 100,000.");
    if (!["No", "Of course not", "OMG kill me"].includes(meeting.useful)) throw new Error("Choose one of the usefulness verdicts.");
    if (![1, 2, 3, 4, 5].includes(meeting.score)) throw new Error("Choose a uselessness score from 1 to 5.");

    state.syncing = true;
    elements.submitButton.disabled = true;
    elements.submitText.textContent = "Filing the evidence…";
    setMessage(elements.formMessage, "");

    try {
      const settings = getSettings();
      const updated = normaliseMeetings([meeting, ...state.meetings]);
      if (hasWriteAccess(settings)) {
        state.meetings = await commitMeetings(updated, settings);
        saveLocalMeetings(state.meetings);
        setMessage(elements.formMessage, "Filed permanently. Bureaucracy has been documented.");
      } else {
        state.meetings = updated;
        saveLocalMeetings(state.meetings);
        setMessage(elements.formMessage, "Saved on this browser. Connect GitHub to share it.");
      }
      elements.form.reset();
      elements.date.value = localToday();
      updateDayPreview();
      render();
      return meeting;
    } catch (error) {
      setMessage(elements.formMessage, error.message, true);
      throw error;
    } finally {
      state.syncing = false;
      elements.submitButton.disabled = false;
      elements.submitText.textContent = "Add to the evidence locker";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(elements.form);
    try {
      await saveMeeting({
        date: data.get("date"),
        runner: data.get("runner"),
        emailWords: Number(data.get("emailWords")),
        useful: data.get("useful"),
        score: Number(data.get("score"))
      });
    } catch (_) {
      // saveMeeting reports the error in the visible form.
    }
  }

  function updateDayPreview() {
    if (!elements.date.value) {
      elements.dayPreview.textContent = "Day will be calculated automatically";
      return;
    }
    elements.dayPreview.textContent = parseLocalDate(elements.date.value).toLocaleDateString("en-GB", { weekday: "long" });
  }

  function openSettings() {
    const settings = getSettings();
    $("#githubOwner").value = settings.owner;
    $("#githubRepo").value = settings.repo;
    $("#githubBranch").value = settings.branch;
    $("#githubToken").value = settings.token;
    setMessage(elements.settingsMessage, "");
    elements.dialog.showModal();
  }

  async function saveSettings(event) {
    event.preventDefault();
    const settings = {
      owner: $("#githubOwner").value.trim(),
      repo: $("#githubRepo").value.trim(),
      branch: $("#githubBranch").value.trim() || "main",
      token: $("#githubToken").value.trim()
    };
    setMessage(elements.settingsMessage, "Testing the connection…");
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${settings.token}`, "X-GitHub-Api-Version": "2022-11-28" };
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/meetings.json?ref=${encodeURIComponent(settings.branch)}`, { headers, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Token rejected. Check it and try again." : "Could not find meetings.json in that repository.");
      setMessage(elements.settingsMessage, "Connected. Future nonsense will be preserved.");
      await loadMeetings(false);
      setTimeout(() => elements.dialog.close(), 750);
    } catch (error) {
      setMessage(elements.settingsMessage, error.message, true);
    }
  }

  function disconnectSync() {
    localStorage.removeItem(SETTINGS_KEY);
    $("#githubToken").value = "";
    setMessage(elements.settingsMessage, "Disconnected. Local mode restored.");
    updateSyncNotice();
  }

  elements.date.value = localToday();
  updateDayPreview();
  elements.date.addEventListener("change", updateDayPreview);
  elements.form.addEventListener("submit", handleSubmit);
  elements.settingsForm.addEventListener("submit", saveSettings);
  $("#openSettings").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", () => elements.dialog.close());
  $("#noticeSettings").addEventListener("click", openSettings);
  $("#disconnectSync").addEventListener("click", disconnectSync);
  $("#refreshData").addEventListener("click", () => loadMeetings(true));
  loadMeetings(false);

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const allowedUseful = ["No", "Of course not", "OMG kill me"];

    void Promise.resolve(context.registerTool({
      name: "list_pointless_meetings",
      title: "List pointless meetings",
      description: "Return the meetings currently shown in the SISB Pointless Meeting Tracker.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        return { count: state.meetings.length, meetings: state.meetings };
      }
    })).catch(() => {});

    void Promise.resolve(context.registerTool({
      name: "log_pointless_meeting",
      title: "Log a pointless meeting",
      description: "Add one meeting to the tracker using the same validation and storage as the visible form.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Meeting date in YYYY-MM-DD format." },
          runner: { type: "string", minLength: 1, maxLength: 80 },
          emailWords: { type: "integer", minimum: 0, maximum: 100000 },
          useful: { type: "string", enum: allowedUseful },
          score: { type: "integer", minimum: 1, maximum: 5 }
        },
        required: ["date", "runner", "emailWords", "useful", "score"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || typeof input !== "object") throw new Error("Meeting details are required.");
        const meeting = await saveMeeting(input);
        return { saved: true, id: meeting.id, storage: hasWriteAccess() ? "github" : "this browser" };
      }
    })).catch(() => {});
  }

  registerWebMcpTools();
})();
