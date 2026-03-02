import * as sdk from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key";

// ── DOM refs ──────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const loginScreen = $("#login-screen");
const appScreen = $("#app-screen");
const loginForm = $("#login-form");
const loginError = $("#login-error");
const loginBtn = $("#login-btn");
const serverUrlInput = $("#server-url");
const usernameInput = $("#username");
const passwordInput = $("#password");
const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebar-overlay");
const sidebarToggle = $("#sidebar-toggle");
const roomList = $("#room-list");
const roomSearch = $("#room-search");
const roomNameEl = $("#room-name");
const userDisplayName = $("#user-display-name");
const logoutBtn = $("#logout-btn");
const timeline = $("#timeline");
const typingIndicator = $("#typing-indicator");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const fileInput = $("#file-input");
const lightbox = $("#lightbox");
const lightboxContent = $("#lightbox-content");
const lightboxClose = $("#lightbox-close");
const cryptoBanner = $("#crypto-banner");
const enterRecoveryKeyBtn = $("#enter-recovery-key");
const recoveryModal = $("#recovery-modal");
const recoveryKeyInput = $("#recovery-key-input");
const recoveryError = $("#recovery-error");
const recoveryCancelBtn = $("#recovery-cancel");
const recoverySubmitBtn = $("#recovery-submit");
const roomListLoader = $("#room-list-loader");

// ── State ─────────────────────────────────────────────────────────────
let client = null;
let currentRoomId = null;
let renderedEventIds = new Set();
let eventElements = new Map();
let typingTimeout = null;
let cryptoAvailable = false;
let recoveryKeyBytes = null;
let recoveryKeyResolve = null;
const blobUrlCache = new Map();
let isBackPaginating = false;
let historyControlsEl = null;

// ── Persistence helpers ───────────────────────────────────────────────
function saveSession(data) {
  localStorage.setItem("matrix_session", JSON.stringify(data));
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem("matrix_session"));
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("matrix_session");
}

// ── Boot ──────────────────────────────────────────────────────────────
const session = loadSession();
if (session) {
  initClient(session);
} else {
  loginScreen.classList.add("active");
}

// ── Login ─────────────────────────────────────────────────────────────
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Signing in…";

  const baseUrl = serverUrlInput.value.replace(/\/+$/, "");
  const user = usernameInput.value.trim();
  const pass = passwordInput.value;

  try {
    const tempClient = sdk.createClient({ baseUrl });
    const resp = await tempClient.login("m.login.password", {
      user,
      password: pass,
      initial_device_display_name: "Matrix Mini Client",
    });
    const sessionData = {
      baseUrl,
      userId: resp.user_id,
      accessToken: resp.access_token,
      deviceId: resp.device_id,
    };
    saveSession(sessionData);
    tempClient.stopClient();
    initClient(sessionData);
  } catch (err) {
    loginError.textContent = err.message || "Login failed";
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Sign in";
  }
});

// ── Logout ────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
  if (!confirm("Sign out?")) return;
  for (const entry of blobUrlCache.values()) {
    Promise.resolve(entry).then((url) => { if (url) URL.revokeObjectURL(url); });
  }
  blobUrlCache.clear();
  if (client) {
    client.stopClient();
    client.logout(true).catch(() => {});
  }
  clearSession();
  location.reload();
});

// ── Init client ───────────────────────────────────────────────────────
async function initClient({ baseUrl, userId, accessToken, deviceId }) {
  client = sdk.createClient({
    baseUrl,
    userId,
    accessToken,
    deviceId,
    timelineSupport: true,
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => {
        if (recoveryKeyBytes) {
          const keyId = Object.keys(keys)[0];
          return [keyId, recoveryKeyBytes];
        }
        return new Promise((resolve) => {
          recoveryKeyResolve = (decoded) => {
            if (decoded) {
              const keyId = Object.keys(keys)[0];
              resolve([keyId, decoded]);
            } else {
              resolve(null);
            }
          };
          showRecoveryModal();
        });
      },
      cacheSecretStorageKey: (_keyId, _keyInfo, key) => {
        recoveryKeyBytes = key;
      },
    },
  });

  loginScreen.classList.remove("active");
  appScreen.classList.add("active");

  const profile = await client.getProfileInfo(userId).catch(() => ({}));
  userDisplayName.textContent = profile.displayname || userId;

  try {
    await client.initRustCrypto();
    cryptoAvailable = true;
  } catch (err) {
    console.warn("Crypto init failed, encrypted messages won't be decryptable:", err);
  }

  roomListLoader.classList.add("active");

  client.on(sdk.ClientEvent.Sync, (state) => {
    if (state === "PREPARED" || state === "SYNCING") {
      roomListLoader.classList.remove("active");
      renderRoomList();
    }
  });

  client.on(sdk.RoomEvent.Timeline, (event, room, toStartOfTimeline) => {
    if (!toStartOfTimeline && room?.roomId === currentRoomId) {
      appendTimelineEvent(event);
      scrollTimelineToBottom();
    }
    renderRoomList();
  });

  client.on(sdk.RoomEvent.Name, () => {
    renderRoomList();
    if (currentRoomId) {
      const r = client.getRoom(currentRoomId);
      if (r) roomNameEl.textContent = r.name;
    }
  });

  client.on(sdk.RoomMemberEvent.Typing, (_event, member) => {
    if (member.roomId !== currentRoomId) return;
    showTyping();
  });

  client.on(sdk.RoomEvent.Receipt, () => renderRoomList());
  client.on(sdk.RoomEvent.MyMembership, () => renderRoomList());

  await client.startClient({ initialSyncLimit: 30 });
}

// ── Room list ─────────────────────────────────────────────────────────
function renderRoomList() {
  const rooms = client.getRooms() || [];
  const filter = roomSearch.value.toLowerCase();
  const joined = rooms
    .filter((r) => r.getMyMembership() === "join")
    .filter((r) => !filter || r.name.toLowerCase().includes(filter))
    .sort((a, b) => {
      const tsA = a.getLastActiveTimestamp() ?? 0;
      const tsB = b.getLastActiveTimestamp() ?? 0;
      return tsB - tsA;
    });

  roomList.innerHTML = "";
  for (const room of joined) {
    const li = document.createElement("li");
    if (room.roomId === currentRoomId) li.classList.add("active");

    const notif = room.getUnreadNotificationCount("total") || 0;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "room-avatar";
    const avatarMxc = room.getMxcAvatarUrl();
    if (avatarMxc) {
      const img = document.createElement("img");
      img.alt = "";
      avatarDiv.appendChild(img);
      fetchAuthenticatedMedia(avatarMxc, 34, 34, "crop").then((blobUrl) => {
        if (blobUrl) img.src = blobUrl;
        else avatarDiv.textContent = (room.name || "?")[0].toUpperCase();
      });
    } else {
      avatarDiv.textContent = (room.name || "?")[0].toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "room-info";
    const label = document.createElement("div");
    label.className = "room-label";
    label.textContent = room.name || room.roomId;
    info.appendChild(label);

    const lastEvent = room.timeline[room.timeline.length - 1];
    if (lastEvent) {
      const preview = document.createElement("div");
      preview.className = "room-preview";
      preview.textContent = getEventPreview(lastEvent);
      info.appendChild(preview);
    }

    li.appendChild(avatarDiv);
    li.appendChild(info);

    if (notif > 0) {
      const badge = document.createElement("div");
      badge.className = "room-badge";
      badge.textContent = notif > 99 ? "99+" : notif;
      li.appendChild(badge);
    }

    li.addEventListener("click", () => selectRoom(room.roomId));
    roomList.appendChild(li);
  }
}

roomSearch.addEventListener("input", renderRoomList);

function getEventPreview(event) {
  if (isUndecryptedEvent(event)) {
    const sender = shortName(event.getSender());
    return `${sender}: 🔒 Encrypted`;
  }
  const content = event.getContent();
  if (event.getType() !== "m.room.message") return "";
  const sender = shortName(event.getSender());
  switch (content.msgtype) {
    case "m.image":
      return `${sender}: 📷 Image`;
    case "m.video":
      return `${sender}: 🎬 Video`;
    case "m.file":
      return `${sender}: 📎 File`;
    default:
      return `${sender}: ${content.body || ""}`;
  }
}

function shortName(userId) {
  if (!userId) return "";
  if (!client) return userId;
  const member = client.getUser(userId);
  const name = member?.displayName || userId;
  return name.split(":")[0].replace("@", "");
}

// ── Select room ───────────────────────────────────────────────────────
function selectRoom(roomId) {
  currentRoomId = roomId;
  renderedEventIds.clear();
  eventElements.clear();
  cryptoBanner.hidden = true;
  const room = client.getRoom(roomId);
  roomNameEl.textContent = room?.name || roomId;
  messageForm.hidden = false;
  timeline.innerHTML = "";
  closeSidebar();

  if (room) {
    insertHistoryControls(room);

    let hasUndecryptable = false;
    const events = room.getLiveTimeline().getEvents();
    let lastDateStr = null;
    for (const ev of events) {
      const dateStr = formatDate(ev.getDate());
      if (dateStr !== lastDateStr) {
        appendDateSeparator(dateStr);
        lastDateStr = dateStr;
      }
      appendTimelineEvent(ev);
      if (isUndecryptedEvent(ev)) hasUndecryptable = true;
    }
    if (hasUndecryptable) cryptoBanner.hidden = false;
    scrollTimelineToBottom(true);
  }

  renderRoomList();
}

// ── History / back-pagination ─────────────────────────────────────────
function createHistoryControls() {
  const container = document.createElement("div");
  container.className = "history-controls";

  const btnRow = document.createElement("div");
  btnRow.className = "history-btn-row";

  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.className = "history-btn";
  loadMoreBtn.textContent = "Load previous messages";
  loadMoreBtn.addEventListener("click", () => loadPreviousMessages());

  const dateToggleBtn = document.createElement("button");
  dateToggleBtn.className = "history-btn";
  dateToggleBtn.textContent = "Load to date\u2026";

  btnRow.appendChild(loadMoreBtn);
  btnRow.appendChild(dateToggleBtn);

  const dateRow = document.createElement("div");
  dateRow.className = "history-date-row";
  dateRow.hidden = true;

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "history-date-input";
  dateInput.max = new Date().toISOString().split("T")[0];

  const goBtn = document.createElement("button");
  goBtn.className = "history-btn history-btn-accent";
  goBtn.textContent = "Go";
  goBtn.addEventListener("click", () => {
    if (dateInput.value) {
      loadMessagesToDate(new Date(dateInput.value + "T00:00:00"));
    }
  });

  dateToggleBtn.addEventListener("click", () => {
    dateRow.hidden = !dateRow.hidden;
    if (!dateRow.hidden) dateInput.focus();
  });

  dateRow.appendChild(dateInput);
  dateRow.appendChild(goBtn);

  const spinnerEl = document.createElement("div");
  spinnerEl.className = "spinner history-spinner";
  spinnerEl.hidden = true;

  const endMsg = document.createElement("div");
  endMsg.className = "history-end";
  endMsg.textContent = "Beginning of conversation";
  endMsg.hidden = true;

  container.appendChild(btnRow);
  container.appendChild(dateRow);
  container.appendChild(spinnerEl);
  container.appendChild(endMsg);

  container._btnRow = btnRow;
  container._dateRow = dateRow;
  container._spinner = spinnerEl;
  container._endMsg = endMsg;

  return container;
}

function getHistoryControls() {
  if (!historyControlsEl) historyControlsEl = createHistoryControls();
  return historyControlsEl;
}

function insertHistoryControls(room) {
  const el = getHistoryControls();
  const canPaginate = !!room.getLiveTimeline().getPaginationToken("b");
  el._btnRow.hidden = !canPaginate;
  el._dateRow.hidden = true;
  el._spinner.hidden = true;
  el._endMsg.hidden = canPaginate;
  timeline.prepend(el);
}

function updateHistoryControlsLoading(loading) {
  const el = getHistoryControls();
  el._spinner.hidden = !loading;
  el._btnRow.hidden = loading;
  if (loading) el._dateRow.hidden = true;
}

function updateHistoryControlsDone(room) {
  const el = getHistoryControls();
  const canPaginate = !!room.getLiveTimeline().getPaginationToken("b");
  el._spinner.hidden = true;
  el._btnRow.hidden = !canPaginate;
  el._dateRow.hidden = true;
  el._endMsg.hidden = canPaginate;
}

async function loadPreviousMessages(limit = 30) {
  if (isBackPaginating || !currentRoomId) return;
  const room = client.getRoom(currentRoomId);
  if (!room) return;

  const token = room.getLiveTimeline().getPaginationToken("b");
  if (!token) return;

  isBackPaginating = true;
  updateHistoryControlsLoading(true);

  try {
    await client.scrollback(room, limit);
    rerenderTimeline();
  } catch (err) {
    console.error("Failed to load previous messages:", err);
  } finally {
    isBackPaginating = false;
    updateHistoryControlsDone(room);
  }
}

async function loadMessagesToDate(targetDate) {
  if (isBackPaginating || !currentRoomId) return;
  const room = client.getRoom(currentRoomId);
  if (!room) return;

  isBackPaginating = true;
  updateHistoryControlsLoading(true);

  try {
    while (true) {
      const events = room.getLiveTimeline().getEvents();
      const oldest = events[0];

      if (oldest?.getDate() && oldest.getDate() <= targetDate) break;

      const token = room.getLiveTimeline().getPaginationToken("b");
      if (!token) break;

      await client.scrollback(room, 50);
    }
    rerenderTimeline();
  } catch (err) {
    console.error("Failed to load messages to date:", err);
  } finally {
    isBackPaginating = false;
    updateHistoryControlsDone(room);
  }
}

function rerenderTimeline() {
  const room = client.getRoom(currentRoomId);
  if (!room) return;

  const scrollHeightBefore = timeline.scrollHeight;
  const scrollTopBefore = timeline.scrollTop;

  renderedEventIds.clear();
  eventElements.clear();
  timeline.innerHTML = "";

  insertHistoryControls(room);

  const events = room.getLiveTimeline().getEvents();
  let lastDateStr = null;
  let hasUndecryptable = false;

  for (const ev of events) {
    const dateStr = formatDate(ev.getDate());
    if (dateStr !== lastDateStr) {
      appendDateSeparator(dateStr);
      lastDateStr = dateStr;
    }
    appendTimelineEvent(ev);
    if (isUndecryptedEvent(ev)) hasUndecryptable = true;
  }

  if (hasUndecryptable) cryptoBanner.hidden = false;

  timeline.scrollTop = timeline.scrollHeight - scrollHeightBefore + scrollTopBefore;
}

// ── Encryption helpers ────────────────────────────────────────────────
function isUndecryptedEvent(event) {
  return event.getType() === "m.room.encrypted" || event.isDecryptionFailure();
}

// ── Timeline rendering ───────────────────────────────────────────────
function appendTimelineEvent(event) {
  if (renderedEventIds.has(event.getId())) return;
  renderedEventIds.add(event.getId());

  const type = event.getType();
  const undecrypted = isUndecryptedEvent(event);

  if (type !== "m.room.message" && !undecrypted) return;

  const content = event.getContent();
  if (type === "m.room.message" && (!content || !content.msgtype)) return;

  const isMe = event.getSender() === client.getUserId();
  const div = document.createElement("div");
  div.className = `msg ${isMe ? "outgoing" : "incoming"}`;

  if (!isMe) {
    const senderEl = document.createElement("div");
    senderEl.className = "msg-sender";
    senderEl.textContent = shortName(event.getSender());
    div.appendChild(senderEl);
  }

  const body = document.createElement("div");
  body.className = "msg-body";

  if (undecrypted) {
    body.classList.add("encrypted");
    const lock = document.createElement("span");
    lock.className = "lock-icon";
    lock.textContent = "🔒";
    body.appendChild(lock);
    body.appendChild(document.createTextNode(" Unable to decrypt"));
    cryptoBanner.hidden = false;

    event.on(sdk.MatrixEventEvent.Decrypted, () => {
      refreshDecryptedEvent(event);
    });
  } else {
    renderMessageBody(body, content);
  }

  div.appendChild(body);

  const timeEl = document.createElement("div");
  timeEl.className = "msg-time";
  timeEl.textContent = formatTime(event.getDate());
  div.appendChild(timeEl);

  timeline.appendChild(div);
  eventElements.set(event.getId(), div);
}

function renderMessageBody(container, content) {
  switch (content.msgtype) {
    case "m.image":
      renderImage(container, content);
      break;
    case "m.video":
      renderVideo(container, content);
      break;
    default:
      container.textContent = content.body || "";
  }
}

function refreshDecryptedEvent(event) {
  const div = eventElements.get(event.getId());
  if (!div) return;

  if (event.isDecryptionFailure()) return;

  const content = event.getContent();
  if (event.getType() !== "m.room.message" || !content?.msgtype) return;

  const body = div.querySelector(".msg-body");
  if (!body) return;

  body.classList.remove("encrypted");
  body.innerHTML = "";
  renderMessageBody(body, content);
}

function renderImage(container, content) {
  const mediaUrl = getMediaUrl(content);
  if (!mediaUrl || !client) {
    container.textContent = content.body || "[image]";
    return;
  }
  const img = document.createElement("img");
  img.alt = content.body || "image";
  img.loading = "lazy";
  img.addEventListener("click", () => openLightbox("image", content));
  container.appendChild(img);

  const hasThumbnail = !!(content.info?.thumbnail_url || content.info?.thumbnail_file);
  const fetchOpts = hasThumbnail ? { thumbnail: true } : {};
  fetchMedia(content, fetchOpts).then((blobUrl) => {
    if (blobUrl) {
      img.src = blobUrl;
    } else {
      img.replaceWith(document.createTextNode(content.body || "[image]"));
    }
  });
}

function renderVideo(container, content) {
  const mediaUrl = getMediaUrl(content);
  if (!mediaUrl || !client) {
    container.textContent = content.body || "[video]";
    return;
  }
  const video = document.createElement("video");
  video.controls = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.addEventListener("click", (e) => {
    if (e.detail === 2) {
      e.preventDefault();
      openLightbox("video", content);
    }
  });
  container.appendChild(video);

  fetchMedia(content).then((blobUrl) => {
    if (blobUrl) {
      video.src = blobUrl;
    } else {
      video.replaceWith(document.createTextNode(content.body || "[video]"));
    }
  });

  const hasThumbnail = !!(content.info?.thumbnail_url || content.info?.thumbnail_file);
  if (hasThumbnail) {
    fetchMedia(content, { thumbnail: true }).then((blobUrl) => {
      if (blobUrl) video.poster = blobUrl;
    });
  }
}

function getMediaUrl(content) {
  return content.url || content.file?.url || null;
}

function getMediaFile(content) {
  return content.file || null;
}

function getThumbnailUrl(content) {
  return content.info?.thumbnail_url || content.info?.thumbnail_file?.url || null;
}

function getThumbnailFile(content) {
  return content.info?.thumbnail_file || null;
}

function fetchMedia(content, { thumbnail = false, width, height, resizeMethod } = {}) {
  const encFile = thumbnail ? getThumbnailFile(content) : getMediaFile(content);
  const mxcUrl = thumbnail
    ? (getThumbnailUrl(content) || getMediaUrl(content))
    : getMediaUrl(content);

  if (encFile) {
    const mimetype = thumbnail
      ? (content.info?.thumbnail_info?.mimetype || content.info?.mimetype)
      : content.info?.mimetype;
    return fetchAndDecryptMedia(encFile, mimetype, width, height, resizeMethod);
  }
  return fetchAuthenticatedMedia(mxcUrl, width, height, resizeMethod);
}

function fetchAuthenticatedMedia(mxcUrl, width, height, resizeMethod) {
  if (!mxcUrl || !client) return Promise.resolve(null);
  const cacheKey = `${mxcUrl}|${width || ""}|${height || ""}|${resizeMethod || ""}`;
  if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);

  const httpUrl = client.mxcUrlToHttp(mxcUrl, width, height, resizeMethod, false, true, true);
  if (!httpUrl) return Promise.resolve(null);

  const promise = fetch(httpUrl, {
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  })
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => {
      blobUrlCache.delete(cacheKey);
      return null;
    });

  blobUrlCache.set(cacheKey, promise);
  return promise;
}

function base64UrlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToUint8Array(base64) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decryptAttachment(encryptedData, fileInfo) {
  const keyData = base64UrlToUint8Array(fileInfo.key.k);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "AES-CTR" }, false, ["decrypt"]
  );
  const iv = base64ToUint8Array(fileInfo.iv);
  // AES-CTR uses a 128-bit counter block; the spec sets the lower 64 bits as counter
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    cryptoKey,
    encryptedData
  );
  return new Uint8Array(decrypted);
}

function fetchAndDecryptMedia(encFile, mimetype, width, height, resizeMethod) {
  const mxcUrl = encFile.url;
  if (!mxcUrl || !client) return Promise.resolve(null);
  const cacheKey = `enc|${mxcUrl}`;
  if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);

  const httpUrl = client.mxcUrlToHttp(mxcUrl, width, height, resizeMethod, false, true, true);
  if (!httpUrl) return Promise.resolve(null);

  const promise = fetch(httpUrl, {
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  })
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.arrayBuffer();
    })
    .then((encrypted) => decryptAttachment(encrypted, encFile))
    .then((decrypted) => {
      const blob = new Blob([decrypted], { type: mimetype || "application/octet-stream" });
      return URL.createObjectURL(blob);
    })
    .catch((err) => {
      console.error("Failed to decrypt media:", err);
      blobUrlCache.delete(cacheKey);
      return null;
    });

  blobUrlCache.set(cacheKey, promise);
  return promise;
}

function appendDateSeparator(dateStr) {
  const div = document.createElement("div");
  div.className = "day-separator";
  div.textContent = dateStr;
  timeline.appendChild(div);
}

function scrollTimelineToBottom(instant) {
  requestAnimationFrame(() => {
    timeline.scrollTo({
      top: timeline.scrollHeight,
      behavior: instant ? "instant" : "smooth",
    });
  });
}

// ── Typing indicator ─────────────────────────────────────────────────
function showTyping() {
  if (!currentRoomId) return;
  const room = client.getRoom(currentRoomId);
  if (!room) return;
  const members = room.currentState.getMembers();
  const typing = members.filter(
    (m) => m.typing && m.userId !== client.getUserId()
  );
  if (typing.length) {
    typingIndicator.hidden = false;
    typingIndicator.textContent =
      typing.map((m) => shortName(m.userId)).join(", ") + " typing…";
  } else {
    typingIndicator.hidden = true;
  }
}

// ── Send message ─────────────────────────────────────────────────────
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = messageInput.value.trim();
  if (!body || !currentRoomId) return;
  messageInput.value = "";

  try {
    await client.sendEvent(currentRoomId, "m.room.message", {
      msgtype: "m.text",
      body,
    });
  } catch (err) {
    console.error("Send failed:", err);
  }
});

messageInput.addEventListener("input", () => {
  if (!currentRoomId) return;
  client.sendTyping(currentRoomId, true, 4000).catch(() => {});
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    client.sendTyping(currentRoomId, false, 0).catch(() => {});
  }, 3500);
});

// ── File upload ──────────────────────────────────────────────────────
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || !currentRoomId) return;
  fileInput.value = "";

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    alert("Only images and videos are supported.");
    return;
  }

  const toast = document.createElement("div");
  toast.className = "upload-toast";
  toast.textContent = "Uploading…";
  document.body.appendChild(toast);

  try {
    const uploadResp = await client.uploadContent(file, {
      name: file.name,
      type: file.type,
      progressHandler: ({ loaded, total }) => {
        const pct = Math.round((loaded / total) * 100);
        toast.textContent = `Uploading… ${pct}%`;
      },
    });

    const mxcUrl = uploadResp.content_uri;

    if (isImage) {
      const info = { mimetype: file.type, size: file.size };
      const dims = await getImageDimensions(file);
      if (dims) {
        info.w = dims.width;
        info.h = dims.height;
      }
      await client.sendEvent(currentRoomId, "m.room.message", {
        msgtype: "m.image",
        body: file.name,
        url: mxcUrl,
        info,
      });
    } else {
      const info = { mimetype: file.type, size: file.size };
      const dims = await getVideoDimensions(file);
      if (dims) {
        info.w = dims.width;
        info.h = dims.height;
        info.duration = dims.duration;
      }
      await client.sendEvent(currentRoomId, "m.room.message", {
        msgtype: "m.video",
        body: file.name,
        url: mxcUrl,
        info,
      });
    }
  } catch (err) {
    console.error("Upload failed:", err);
    alert("Upload failed: " + (err.message || err));
  } finally {
    toast.remove();
  }
});

function getImageDimensions(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

function getVideoDimensions(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration * 1000),
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve(null);
    video.src = URL.createObjectURL(file);
  });
}

// ── Lightbox ─────────────────────────────────────────────────────────
async function openLightbox(type, content) {
  lightboxContent.innerHTML = "";
  lightbox.hidden = false;

  const blobUrl = await fetchMedia(content);
  if (!blobUrl) {
    closeLightbox();
    return;
  }

  if (type === "image") {
    const img = document.createElement("img");
    img.src = blobUrl;
    lightboxContent.appendChild(img);
  } else {
    const video = document.createElement("video");
    video.src = blobUrl;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    lightboxContent.appendChild(video);
  }
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

function closeLightbox() {
  lightbox.hidden = true;
  lightboxContent.innerHTML = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
});

// ── Sidebar toggle (mobile) ──────────────────────────────────────────
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

sidebarOverlay.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
}

// ── Recovery key modal ────────────────────────────────────────────────
function showRecoveryModal() {
  recoveryModal.hidden = false;
  recoveryKeyInput.value = "";
  recoveryError.hidden = true;
  recoverySubmitBtn.disabled = false;
  recoverySubmitBtn.textContent = "Restore Keys";
  recoveryKeyInput.focus();
}

function hideRecoveryModal() {
  recoveryModal.hidden = true;
  recoveryKeyInput.value = "";
  recoveryError.hidden = true;
}

enterRecoveryKeyBtn.addEventListener("click", () => {
  showRecoveryModal();
});

recoveryCancelBtn.addEventListener("click", () => {
  hideRecoveryModal();
  if (recoveryKeyResolve) {
    recoveryKeyResolve(null);
    recoveryKeyResolve = null;
  }
});

recoveryModal.addEventListener("click", (e) => {
  if (e.target === recoveryModal) {
    hideRecoveryModal();
    if (recoveryKeyResolve) {
      recoveryKeyResolve(null);
      recoveryKeyResolve = null;
    }
  }
});

recoverySubmitBtn.addEventListener("click", async () => {
  const keyStr = recoveryKeyInput.value.trim();
  if (!keyStr) return;

  let decoded;
  try {
    decoded = decodeRecoveryKey(keyStr);
  } catch {
    recoveryError.textContent = "Invalid recovery key format";
    recoveryError.hidden = false;
    return;
  }

  recoveryKeyBytes = decoded;

  if (recoveryKeyResolve) {
    recoveryKeyResolve(decoded);
    recoveryKeyResolve = null;
    hideRecoveryModal();
    return;
  }

  const crypto = client?.getCrypto();
  if (!crypto) {
    recoveryError.textContent = "Encryption is not available";
    recoveryError.hidden = false;
    return;
  }

  recoverySubmitBtn.disabled = true;
  recoverySubmitBtn.textContent = "Restoring…";
  recoveryError.hidden = true;

  try {
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    hideRecoveryModal();
    cryptoBanner.hidden = true;
  } catch (err) {
    recoveryKeyBytes = null;
    recoveryError.textContent = err.message || "Failed to restore keys";
    recoveryError.hidden = false;
    recoverySubmitBtn.disabled = false;
    recoverySubmitBtn.textContent = "Restore Keys";
  }
});

// ── Helpers ───────────────────────────────────────────────────────────
function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date) {
  if (!date) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
