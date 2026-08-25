// ==UserScript==
// @name         GeoDuels Lofi / Chill Player
// @namespace    https://geoduels.io/
// @version      3.2.2
// @description  Modern music player for GeoDuels with Ranked & Party detection, auto-hide on inactive scenes, and sleek switches.
// @match        https://geoduels.io/*
// @match        https://*.geoduels.io/*
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;

    const KEY = "geoduels-lofi-player:v3.2";
    
    const STREAMS = [
        { name: "Chillsynth", url: "https://stream.nightride.fm/chillsynth.mp3" },
        { name: "Groove Salad (Lofi / Chill)", url: "https://ice6.somafm.com/groovesalad-128-mp3" },
        { name: "Synthwave", url: "https://stream.nightride.fm/nightride.mp3" },
        { name: "Vaporwaves", url: "https://ice6.somafm.com/vaporwaves-128-mp3" },
        { name: "Drone Zone (Ambient)", url: "https://ice6.somafm.com/dronezone-128-mp3" },
        { name: "Secret Agent (Lounge)", url: "https://ice6.somafm.com/secretagent-128-mp3" },
        { name: "Spacesynth", url: "https://stream.nightride.fm/spacesynth.mp3" },
        { name: "DEF CON (Chill Beats)", url: "https://ice6.somafm.com/defcon-128-mp3" }
    ];

    const defaults = {
        volume: 0.55,
        autoplay: true,
        userWantsPlaying: true,
        autoHideInactive: true,
        disabled: false,
        uiHidden: false,
        streamIndex: 0,
        scopes: { lobby: true, single: false, rankduel: false, partyduel: false },
        position: null
    };

    function parse(raw) {
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    }

    const saved = parse(localStorage.getItem(KEY)) || {};
    const settings = {
        volume: Number.isFinite(saved.volume) ? saved.volume : defaults.volume,
        autoplay: typeof saved.autoplay === "boolean" ? saved.autoplay : defaults.autoplay,
        userWantsPlaying: typeof saved.userWantsPlaying === "boolean" ? saved.userWantsPlaying : defaults.userWantsPlaying,
        autoHideInactive: typeof saved.autoHideInactive === "boolean" ? saved.autoHideInactive : defaults.autoHideInactive,
        disabled: typeof saved.disabled === "boolean" ? saved.disabled : defaults.disabled,
        uiHidden: typeof saved.uiHidden === "boolean" ? saved.uiHidden : defaults.uiHidden,
        streamIndex: Number.isInteger(saved.streamIndex) && saved.streamIndex >= 0 && saved.streamIndex < STREAMS.length ? saved.streamIndex : defaults.streamIndex,
        scopes: { ...defaults.scopes, ...(saved.scopes || {}) },
        position: saved.position || null
    };

    function currentStream() {
        return STREAMS[settings.streamIndex] || STREAMS[0];
    }

    const audio = new Audio();
    audio.preload = "none";
    audio.volume = Math.max(0, Math.min(1, settings.volume));

    let root, playButton, settingsButton, minimizeButton, panel, volumeSlider, autoplayInput, autoHideInput, streamSelect;
    let expanded = false;
    let pendingAutoplay = false;

    function save() {
        localStorage.setItem(KEY, JSON.stringify(settings));
    }

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
        const path = location.pathname.toLowerCase();
        const search = location.search.toLowerCase();
        const nextRoute = (window.__NEXT_DATA__?.page || "").toLowerCase();

        // 1. Party & Custom Room Check
        if (
            path.includes("/party") ||
            path.includes("/room") ||
            path.includes("/custom") ||
            search.includes("party") ||
            search.includes("room") ||
            nextRoute.includes("/party") ||
            nextRoute.includes("/room") ||
            document.querySelector('[data-testid*="party"], [data-testid*="room"], .party-lobby, .room-lobby')
        ) {
            return "partyduel";
        }

        // 2. Explicit Singleplayer Route Check
        if (
            path.startsWith("/single") ||
            path.includes("/singleplayer") ||
            path.includes("/practice") ||
            search.includes("single") ||
            nextRoute.includes("/single") ||
            document.querySelector('[data-testid="singleplayer-ui"], [data-mode="singleplayer"]')
        ) {
            return "single";
        }

        // 3. Match / Duel Gameplay Detection
        const isMatchPath = /^\/(match|matches|game|duel|ranked)(\/|$)/i.test(path) ||
                            nextRoute.includes("/match") ||
                            nextRoute.includes("/duel");

        const hasDuelElements = !!(
            document.querySelector('[data-testid="timer-pill"]') ||
            document.querySelector('[data-testid="health-bar"]') ||
            document.querySelector('[class*="health-bar"], [class*="healthBar"]') ||
            document.querySelector('[class*="multiplier"]') ||
            document.querySelector('.duel-header, [data-testid="duel-header"]') ||
            document.querySelector('[aria-label*="HP"], [aria-label*="health"]') ||
            (document.body && /damage multiplier|\b(1|1\.5|2|2\.5|3|4|5)x damage\b/i.test(document.body.innerText))
        );

        if (isMatchPath || hasDuelElements) {
            const isPartyMatch = document.querySelector('[data-mode="party"], [data-testid="party-badge"]') ||
                                 (document.body && /party duel|custom match|2v2 duel/i.test(document.body.innerText));
            if (isPartyMatch) return "partyduel";
            return "rankduel";
        }

        // 4. In-Game Singleplayer Fallback
        const hasMinimap = !!document.querySelector('[data-testid="minimap-panel"], canvas.mapboxgl-canvas, .leaflet-container, [data-testid="guess-map"]');
        if (hasMinimap) {
            return "single";
        }

        // 5. Lobby Default
        return "lobby";
    }

    function suspendAudio() {
        audio.pause();
        pendingAutoplay = false;
        render();
        emit();
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
        
        const shouldHide = settings.uiHidden || (!isScopeActive && settings.autoHideInactive);
        root.hidden = shouldHide;

        if (shouldHide) {
            togglePanel(false);
        }

        if (!isScopeActive) {
            if (!audio.paused) {
                audio.pause();
                pendingAutoplay = false;
                render();
                emit();
            }
        } else {
            if (settings.userWantsPlaying) {
                if (audio.paused && !pendingAutoplay) {
                    play();
                }
            } else {
                suspendAudio();
            }
        }
    }

    function togglePanel(open) {
        expanded = typeof open === "boolean" ? open : !expanded;
        if (panel) panel.classList.toggle("is-open", expanded);
        if (settingsButton) settingsButton.classList.toggle("is-active", expanded);
    }

    function render() {
        if (!root) return;
        playButton.classList.toggle("is-playing", !audio.paused);
        playButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
        volumeSlider.value = String(Math.round(audio.volume * 100));
        if (streamSelect) streamSelect.value = String(settings.streamIndex);
    }

    function play() {
        if (settings.disabled) return Promise.resolve(false);
        settings.userWantsPlaying = true;
        save();
        const stream = currentStream();
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
        pendingAutoplay = false;
        render();
        emit();
    }

    function setStation(index) {
        settings.streamIndex = ((Number(index) || 0) % STREAMS.length + STREAMS.length) % STREAMS.length;
        save();
        const stream = currentStream();
        if (streamSelect) streamSelect.value = String(settings.streamIndex);
        const wasPlaying = settings.userWantsPlaying;
        audio.src = stream.url;
        if (wasPlaying) {
            play();
        } else {
            render();
            emit();
        }
        showToast(`Station: ${stream.name}`);
    }

    function shutdown() {
        settings.disabled = true;
        settings.userWantsPlaying = false;
        audio.pause();
        audio.removeAttribute("src");
        togglePanel(false);
        save();
        updateContext();
        showToast("Player shut down. Press Alt + Shift + M to restart.");
    }

    function revive() {
        settings.disabled = false;
        settings.userWantsPlaying = settings.autoplay;
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

    function mount() {
        if (document.getElementById("geoduels-lofi-player")) return;

        root = document.createElement("section");
        root.id = "geoduels-lofi-player";

        const optionsHtml = STREAMS.map((s, idx) => `<option value="${idx}">${s.name}</option>`).join("");

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
            #geoduels-lofi-player * {
                box-sizing: border-box;
            }
            #geoduels-lofi-player[hidden] {
                display: none !important;
            }

            /* Floating Control Pill */
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
            #geoduels-lofi-player .gdl-bar:active {
                cursor: grabbing;
            }
            #geoduels-lofi-player .gdl-bar:hover {
                border-color: rgba(52, 211, 153, 0.35);
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55), 0 0 12px rgba(52, 211, 153, 0.12);
            }

            /* Buttons */
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
            #geoduels-lofi-player .gdl-btn:active {
                transform: scale(0.95);
            }

            /* Play / Pause Button */
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
            #geoduels-lofi-player .gdl-play .gdl-icon-pause {
                display: none;
            }
            #geoduels-lofi-player .gdl-play.is-playing {
                background: #059669;
            }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-icon-play {
                display: none;
            }
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

            /* Settings Popover Panel */
            #geoduels-lofi-player .gdl-panel {
                position: absolute;
                top: 44px;
                right: 0;
                width: 220px;
                padding: 12px;
                background: rgba(13, 20, 30, 0.92);
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

            /* Panel Elements */
            #geoduels-lofi-player .gdl-label {
                display: block;
                margin: 8px 0 4px;
                color: #94a3b8;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.6px;
            }
            #geoduels-lofi-player .gdl-label:first-child {
                margin-top: 0;
            }

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
            #geoduels-lofi-player select:hover, #geoduels-lofi-player select:focus {
                border-color: #34d399;
            }
            #geoduels-lofi-player select option {
                background: #0f172a;
                color: #f1f5f9;
            }

            /* Scope Pills - 2x2 Grid Layout */
            #geoduels-lofi-player .gdl-scopes {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 5px;
            }
            #geoduels-lofi-player .gdl-chip {
                position: relative;
                cursor: pointer;
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

            /* Slider Toggle Switches */
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
            #geoduels-lofi-player .gdl-switch input {
                opacity: 0;
                width: 0;
                height: 0;
                position: absolute;
            }
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
            #geoduels-lofi-player .gdl-switch input:checked + .gdl-slider {
                background-color: #10b981;
            }
            #geoduels-lofi-player .gdl-switch input:checked + .gdl-slider:before {
                transform: translateX(14px);
            }

            /* Volume Range */
            #geoduels-lofi-player .gdl-vol-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 2px;
            }
            #geoduels-lofi-player .gdl-vol-icon {
                color: #94a3b8;
                font-size: 10px;
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
            #geoduels-lofi-player input[type=range]::-webkit-slider-thumb:hover {
                transform: scale(1.2);
            }

            /* Shortcuts Cheat Sheet */
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

            /* Shutdown Button */
            #geoduels-lofi-player .gdl-shutdown-btn {
                width: 100%;
                margin-top: 10px;
                background: rgba(239, 68, 68, 0.12);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 6px;
                color: #fca5a5;
                font-size: 10px;
                font-weight: 600;
                padding: 6px;
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
            <label class="gdl-label">Radio Station</label>
            <select class="gdl-station-select">
                ${optionsHtml}
            </select>

            <label class="gdl-label">Play Music In</label>
            <div class="gdl-scopes">
                <label class="gdl-chip"><input data-scope="lobby" type="checkbox"><span>Lobby</span></label>
                <label class="gdl-chip"><input data-scope="single" type="checkbox"><span>Solo</span></label>
                <label class="gdl-chip"><input data-scope="rankduel" type="checkbox"><span>Ranked</span></label>
                <label class="gdl-chip"><input data-scope="partyduel" type="checkbox"><span>Party</span></label>
            </div>

            <div class="gdl-toggle-row">
                <label class="gdl-toggle-label" for="gdl-autohide-cb">Hide when inactive</label>
                <label class="gdl-switch">
                    <input id="gdl-autohide-cb" class="gdl-autohide" type="checkbox">
                    <span class="gdl-slider"></span>
                </label>
            </div>

            <div class="gdl-toggle-row">
                <label class="gdl-toggle-label" for="gdl-autoplay-cb">Autoplay on Load</label>
                <label class="gdl-switch">
                    <input id="gdl-autoplay-cb" class="gdl-autoplay" type="checkbox">
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
        
        document.body.append(root);
        
        playButton = root.querySelector(".gdl-play");
        settingsButton = root.querySelector(".gdl-settings");
        minimizeButton = root.querySelector(".gdl-minimize");
        panel = root.querySelector(".gdl-panel");
        volumeSlider = root.querySelector(".gdl-volume");
        autoplayInput = root.querySelector(".gdl-autoplay");
        autoHideInput = root.querySelector(".gdl-autohide");
        streamSelect = root.querySelector(".gdl-station-select");

        streamSelect.value = String(settings.streamIndex);
        streamSelect.addEventListener("change", () => {
            setStation(Number(streamSelect.value));
        });

        root.querySelectorAll("[data-scope]").forEach((box) => {
            box.checked = !!settings.scopes[box.dataset.scope];
            box.addEventListener("change", () => {
                settings.scopes[box.dataset.scope] = box.checked;
                save();
                updateContext();
            });
        });

        autoHideInput.checked = settings.autoHideInactive;
        autoHideInput.addEventListener("change", () => {
            settings.autoHideInactive = autoHideInput.checked;
            save();
            updateContext();
            showToast(settings.autoHideInactive ? "Auto-hide when inactive enabled" : "Auto-hide disabled (Always visible)");
        });

        autoplayInput.checked = settings.autoplay;
        autoplayInput.addEventListener("change", () => {
            settings.autoplay = autoplayInput.checked;
            settings.userWantsPlaying = settings.autoplay;
            save();
            updateContext();
        });

        playButton.addEventListener("click", () => void (audio.paused ? play() : pause()));
        
        settingsButton.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePanel();
        });

        document.addEventListener("pointerdown", (e) => {
            if (expanded && root && !root.contains(e.target)) {
                togglePanel(false);
            }
        });

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
        
        new MutationObserver(updateContext).observe(document.documentElement, { childList: true, subtree: true });
        addEventListener("popstate", updateContext);
        
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
            return { playing: !audio.paused, volume: audio.volume, context: context(), disabled: settings.disabled, station: currentStream().name };
        }
    };
    
    window.GeoDuelsMusic = api;

    if (document.body) mount();
    else addEventListener("DOMContentLoaded", mount, { once: true });
})();
