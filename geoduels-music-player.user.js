// ==UserScript==
// @name         GeoDuels Lofi / Chill Player (with Custom MP3)
// @namespace    https://geoduels.io/
// @version      3.9.4
// @description  Modern music player for GeoDuels with stable Lobby detection, startup playback modes, Ranked and Party detection, custom MP3 upload with looping, and a glass UI.
// @match        https://geoduels.io/*
// @match        https://*.geoduels.io/*
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;

    const KEY = "geoduels-lofi-player:v3.4";
    const DB_NAME = "GeoDuelsPlayerDB";
    const DB_STORE = "custom_tracks";

    const DEFAULT_STREAMS = [
        { name: "Chillsynth", url: "https://stream.nightride.fm/chillsynth.mp3", isCustom: false },
        { name: "Groove Salad (Lofi / Chill)", url: "https://ice6.somafm.com/groovesalad-128-mp3", isCustom: false },
        { name: "Synthwave", url: "https://stream.nightride.fm/nightride.mp3", isCustom: false },
        { name: "Vaporwaves", url: "https://ice6.somafm.com/vaporwaves-128-mp3", isCustom: false },
        { name: "Drone Zone (Ambient)", url: "https://ice6.somafm.com/dronezone-128-mp3", isCustom: false },
        { name: "Secret Agent (Lounge)", url: "https://ice6.somafm.com/secretagent-128-mp3", isCustom: false },
        { name: "Spacesynth", url: "https://stream.nightride.fm/spacesynth.mp3", isCustom: false },
        { name: "DEF CON (Chill Beats)", url: "https://ice6.somafm.com/defcon-128-mp3", isCustom: false }
    ];

    let STREAMS = [...DEFAULT_STREAMS];
    let customTracks = [];

    const defaults = {
        volume: 0.55,
        startupMode: "always",
        userWantsPlaying: true,
        autoHideInactive: true,
        disabled: false,
        uiHidden: false,
        streamIndex: 0,
        scopes: { lobby: true, single: false, rankduel: false, partyduel: false },
        position: null,
        youtubePlaylistId: "",
        youtubeVideoId: "",
        youtubeMediaType: "playlist",
        youtubeEnabled: false,
        externalAudioUrl: "",
        externalAudioTitle: ""
    };

    function parse(raw) {
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    }

    const saved = parse(localStorage.getItem(KEY)) || {};

    let resolvedStartupMode = defaults.startupMode;
    if (typeof saved.startupMode === "string" && ["always", "never", "remember"].includes(saved.startupMode)) {
        resolvedStartupMode = saved.startupMode;
    } else if (typeof saved.autoplay === "boolean") {
        resolvedStartupMode = saved.autoplay ? "always" : "never";
    }

    let initialPlayingState = defaults.userWantsPlaying;
    if (resolvedStartupMode === "always") {
        initialPlayingState = true;
    } else if (resolvedStartupMode === "never") {
        initialPlayingState = false;
    } else if (resolvedStartupMode === "remember") {
        initialPlayingState = typeof saved.userWantsPlaying === "boolean" ? saved.userWantsPlaying : defaults.userWantsPlaying;
    }

    const settings = {
        volume: Number.isFinite(saved.volume) ? saved.volume : defaults.volume,
        startupMode: resolvedStartupMode,
        userWantsPlaying: initialPlayingState,
        autoHideInactive: typeof saved.autoHideInactive === "boolean" ? saved.autoHideInactive : defaults.autoHideInactive,
        disabled: typeof saved.disabled === "boolean" ? saved.disabled : defaults.disabled,
        uiHidden: typeof saved.uiHidden === "boolean" ? saved.uiHidden : defaults.uiHidden,
        streamIndex: Number.isInteger(saved.streamIndex) && saved.streamIndex >= 0 ? saved.streamIndex : defaults.streamIndex,
        scopes: { ...defaults.scopes, ...(saved.scopes || {}) },
        position: saved.position || null,
        youtubePlaylistId: typeof saved.youtubePlaylistId === "string" ? saved.youtubePlaylistId : defaults.youtubePlaylistId,
        youtubeVideoId: typeof saved.youtubeVideoId === "string" ? saved.youtubeVideoId : defaults.youtubeVideoId,
        youtubeMediaType: saved.youtubeMediaType === "video" ? "video" : defaults.youtubeMediaType,
        youtubeEnabled: typeof saved.youtubeEnabled === "boolean" ? saved.youtubeEnabled : defaults.youtubeEnabled,
        externalAudioUrl: typeof saved.externalAudioUrl === "string" ? saved.externalAudioUrl : defaults.externalAudioUrl,
        externalAudioTitle: typeof saved.externalAudioTitle === "string" ? saved.externalAudioTitle : defaults.externalAudioTitle
    };

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE, { keyPath: "id", autoIncrement: true });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbSaveTrack(name, blob) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            const store = tx.objectStore(DB_STORE);
            const req = store.add({ name, blob });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbGetTracks() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readonly");
            const store = tx.objectStore(DB_STORE);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbDeleteTrack(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            const store = tx.objectStore(DB_STORE);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function loadCustomTracksFromDB() {
        try {
            const records = await dbGetTracks();
            customTracks.forEach(t => { if (t.url) URL.revokeObjectURL(t.url); });
            customTracks = records.map(r => ({
                id: r.id,
                name: `📁 [Custom] ${r.name}`,
                blob: r.blob,
                url: URL.createObjectURL(r.blob),
                isCustom: true
            }));
            rebuildStreamsList();
        } catch (e) {
            console.error("Failed to load tracks from DB", e);
        }
    }

    function rebuildStreamsList() {
        STREAMS = [...customTracks, ...DEFAULT_STREAMS];
        if (settings.streamIndex >= STREAMS.length) {
            settings.streamIndex = 0;
        }
        updateSelectOptions();
    }

    function currentStream() {
        return STREAMS[settings.streamIndex] || STREAMS[0];
    }

    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, settings.volume));
    initializeAudioSource();

    audio.addEventListener("ended", () => {
        if (currentStream().isCustom && settings.userWantsPlaying) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    });

    let root, playButton, settingsButton, minimizeButton, panel, volumeSlider, autoHideInput, streamSelect, fileInput, deleteBtn;
    let expanded = false;
    let pendingAutoplay = false;
    let launchContext = null;
    let youtubeFrame = null;
    let youtubePlaylistInput = null;
    let youtubeEnabledInput = null;
    let youtubePlaying = false;
    let youtubeEmbedButton = null;
    let mp3ModeButton = null;
    let youtubeModeButton = null;
    let lastContext = null;
    let returnToLobbyState = null;
    try {
        const storedReturnState = sessionStorage.getItem("geoduels-lofi-return-state");
        if (storedReturnState) returnToLobbyState = JSON.parse(storedReturnState);
    } catch (_) {
        returnToLobbyState = null;
    }

    try {
        const rememberedLaunchContext = sessionStorage.getItem("geoduels-lofi-launch-context");
        if (["single", "rankduel", "partyduel"].includes(rememberedLaunchContext)) {
            launchContext = rememberedLaunchContext;
        }
    } catch (_) {}


    function save() {
        localStorage.setItem(KEY, JSON.stringify(settings));
    }

    function normalizeYouTubeReference(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;
        const playlist = raw.match(/[?&]list=([A-Za-z0-9_-]+)/i);
        if (playlist) return { type: "playlist", id: playlist[1] };
        const video = raw.match(/[?&]v=([A-Za-z0-9_-]{6,})/i) ||
            raw.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i) ||
            raw.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i) ||
            raw.match(/^([A-Za-z0-9_-]{6,})$/);
        if (video) return { type: "video", id: video[1] };
        return null;
    }

    function youtubeEmbedUrl(type, id, autoplay) {
        const params = new URLSearchParams({
            autoplay: autoplay ? "1" : "0",
            controls: "1",
            enablejsapi: "1",
            loop: "1",
            origin: location.origin
        });
        if (type === "playlist") {
            params.set("listType", "playlist");
            params.set("list", id);
            return `https://www.youtube.com/embed?${params.toString()}`;
        }
        params.set("playlist", id);
        return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
    }

    function initializeAudioSource() {
        if (settings.youtubeEnabled) return;
        if (settings.externalAudioUrl) {
            audio.loop = false;
            audio.src = settings.externalAudioUrl;
            return;
        }
        const stream = currentStream();
        if (!stream) return;
        audio.loop = !!stream.isCustom;
        if (audio.src !== stream.url) audio.src = stream.url;
    }

    function currentYouTubeEmbedUrl(autoplay) {
        const type = settings.youtubeMediaType === "video" ? "video" : "playlist";
        const id = type === "video" ? settings.youtubeVideoId : settings.youtubePlaylistId;
        return id ? youtubeEmbedUrl(type, id, autoplay) : "about:blank";
    }

    function setYouTubePlaylist(value, autoplay = true) {
        const media = normalizeYouTubeReference(value);
        if (!media) {
            showToast("Please enter a valid YouTube or YouTube Music video/playlist URL");
            return false;
        }
        settings.youtubeMediaType = media.type;
        settings.externalAudioUrl = "";
        settings.externalAudioTitle = "";
        settings.youtubePlaylistId = media.type === "playlist" ? media.id : "";
        settings.youtubeVideoId = media.type === "video" ? media.id : "";
        settings.youtubeEnabled = true;
        settings.userWantsPlaying = autoplay;
        youtubePlaying = autoplay;
        audio.pause();
        pendingAutoplay = false;
        if (youtubeFrame) {
            youtubeFrame.src = youtubeEmbedUrl(media.type, media.id, autoplay);
            youtubeFrame.style.display = "block";
        }
        if (youtubeEnabledInput) youtubeEnabledInput.checked = true;
        save();
        render();
        emit();
        showToast(media.type === "video" ? "YouTube video embedded" : "YouTube playlist embedded");
        return true;
    }

    function clearYouTubePlaylist() {
        settings.youtubeEnabled = false;
        settings.externalAudioUrl = "";
        settings.externalAudioTitle = "";
        youtubePlaying = false;
        if (youtubeFrame) {
            sendYouTubeCommand("stopVideo");
            youtubeFrame.src = "about:blank";
            youtubeFrame.style.display = "none";
        }
        if (youtubeEnabledInput) youtubeEnabledInput.checked = false;
        save();
        render();
        emit();
    }

    function sendYouTubeCommand(func, args = []) {
        if (!youtubeFrame?.contentWindow) return;
        youtubeFrame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    }

    function announceYouTubePlayer() {
        if (!youtubeFrame?.contentWindow) return;
        const target = youtubeFrame.contentWindow;
        target.postMessage(JSON.stringify({ event: "listening", id: "gdl-youtube-player", channel: "gdl" }), "*");
        target.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }), "*");
    }

    window.addEventListener("message", (event) => {
        if (!youtubeFrame || event.source !== youtubeFrame.contentWindow) return;
        if (!String(event.origin || "").includes("youtube.com")) return;
        try {
            const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
            const stateValue = message?.info?.playerState ?? (message?.event === "onStateChange" ? message.info : undefined);
            if (stateValue === undefined) return;
            const state = Number(stateValue);
            if (state === 1) { youtubePlaying = true; settings.userWantsPlaying = true; }
            else if (state === 2 || state === 0) { youtubePlaying = false; settings.userWantsPlaying = false; }
            else if (state === 5) { youtubePlaying = false; }
            save();
            render();
            emit();
        } catch (_) {}
    });

    function showToast(message) {
        let toast = document.getElementById("gdl-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "gdl-toast";
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(10px);
                background: rgba(13, 20, 30, 0.94);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                border: 1px solid rgba(52, 211, 153, 0.4);
                color: #f1f5f9;
                padding: 7px 16px;
                border-radius: 999px;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 11.5px;
                font-weight: 500;
                z-index: 2147483647;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 10px rgba(52, 211, 153, 0.15);
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: none;
                opacity: 0;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(10px)";
        }, 3000);
    }

    function context() {
        const path = (location.pathname || "/").toLowerCase().replace(/\/$/, "") || "/";
        const search = location.search.toLowerCase();
        const nextRoute = String(window.__NEXT_DATA__?.page || "").toLowerCase();
        const bodyText = document.body?.innerText?.toLowerCase() || "";


        if (path === "/party" || path.startsWith("/party/") || path === "/room" ||
            path.startsWith("/room/") || search.includes("party") || search.includes("room") ||
            nextRoute.includes("/party") || nextRoute.includes("/room")) {
            launchContext = "partyduel";
            return "partyduel";
        }

        if (path === "/single" || path.startsWith("/single/") || path.includes("/singleplayer") ||
            path.includes("/practice") || search.includes("single") || nextRoute.includes("/single") ||
            document.querySelector('[data-testid="singleplayer-ui"], [data-mode="singleplayer"]')) {
            return "single";
        }

        const isMatchPath = path === "/match" || path.startsWith("/match/") ||
            /^\/(matches|game|duel|ranked)(\/|$)/i.test(path) ||
            nextRoute.includes("/match") || nextRoute.includes("/duel");

        if (isMatchPath) {
            if (launchContext) return launchContext;

            const isPartyMatch = document.querySelector('[data-mode="party"], [data-mode="team_duel"], [data-testid="party-badge"], [data-testid="party-match"]') ||
                /party duel|custom match|team duel|2v2 duel/i.test(bodyText);
            if (isPartyMatch) return "partyduel";

            const isSoloMatch = document.querySelector('[data-mode="singleplayer"], [data-testid="singleplayer-ui"]') ||
                /singleplayer|solo game|play solo/i.test(bodyText);
            if (isSoloMatch) return "single";

            return "rankduel";
        }

        return "lobby";
    }

    function isCurrentScopeActive() {
        return !!settings.scopes[context()];
    }

    function suspendAudio() {
        audio.pause();
        pendingAutoplay = false;
        render();
        emit();
    }

    let contextUpdateTimer = 0;

    function scheduleContextUpdate() {
        if (contextUpdateTimer) return;
        contextUpdateTimer = requestAnimationFrame(() => {
            contextUpdateTimer = 0;
            updateContext();
        });
    }

    function updateContext() {
        if (!root) return;
        if (settings.disabled) {
            root.hidden = true;
            togglePanel(false);
            suspendAudio();
            return;
        }

        const place = context();
        const isScopeActive = !!settings.scopes[place];
        const isGameplayContext = place === "single" || place === "rankduel" || place === "partyduel";

        if (lastContext === "lobby" && isGameplayContext && !returnToLobbyState) {
            returnToLobbyState = {
                userWantsPlaying: settings.userWantsPlaying,
                streamIndex: settings.streamIndex,
                youtubePlaylistId: settings.youtubePlaylistId,
                youtubeVideoId: settings.youtubeVideoId,
                youtubeMediaType: settings.youtubeMediaType,
                youtubeEnabled: settings.youtubeEnabled,
                externalAudioUrl: settings.externalAudioUrl,
                externalAudioTitle: settings.externalAudioTitle,
                wasPlaying: settings.youtubeEnabled ? youtubePlaying : !audio.paused
            };
            try {
                sessionStorage.setItem("geoduels-lofi-return-state", JSON.stringify(returnToLobbyState));
            } catch (_) {}
        }

        if (place === "lobby" && returnToLobbyState) {
            const savedReturnState = returnToLobbyState;
            returnToLobbyState = null;
            try { sessionStorage.removeItem("geoduels-lofi-return-state"); } catch (_) {}
            settings.userWantsPlaying = savedReturnState.userWantsPlaying;
            settings.streamIndex = savedReturnState.streamIndex;
            settings.youtubePlaylistId = savedReturnState.youtubePlaylistId || "";
            settings.youtubeVideoId = savedReturnState.youtubeVideoId || "";
            settings.youtubeMediaType = savedReturnState.youtubeMediaType === "video" ? "video" : "playlist";
            settings.youtubeEnabled = savedReturnState.youtubeEnabled;
            settings.externalAudioUrl = savedReturnState.externalAudioUrl || "";
            settings.externalAudioTitle = savedReturnState.externalAudioTitle || "";
            youtubePlaying = savedReturnState.youtubeEnabled && savedReturnState.wasPlaying;
            pendingAutoplay = false;

            if (settings.youtubeEnabled && (settings.youtubePlaylistId || settings.youtubeVideoId)) {
                audio.pause();
                if (youtubeFrame) {
                    youtubeFrame.src = currentYouTubeEmbedUrl(youtubePlaying);
                    youtubeFrame.style.display = youtubePlaying ? "block" : "none";
                }
            } else {
                initializeAudioSource();
                youtubePlaying = false;
                if (youtubeFrame) {
                    youtubeFrame.src = "about:blank";
                    youtubeFrame.style.display = "none";
                }
            }
            save();
        }

        lastContext = place;

        const shouldHide = settings.uiHidden || (!isScopeActive && settings.autoHideInactive);
        root.hidden = shouldHide;

        if (shouldHide) {
            togglePanel(false);
        }

        if (!isScopeActive) {
            pendingAutoplay = false;
            youtubePlaying = false;
            if (youtubeFrame && settings.youtubeEnabled) {
                sendYouTubeCommand("stopVideo");
                youtubeFrame.style.display = "none";
            }
            if (!audio.paused) {
                audio.pause();
                render();
                emit();
            }
        } else {
            if (settings.userWantsPlaying) {
                if (settings.youtubeEnabled && (settings.youtubePlaylistId || settings.youtubeVideoId)) {
                    youtubePlaying = true;
                    if (youtubeFrame) {
                        const embedUrl = currentYouTubeEmbedUrl(true);
                        if (youtubeFrame.src !== embedUrl) youtubeFrame.src = embedUrl;
                        youtubeFrame.style.display = "block";
                    }
                    audio.pause();
                    render();
                } else if (audio.paused && !pendingAutoplay) {
                    play();
                }
            } else {
                if (settings.youtubeEnabled) youtubePlaying = false;
                suspendAudio();
            }
        }
    }

    function togglePanel(open) {
        expanded = typeof open === "boolean" ? open : !expanded;
        if (panel) panel.classList.toggle("is-open", expanded);
        if (settingsButton) settingsButton.classList.toggle("is-active", expanded);
    }

    function updateSelectOptions() {
        if (!streamSelect) return;
        streamSelect.innerHTML = STREAMS.map((s, idx) => `<option value="${idx}">${s.name}</option>`).join("");
        streamSelect.value = String(settings.streamIndex);
        if (deleteBtn) {
            deleteBtn.style.display = currentStream().isCustom ? "block" : "none";
        }
    }

    function render() {
        if (!root) return;
        const isPlaying = settings.youtubeEnabled ? youtubePlaying : !audio.paused;
        playButton.classList.toggle("is-playing", isPlaying);
        if (mp3ModeButton) mp3ModeButton.classList.toggle("is-active", !settings.youtubeEnabled);
        if (youtubeModeButton) youtubeModeButton.classList.toggle("is-active", settings.youtubeEnabled);
        playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
        volumeSlider.value = String(Math.round(audio.volume * 100));
        if (streamSelect) streamSelect.value = String(settings.streamIndex);
        if (deleteBtn) deleteBtn.style.display = currentStream().isCustom ? "block" : "none";
    }

    function play() {
        if (settings.disabled || !isCurrentScopeActive()) {
            audio.pause();
            youtubePlaying = false;
            pendingAutoplay = false;
            render();
            return Promise.resolve(false);
        }
        settings.userWantsPlaying = true;
        if (settings.youtubeEnabled && (settings.youtubePlaylistId || settings.youtubeVideoId)) {
            youtubePlaying = true;
            audio.pause();
            if (youtubeFrame) {
                const embedUrl = currentYouTubeEmbedUrl(true);
                if (youtubeFrame.src !== embedUrl) youtubeFrame.src = embedUrl;
                youtubeFrame.style.display = "block";
                setTimeout(() => sendYouTubeCommand("playVideo"), 250);
            }
            save();
            render();
            emit();
            return Promise.resolve(true);
        }
        save();

        const stream = currentStream();
        if (settings.externalAudioUrl) {
            if (audio.src !== settings.externalAudioUrl) audio.src = settings.externalAudioUrl;
            audio.loop = false;
            return audio.play().then(() => { render(); emit(); return true; }).catch(() => false);
        }
        audio.loop = !!stream.isCustom;

        if (audio.src !== stream.url) {
            audio.src = stream.url;
        }

        return audio.play().then(() => {
            pendingAutoplay = false;
            render();
            emit();
            return true;
        }).catch(() => {
            pendingAutoplay = true;
            const unlock = () => {
                if (pendingAutoplay && audio.paused && settings.userWantsPlaying && !settings.disabled) {
                    play();
                }
                window.removeEventListener("pointerdown", unlock);
                window.removeEventListener("keydown", unlock);
            };
            window.addEventListener("pointerdown", unlock, { once: true });
            window.addEventListener("keydown", unlock, { once: true });
            render();
            return false;
        });
    }

    function pause() {
        settings.userWantsPlaying = false;
        save();
        audio.pause();
        youtubePlaying = false;
        if (youtubeFrame && settings.youtubeEnabled) sendYouTubeCommand("pauseVideo");
        if (settings.youtubeEnabled && youtubeFrame) {
            youtubeFrame.style.display = "block";
        }
        pendingAutoplay = false;
        render();
        emit();
    }

    function setStation(index) {
        settings.streamIndex = ((Number(index) || 0) % STREAMS.length + STREAMS.length) % STREAMS.length;
        save();
        const stream = currentStream();
        if (streamSelect) streamSelect.value = String(settings.streamIndex);
        if (deleteBtn) deleteBtn.style.display = stream.isCustom ? "block" : "none";

        settings.youtubeEnabled = false;
        settings.externalAudioUrl = "";
        settings.externalAudioTitle = "";
        youtubePlaying = false;
        if (youtubeFrame) {
            sendYouTubeCommand("stopVideo");
            youtubeFrame.src = "about:blank";
            youtubeFrame.style.display = "none";
        }
        audio.loop = !!stream.isCustom;
        audio.src = stream.url;

        if (settings.userWantsPlaying && isCurrentScopeActive()) {
            play();
        } else {
            render();
            emit();
        }
        showToast(`Playing: ${stream.name}${stream.isCustom ? " (Looping 🔁)" : ""}`);
    }

    function shutdown() {
        settings.disabled = true;
        settings.userWantsPlaying = false;
        audio.pause();
        audio.removeAttribute("src");
        youtubePlaying = false;
        if (youtubeFrame) {
            sendYouTubeCommand("stopVideo");
            youtubeFrame.src = "about:blank";
            youtubeFrame.style.display = "none";
        }
        togglePanel(false);
        save();
        updateContext();
        showToast("Player shut down. Press Alt + Shift + M to restart.");
    }

    function revive() {
        settings.disabled = false;
        if (settings.startupMode === "always") {
            settings.userWantsPlaying = true;
        } else if (settings.startupMode === "never") {
            settings.userWantsPlaying = false;
        }
        save();
        updateContext();
        render();
        if (settings.userWantsPlaying) {
            play();
        }
        showToast("Player restarted.");
    }

    function emit() {
        window.dispatchEvent(new CustomEvent("geoduels-music:statechange", { detail: api.getState() }));
    }

    async function handleFileUpload(file) {
        if (!file) return;
        try {
            showToast("Saving custom audio...");
            await dbSaveTrack(file.name, file);
            await loadCustomTracksFromDB();
            setStation(0);
            showToast(`Uploaded & Looping: ${file.name}`);
        } catch (err) {
            console.error(err);
            showToast("Failed to upload MP3");
        }
    }

    async function handleDeleteCurrentCustom() {
        const stream = currentStream();
        if (!stream.isCustom) return;
        if (confirm(`Are you sure you want to delete "${stream.name}"?`)) {
            await dbDeleteTrack(stream.id);
            await loadCustomTracksFromDB();
            setStation(0);
            showToast("Deleted custom MP3");
        }
    }

    function mount() {
        if (document.getElementById("geoduels-lofi-player")) return;

        root = document.createElement("section");
        root.id = "geoduels-lofi-player";

        root.innerHTML = `
        <style>
            #geoduels-lofi-player {
                position: fixed;
                z-index: 2147483647;
                top: 20px;
                right: 180px;
                color: #f1f5f9;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-user-drag: none;
            }
            #geoduels-lofi-player * { box-sizing: border-box; }
            #geoduels-lofi-player[hidden] { display: none !important; }

            #geoduels-lofi-player .gdl-bar {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 4px 6px;
                background: rgba(13, 20, 30, 0.82);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 999px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0,0,0,0.2);
                cursor: grab;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            #geoduels-lofi-player .gdl-bar:active { cursor: grabbing; }
            #geoduels-lofi-player .gdl-bar:hover {
                border-color: rgba(52, 211, 153, 0.35);
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55), 0 0 12px rgba(52, 211, 153, 0.12);
            }

            #geoduels-lofi-player .gdl-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border: none;
                outline: none;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.06);
                color: #94a3b8;
                cursor: pointer;
                transition: all 0.18s ease;
                padding: 0;
            }
            #geoduels-lofi-player .gdl-btn:hover {
                background: rgba(255, 255, 255, 0.14);
                color: #fff;
                transform: scale(1.05);
            }
            #geoduels-lofi-player .gdl-btn:active { transform: scale(0.95); }

            #geoduels-lofi-player .gdl-play {
                width: 32px;
                height: 32px;
                background: #10b981;
                color: #fff;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
            }
            #geoduels-lofi-player .gdl-play:hover {
                background: #059669;
                color: #fff;
                box-shadow: 0 3px 12px rgba(16, 185, 129, 0.5);
                transform: scale(1.06);
            }
            #geoduels-lofi-player .gdl-play .gdl-icon-pause { display: none; }
            #geoduels-lofi-player .gdl-play.is-playing { background: #059669; }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-icon-play { display: none; }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-icon-pause {
                display: flex;
                gap: 2.5px;
                align-items: center;
                justify-content: center;
            }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-icon-pause i {
                display: block;
                width: 3px;
                height: 11px;
                background: #fff;
                border-radius: 1px;
            }

            #geoduels-lofi-player .gdl-settings.is-active {
                background: rgba(52, 211, 153, 0.2);
                color: #34d399;
            }

            #geoduels-lofi-player .gdl-panel {
                position: absolute;
                top: 44px;
                right: 0;
                width: 230px;
                padding: 12px;
                max-height: min(72vh, 560px);
                overflow-y: auto;
                overscroll-behavior: contain;
                scrollbar-width: thin;
                background: rgba(13, 20, 30, 0.94);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0,0,0,0.25);
                opacity: 0;
                transform: translateY(-8px) scale(0.96);
                pointer-events: none;
                transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #geoduels-lofi-player .gdl-panel.is-open {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            #geoduels-lofi-player .gdl-label {
                display: block;
                margin: 8px 0 4px;
                color: #94a3b8;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }
            #geoduels-lofi-player .gdl-label:first-child { margin-top: 0; }

            #geoduels-lofi-player select {
                width: 100%;
                background: rgba(255, 255, 255, 0.07);
                color: #f1f5f9;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                padding: 6px 8px;
                font-size: 11px;
                outline: none;
                cursor: pointer;
                transition: border-color 0.15s;
            }
            #geoduels-lofi-player select:hover, #geoduels-lofi-player select:focus { border-color: #34d399; }
            #geoduels-lofi-player select option { background: #0f172a; color: #f1f5f9; }

            #geoduels-lofi-player .gdl-yt-row {
                display: flex;
                gap: 5px;
                margin-top: 5px;
            }
            #geoduels-lofi-player .gdl-yt-input {
                min-width: 0;
                flex: 1;
                background: rgba(255,255,255,.07);
                color: #f1f5f9;
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 6px;
                padding: 5px 7px;
                font-size: 10px;
                outline: none;
            }
            #geoduels-lofi-player .gdl-yt-input:focus { border-color: #34d399; }
            #geoduels-lofi-player .gdl-yt-btn {
                background: rgba(239,68,68,.16);
                border: 1px solid rgba(239,68,68,.35);
                border-radius: 6px;
                color: #fecaca;
                font-size: 10px;
                font-weight: 600;
                padding: 5px 7px;
                cursor: pointer;
            }

            #geoduels-lofi-player .gdl-source-row { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }
            #geoduels-lofi-player .gdl-panel::-webkit-scrollbar { width: 5px; }
            #geoduels-lofi-player .gdl-panel::-webkit-scrollbar-thumb { background: rgba(148,163,184,.45); border-radius: 5px; }
            #geoduels-lofi-player .gdl-source-btn { flex: 1; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; padding: 6px 7px; color: #dbeafe; background: rgba(255,255,255,.06); font-size: 10px; cursor: pointer; }
            #geoduels-lofi-player .gdl-source-btn:hover { border-color: #34d399; background: rgba(52,211,153,.12); }
            #geoduels-lofi-player .gdl-source-btn.is-active { border-color: #34d399; color: #fff; background: rgba(16,185,129,.28); box-shadow: 0 0 0 1px rgba(52,211,153,.25) inset; }
            #geoduels-lofi-player .gdl-yt-frame {
                display: none;
                width: 100%;
                height: 130px;
                margin-top: 7px;
                border: 0;
                border-radius: 8px;
                background: #000;
            }

            #geoduels-lofi-player .gdl-upload-row {
                display: flex;
                gap: 5px;
                margin-top: 5px;
            }
            #geoduels-lofi-player .gdl-custom-btn {
                flex: 1;
                background: rgba(52, 211, 153, 0.15);
                border: 1px dashed rgba(52, 211, 153, 0.4);
                border-radius: 6px;
                color: #34d399;
                font-size: 10px;
                font-weight: 600;
                padding: 5px;
                cursor: pointer;
                transition: all 0.15s ease;
                text-align: center;
            }
            #geoduels-lofi-player .gdl-custom-btn:hover {
                background: rgba(52, 211, 153, 0.25);
                border-color: #34d399;
                color: #fff;
            }
            #geoduels-lofi-player .gdl-del-btn {
                display: none;
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.35);
                border-radius: 6px;
                color: #fca5a5;
                font-size: 10px;
                font-weight: 600;
                padding: 0 7px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            #geoduels-lofi-player .gdl-del-btn:hover {
                background: rgba(239, 68, 68, 0.3);
                color: #fff;
            }

            #geoduels-lofi-player .gdl-scopes {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 5px;
            }
            #geoduels-lofi-player .gdl-chip {
                position: relative;
                cursor: pointer;
                flex: 1;
            }
            #geoduels-lofi-player .gdl-chip input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
            }
            #geoduels-lofi-player .gdl-chip span {
                display: block;
                text-align: center;
                padding: 5.5px 0;
                font-size: 10.5px;
                font-weight: 500;
                color: #94a3b8;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                transition: all 0.15s ease;
            }
            #geoduels-lofi-player .gdl-chip input:checked + span {
                background: rgba(16, 185, 129, 0.2);
                border-color: rgba(52, 211, 153, 0.45);
                color: #34d399;
                font-weight: 600;
            }
            #geoduels-lofi-player .gdl-chip:hover span {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }

            #geoduels-lofi-player .gdl-startup-modes { display: flex; gap: 4px; }

            #geoduels-lofi-player .gdl-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin: 8px 0 4px;
            }
            #geoduels-lofi-player .gdl-toggle-label {
                font-size: 10.5px;
                color: #cbd5e1;
                font-weight: 500;
                cursor: pointer;
            }
            #geoduels-lofi-player .gdl-switch {
                position: relative;
                width: 32px;
                height: 18px;
                display: inline-block;
                margin: 0;
            }
            #geoduels-lofi-player .gdl-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
            #geoduels-lofi-player .gdl-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: rgba(255, 255, 255, 0.15);
                transition: .2s cubic-bezier(0.4, 0, 0.2, 1);
                border-radius: 20px;
            }
            #geoduels-lofi-player .gdl-slider:before {
                position: absolute;
                content: "";
                height: 12px;
                width: 12px;
                left: 3px;
                bottom: 3px;
                background-color: #fff;
                transition: .2s cubic-bezier(0.4, 0, 0.2, 1);
                border-radius: 50%;
            }
            #geoduels-lofi-player .gdl-switch input:checked + .gdl-slider { background-color: #10b981; }
            #geoduels-lofi-player .gdl-switch input:checked + .gdl-slider:before { transform: translateX(14px); }

            #geoduels-lofi-player .gdl-vol-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 2px;
            }
            #geoduels-lofi-player input[type=range] {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: rgba(255, 255, 255, 0.15);
                outline: none;
                cursor: pointer;
            }
            #geoduels-lofi-player input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 13px;
                height: 13px;
                border-radius: 50%;
                background: #34d399;
                box-shadow: 0 0 6px rgba(52, 211, 153, 0.6);
                cursor: pointer;
                transition: transform 0.1s;
            }

            #geoduels-lofi-player .gdl-shortcuts {
                margin: 10px 0 0;
                padding: 6px 8px;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 6px;
                color: #94a3b8;
                font-size: 9px;
                line-height: 1.5;
            }
            #geoduels-lofi-player .gdl-kbd {
                display: inline-block;
                padding: 1px 3px;
                font-size: 8.5px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                color: #e2e8f0;
                font-family: inherit;
            }

            #geoduels-lofi-player .gdl-shutdown-btn {
                width: 100%;
                margin-top: 8px;
                background: rgba(239, 68, 68, 0.12);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 6px;
                color: #fca5a5;
                font-size: 10px;
                font-weight: 600;
                padding: 5px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            #geoduels-lofi-player .gdl-shutdown-btn:hover {
                background: rgba(239, 68, 68, 0.25);
                border-color: #ef4444;
                color: #fff;
            }
        </style>
        <div class="gdl-bar">
            <button class="gdl-btn gdl-play is-playing" type="button" aria-label="Play">
                <svg class="gdl-icon-play" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
                <span class="gdl-icon-pause"><i></i><i></i></span>
            </button>
            <button class="gdl-btn gdl-settings" type="button" title="Settings" aria-label="Settings">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button class="gdl-btn gdl-minimize" type="button" title="Hide UI (Alt + H)" aria-label="Hide UI">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
        </div>
        <div class="gdl-panel">
            <label class="gdl-label">Audio Track / Station</label>
            <select class="gdl-station-select"></select>

            <div class="gdl-upload-row">
                <input type="file" class="gdl-file-input" accept="audio/*" style="display:none">
                <button class="gdl-custom-btn" type="button">📁 Upload MP3 (Loop)</button>
                <button class="gdl-del-btn" type="button" title="Delete custom track">🗑️</button>
            </div>

            <label class="gdl-label">YouTube / YouTube Music</label>
            <div class="gdl-yt-help">Search for a song yourself, then paste a YouTube or YouTube Music video or playlist URL below.</div>
            <div class="gdl-yt-row">
                <input class="gdl-yt-input gdl-yt-playlist" type="text" placeholder="YouTube / YouTube Music video or playlist URL">
                <button class="gdl-yt-btn gdl-yt-embed-btn" type="button">Embed</button>
            </div>
            <div class="gdl-source-row">
                <button class="gdl-source-btn gdl-mp3-mode" type="button">Use MP3 / Radio</button>
                <button class="gdl-source-btn gdl-youtube-mode" type="button">Use YouTube / YouTube Music</button>
            </div>
            <iframe class="gdl-yt-frame" title="YouTube video or playlist" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>

            <label class="gdl-label">Play Music In</label>
            <div class="gdl-scopes">
                <label class="gdl-chip"><input data-scope="lobby" type="checkbox"><span>Lobby</span></label>
                <label class="gdl-chip"><input data-scope="single" type="checkbox"><span>Solo</span></label>
                <label class="gdl-chip"><input data-scope="rankduel" type="checkbox"><span>Ranked</span></label>
                <label class="gdl-chip"><input data-scope="partyduel" type="checkbox"><span>Party</span></label>
            </div>

            <label class="gdl-label">On Startup</label>
            <div class="gdl-startup-modes">
                <label class="gdl-chip"><input name="gdl-startup" value="always" type="radio"><span>Always</span></label>
                <label class="gdl-chip"><input name="gdl-startup" value="never" type="radio"><span>Never</span></label>
                <label class="gdl-chip"><input name="gdl-startup" value="remember" type="radio"><span>Resume</span></label>
            </div>

            <div class="gdl-toggle-row">
                <label class="gdl-toggle-label" for="gdl-autohide-cb">Hide when inactive</label>
                <label class="gdl-switch">
                    <input id="gdl-autohide-cb" class="gdl-autohide" type="checkbox">
                    <span class="gdl-slider"></span>
                </label>
            </div>

            <label class="gdl-label">Volume</label>
            <div class="gdl-vol-wrap">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="color:#94a3b8;flex-shrink:0;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"></path></svg>
                <input class="gdl-volume" type="range" min="0" max="100" aria-label="Volume">
            </div>

            <div class="gdl-shortcuts">
                <span class="gdl-kbd">Alt</span>+<span class="gdl-kbd">P</span> Play/Pause • <span class="gdl-kbd">Alt</span>+<span class="gdl-kbd">N</span> Station<br>
                <span class="gdl-kbd">Alt</span>+<span class="gdl-kbd">H</span> Hide UI • <span class="gdl-kbd">Alt</span>+<span class="gdl-kbd">[</span>/<span class="gdl-kbd">]</span> Vol
            </div>

            <button class="gdl-shutdown-btn" type="button">Shutdown App</button>
        </div>`;

        root.hidden = true;
        document.body.append(root);

        playButton = root.querySelector(".gdl-play");
        settingsButton = root.querySelector(".gdl-settings");
        minimizeButton = root.querySelector(".gdl-minimize");
        panel = root.querySelector(".gdl-panel");
        volumeSlider = root.querySelector(".gdl-volume");
        autoHideInput = root.querySelector(".gdl-autohide");
        streamSelect = root.querySelector(".gdl-station-select");
        fileInput = root.querySelector(".gdl-file-input");
        deleteBtn = root.querySelector(".gdl-del-btn");
        youtubeFrame = root.querySelector(".gdl-yt-frame");
        youtubeFrame?.addEventListener("load", () => {
            if (settings.youtubeEnabled) setTimeout(announceYouTubePlayer, 100);
        });
        youtubePlaylistInput = root.querySelector(".gdl-yt-playlist");
        youtubeEmbedButton = root.querySelector(".gdl-yt-embed-btn");
        mp3ModeButton = root.querySelector(".gdl-mp3-mode");
        youtubeModeButton = root.querySelector(".gdl-youtube-mode");
        if (youtubePlaylistInput) {
            youtubePlaylistInput.value = settings.youtubeMediaType === "video"
                ? `https://music.youtube.com/watch?v=${settings.youtubeVideoId}`
                : settings.youtubePlaylistId;
        }
        if (settings.youtubeEnabled && (settings.youtubePlaylistId || settings.youtubeVideoId)) {
            youtubePlaying = settings.userWantsPlaying;
            youtubeFrame.src = currentYouTubeEmbedUrl(youtubePlaying);
            youtubeFrame.style.display = "block";
        }

        loadCustomTracksFromDB().then(() => {
            initializeAudioSource();
            updateSelectOptions();
            if (!settings.youtubeEnabled && settings.userWantsPlaying && isCurrentScopeActive()) {
                play();
            }
        });

        streamSelect.addEventListener("change", () => {
            setStation(Number(streamSelect.value));
        });

        root.querySelector(".gdl-custom-btn").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) handleFileUpload(file);
            fileInput.value = "";
        });

                deleteBtn.addEventListener("click", handleDeleteCurrentCustom);
        youtubeEmbedButton.addEventListener("click", () => {
            setYouTubePlaylist(youtubePlaylistInput.value, true);
        });
        mp3ModeButton.addEventListener("click", () => {
            const resume = settings.userWantsPlaying || youtubePlaying;
            clearYouTubePlaylist();
            settings.userWantsPlaying = resume;
            initializeAudioSource();
            if (resume && isCurrentScopeActive()) play(); else render();
        });
        youtubeModeButton.addEventListener("click", () => {
            const hasMedia = settings.youtubePlaylistId || settings.youtubeVideoId;
            if (!hasMedia) {
                youtubePlaylistInput.focus();
                showToast("Paste a YouTube or YouTube Music URL first");
                return;
            }
            settings.youtubeEnabled = true;
            settings.userWantsPlaying = true;
            youtubePlaying = true;
            audio.pause();
            youtubeFrame.src = currentYouTubeEmbedUrl(true);
            youtubeFrame.style.display = "block";
            save(); render(); emit();
        });

        root.querySelectorAll("[data-scope]").forEach((box) => {
            box.checked = !!settings.scopes[box.dataset.scope];
            box.addEventListener("change", () => {
                settings.scopes[box.dataset.scope] = box.checked;
                save();
                updateContext();
            });
        });

        root.querySelectorAll('input[name="gdl-startup"]').forEach((radio) => {
            radio.checked = radio.value === settings.startupMode;
            radio.addEventListener("change", () => {
                if (radio.checked) {
                    settings.startupMode = radio.value;
                    save();
                    const toastLabels = {
                        always: "Startup: Always Autoplay",
                        never: "Startup: Never Autoplay",
                        remember: "Startup: Resume Last State"
                    };
                    showToast(toastLabels[radio.value] || "Startup mode updated");
                }
            });
        });

        autoHideInput.checked = settings.autoHideInactive;
        autoHideInput.addEventListener("change", () => {
            settings.autoHideInactive = autoHideInput.checked;
            save();
            updateContext();
            showToast(settings.autoHideInactive ? "Auto-hide when inactive enabled" : "Auto-hide disabled (Always visible)");
        });

        playButton.addEventListener("click", () => {
            const currentlyPlaying = settings.youtubeEnabled ? youtubePlaying : !audio.paused;
            void (currentlyPlaying ? pause() : play());
        });

        settingsButton.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePanel();
        });

        document.addEventListener("pointerdown", (e) => {
            if (expanded && root && !root.contains(e.target)) {
                togglePanel(false);
            }
        });

        document.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest("button");
            if (!button || root.contains(button)) return;
            const card = button.closest('[class*="lobby-feature-card"]');
            const label = `${card?.innerText || ""} ${button.innerText || ""}`.toLowerCase();
            if (/singleplayer|solo/.test(label)) {
                launchContext = "single";
            } else if (/ranked|duels|duel/.test(label)) {
                launchContext = "rankduel";
            } else {
                return;
            }
            try {
                sessionStorage.setItem("geoduels-lofi-launch-context", launchContext);
            } catch (_) {}
        }, true);

        minimizeButton.addEventListener("click", () => {
            settings.uiHidden = true;
            togglePanel(false);
            save();
            updateContext();
            showToast("UI Hidden. Press Alt + H to restore.");
        });

        root.querySelector(".gdl-shutdown-btn").addEventListener("click", () => {
            const confirmed = window.confirm("Are you sure you want to shut down the music player?\n\nAudio will stop. To restart later, press: Alt + Shift + M");
            if (confirmed) {
                shutdown();
            }
        });

        volumeSlider.addEventListener("input", () => {
            audio.volume = Number(volumeSlider.value) / 100;
            settings.volume = audio.volume;
            save();
            emit();
        });

        if (settings.position && Number.isFinite(settings.position.x) && Number.isFinite(settings.position.y) &&
            settings.position.x >= 0 && settings.position.y >= 0 &&
            settings.position.x < innerWidth - 40 && settings.position.y < innerHeight - 40) {
            root.style.left = `${settings.position.x}px`;
            root.style.top = `${settings.position.y}px`;
            root.style.right = "auto";
        }

        let drag = null;
        const bar = root.querySelector(".gdl-bar");

        bar.addEventListener("pointerdown", (event) => {
            if (event.target.closest("button")) return;
            drag = { x: event.clientX, y: event.clientY, left: root.offsetLeft, top: root.offsetTop };
            bar.setPointerCapture(event.pointerId);
        });

        bar.addEventListener("pointermove", (event) => {
            if (!drag) return;
            const x = Math.max(10, Math.min(innerWidth - root.offsetWidth - 10, drag.left + event.clientX - drag.x));
            const y = Math.max(10, Math.min(innerHeight - root.offsetHeight - 10, drag.top + event.clientY - drag.y));
            root.style.left = `${x}px`;
            root.style.top = `${y}px`;
            root.style.right = "auto";
        });

        const stopDrag = (event) => {
            if (!drag) return;
            if (bar.hasPointerCapture(event.pointerId)) {
                bar.releasePointerCapture(event.pointerId);
            }
            settings.position = { x: root.offsetLeft, y: root.offsetTop };
            save();
            drag = null;
        };

        bar.addEventListener("pointerup", stopDrag);
        bar.addEventListener("pointercancel", stopDrag);

        render();

        new MutationObserver(scheduleContextUpdate).observe(document.documentElement, { childList: true, subtree: true });
        addEventListener("popstate", scheduleContextUpdate);
        addEventListener("hashchange", scheduleContextUpdate);

        updateContext();
    }

    window.addEventListener("keydown", (event) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;

        if (event.altKey && event.shiftKey && (event.key === 'm' || event.key === 'M')) {
            event.preventDefault();
            if (settings.disabled) {
                revive();
            } else {
                shutdown();
            }
            return;
        }

        if (settings.disabled) return;

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === 'h' || event.key === 'H')) {
            event.preventDefault();
            if (root && root.hidden) {
                settings.uiHidden = false;
                root.hidden = false;
                showToast("UI Restored");
            } else {
                settings.uiHidden = !settings.uiHidden;
                if (settings.uiHidden) togglePanel(false);
                showToast(settings.uiHidden ? "UI Hidden (Alt + H to restore)" : "UI Restored");
            }
            save();
            updateContext();
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === 'n' || event.key === 'N')) {
            event.preventDefault();
            setStation(settings.streamIndex + 1);
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === 'p' || event.key === 'P')) {
            event.preventDefault();
            void (audio.paused ? play() : pause());
            showToast(audio.paused ? "Paused" : "Playing");
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === '[' || event.key === '-')) {
            event.preventDefault();
            api.setVolume(audio.volume - 0.05);
            showToast(`Volume: ${Math.round(audio.volume * 100)}%`);
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === ']' || event.key === '=' || event.key === '+')) {
            event.preventDefault();
            api.setVolume(audio.volume + 0.05);
            showToast(`Volume: ${Math.round(audio.volume * 100)}%`);
            return;
        }
    });

    audio.addEventListener("play", () => { render(); emit(); });
    audio.addEventListener("pause", () => { render(); emit(); });

    const api = {
        play, pause, shutdown, revive,
        nextStation: () => setStation(settings.streamIndex + 1),
        previousStation: () => setStation(settings.streamIndex - 1),
        setStation,
        toggle: () => audio.paused ? play() : (pause(), Promise.resolve(true)),
        setVolume(value) {
            audio.volume = Math.max(0, Math.min(1, Number(value)));
            settings.volume = audio.volume;
            save(); render(); emit();
        },
        getState() {
            return { playing: settings.youtubeEnabled ? youtubePlaying : !audio.paused, volume: audio.volume, context: context(), disabled: settings.disabled, station: currentStream().name, isLooping: audio.loop };
        }
    };

    window.GeoDuelsMusic = api;

    if (document.body) mount();
    else addEventListener("DOMContentLoaded", mount, { once: true });
})();
