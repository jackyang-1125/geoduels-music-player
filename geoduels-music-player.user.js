// ==UserScript==
// @name         GeoDuels Lofi / Chill Player
// @namespace    https://geoduels.io/
// @version      2.2.1
// @description  Minimal Lofi / Chill player for GeoDuels. Fixes audio delay/buffer issues.
// @match        https://geoduels.io/*
// @match        https://*.geoduels.io/*
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    if (window.top !== window.self) return;

    const KEY = "geoduels-lofi-player:v2";
    const STREAM_URL = "https://stream.nightride.fm/chillsynth.mp3"; 
    
    const defaults = {
        volume: 0.55,
        autoplay: true,
        disabled: false,
        scopes: { lobby: true, single: false, duel: false },
        position: null
    };

    function parse(raw) {
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    }

    const saved = parse(localStorage.getItem(KEY)) || {};
    const settings = {
        volume: Number.isFinite(saved.volume) ? saved.volume : defaults.volume,
        autoplay: typeof saved.autoplay === "boolean" ? saved.autoplay : defaults.autoplay,
        disabled: typeof saved.disabled === "boolean" ? saved.disabled : defaults.disabled,
        scopes: { ...defaults.scopes, ...(saved.scopes || {}) },
        position: saved.position || null
    };

    const audio = new Audio();
    audio.preload = "none";
    audio.volume = Math.max(0, Math.min(1, settings.volume));

    let root, playButton, panel, volume, autoplayInput, expanded = false, lastContext = "";
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
                transform: translateX(-50%);
                background: rgba(11, 18, 29, 0.95);
                border: 1px solid #65d4a6;
                color: #fff;
                padding: 8px 16px;
                border-radius: 20px;
                font: 12px/1.4 system-ui, sans-serif;
                z-index: 2147483647;
                box-shadow: 0 4px 14px rgba(0,0,0,0.4);
                transition: opacity 0.3s, transform 0.3s;
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
        }, 3200);
    }

    function context() {
        const inGame = /^\/match\//.test(location.pathname) ||
            !!document.querySelector('iframe[src*="google.com/maps/embed"], [data-testid="minimap-panel"], [data-testid="timer-pill"]');
        return !inGame ? "lobby" : document.querySelector('[data-testid="timer-pill"]') ? "duel" : "single";
    }

    function updateContext() {
        if (!root) return;
        if (settings.disabled) {
            root.hidden = true;
            panel.hidden = true;
            pause();
            return;
        }

        const place = context();
        root.hidden = !settings.scopes[place];
        panel.hidden = !expanded;
        
        if (place !== lastContext) {
            lastContext = place;
            if (settings.scopes[place]) {
                if (settings.autoplay || !audio.paused) void tryAutoplay();
            } else {
                pause();
            }
        }
    }

    function render() {
        if (!root) return;
        playButton.classList.toggle("is-playing", !audio.paused);
        playButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
        volume.value = String(Math.round(audio.volume * 100));
        updateContext();
    }

    function play() {
        if (settings.disabled) return Promise.resolve(false);
        
        if (audio.paused || !audio.src) {
            audio.src = STREAM_URL;
            audio.load();
        }
        
        return audio.play().then(() => {
            pendingAutoplay = false;
            render();
            emit();
            return true;
        }).catch(() => {
            render();
            return false;
        });
    }

    function tryAutoplay() {
        if (settings.disabled || !settings.autoplay) return Promise.resolve(false);
        
        if (audio.paused || !audio.src) {
            audio.src = STREAM_URL;
            audio.load();
        }
        
        return audio.play().then(() => {
            pendingAutoplay = false;
            render();
            emit();
            return true;
        }).catch(() => {
            pendingAutoplay = true;
            const unlock = () => {
                if (pendingAutoplay && audio.paused && settings.autoplay && !settings.disabled && settings.scopes[context()]) {
                    play();
                }
                window.removeEventListener("pointerdown", unlock);
                window.removeEventListener("keydown", unlock);
            };
            window.addEventListener("pointerdown", unlock, { once: true });
            window.addEventListener("keydown", unlock, { once: true });
            return false;
        });
    }

    function pause() {
        audio.pause();
        pendingAutoplay = false;
        render();
        emit();
    }

    function shutdown() {
        settings.disabled = true;
        pause();
        audio.removeAttribute("src");
        audio.load();
        expanded = false;
        save();
        updateContext();
        showToast("Player completely shut down. Press Alt + Shift + M to restart.");
    }

    function revive() {
        settings.disabled = false;
        save();
        updateContext();
        render();
        if (settings.autoplay) {
            tryAutoplay();
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
        root.innerHTML = `
        <style>
            #geoduels-lofi-player {
                position: fixed;
                z-index: 2147483647;
                top: 18px;
                right: 190px;
                width: 108px;
                color: #fff;
                font: 12px/1 system-ui, sans-serif;
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                -webkit-user-drag: none;
            }
            #geoduels-lofi-player[hidden] { display: none !important; }
            #geoduels-lofi-player .gdl-card { border: 1px solid #65d4a6; border-radius: 9px; background: #0b121ded; box-shadow: 0 4px 18px #0008; backdrop-filter: blur(4px); }
            #geoduels-lofi-player .gdl-row { display: flex; gap: 4px; padding: 6px; }
            #geoduels-lofi-player button { border: 0; border-radius: 5px; padding: 7px 8px; color: #fff; background: #ffffff18; cursor: pointer; font: inherit; font-weight: 700; transition: background 0.15s, color 0.15s; }
            #geoduels-lofi-player button:hover { background: #ffffff33; }
            #geoduels-lofi-player .gdl-play { display: grid; width: 30px; place-items: center; background: #168f63; }
            .gdl-play-icon { font-size: 12px; }
            .gdl-pause-icon { display: none; gap: 3px; }
            .gdl-pause-icon i { display: block; width: 3px; height: 12px; border-radius: 1px; background: #fff; }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-play-icon { display: none; }
            #geoduels-lofi-player .gdl-play.is-playing .gdl-pause-icon { display: flex; }
            #geoduels-lofi-player .gdl-minimize { color: #a0aec0; }
            #geoduels-lofi-player .gdl-minimize:hover { background: rgba(255, 255, 255, 0.25); color: #fff; }
            #geoduels-lofi-player .gdl-panel { position: absolute; top: 43px; right: 0; width: 154px; padding: 7px; border: 1px solid #65d4a6; border-radius: 8px; background: #0b121df7; box-shadow: 0 4px 18px #0008; }
            #geoduels-lofi-player label { display: block; margin: 6px 0 3px; color: #c7d4df; font-size: 10px; }
            #geoduels-lofi-player .gdl-scopes { display: flex; gap: 5px; }
            #geoduels-lofi-player .gdl-scopes label, #geoduels-lofi-player .gdl-toggle-label { display: flex; align-items: center; gap: 3px; margin: 0; }
            #geoduels-lofi-player .gdl-toggle-row { margin: 6px 0 2px; }
            #geoduels-lofi-player input[type=range] { width: 100%; accent-color: #65d4a6; }
            #geoduels-lofi-player .gdl-note { margin: 6px 0 0; color: #9eb1bf; font-size: 9px; line-height: 1.3; }
            #geoduels-lofi-player .gdl-shutdown-btn { width: 100%; margin-top: 8px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #ff9999; font-size: 10px; padding: 5px; }
            #geoduels-lofi-player .gdl-shutdown-btn:hover { background: rgba(239, 68, 68, 0.4); color: #fff; }
        </style>
        <div class="gdl-card">
            <div class="gdl-row">
                <button class="gdl-play" type="button" aria-label="Play">
                    <span class="gdl-play-icon">▶</span>
                    <span class="gdl-pause-icon"><i></i><i></i></span>
                </button>
                <button class="gdl-settings" type="button" title="Settings" aria-label="Settings">⚙</button>
                <button class="gdl-minimize" type="button" title="Minimize UI (Alt + H)" aria-label="Minimize">–</button>
            </div>
            <div class="gdl-panel" hidden>
                <label>Play in</label>
                <div class="gdl-scopes">
                    <label><input data-scope="lobby" type="checkbox">Lobby</label>
                    <label><input data-scope="single" type="checkbox">Solo</label>
                    <label><input data-scope="duel" type="checkbox">Duel</label>
                </div>
                <div class="gdl-toggle-row">
                    <label class="gdl-toggle-label"><input class="gdl-autoplay" type="checkbox">Autoplay</label>
                </div>
                <label>Volume</label>
                <input class="gdl-volume" type="range" min="0" max="100" aria-label="Volume">
                <p class="gdl-note">Alt+H: Min/Show | Alt+P: Play<br>Alt+↑/↓: Vol | Alt+Shift+M: App</p>
                <button class="gdl-shutdown-btn" type="button">Shutdown App</button>
            </div>
        </div>`;
        
        document.body.append(root);
        
        playButton = root.querySelector(".gdl-play");
        panel = root.querySelector(".gdl-panel");
        volume = root.querySelector(".gdl-volume");
        autoplayInput = root.querySelector(".gdl-autoplay");

        root.addEventListener("dragstart", (e) => e.preventDefault());

        root.querySelectorAll("[data-scope]").forEach((box) => {
            box.checked = settings.scopes[box.dataset.scope];
            box.addEventListener("change", () => {
                settings.scopes[box.dataset.scope] = box.checked;
                save();
                updateContext();
            });
        });

        autoplayInput.checked = settings.autoplay;
        autoplayInput.addEventListener("change", () => {
            settings.autoplay = autoplayInput.checked;
            save();
        });

        playButton.addEventListener("click", () => void (audio.paused ? play() : pause()));
        
        root.querySelector(".gdl-settings").addEventListener("click", () => {
            expanded = !expanded;
            updateContext();
        });

        root.querySelector(".gdl-minimize").addEventListener("click", () => {
            const place = context();
            settings.scopes[place] = false;
            save();
            updateContext();
            const targetBox = root?.querySelector(`[data-scope="${place}"]`);
            if (targetBox) targetBox.checked = false;
            showToast("UI Minimized. Press Alt + H to restore.");
        });

        root.querySelector(".gdl-shutdown-btn").addEventListener("click", () => {
            const confirmed = window.confirm("Are you sure you want to completely shut down the music player?\n\nAudio will stop completely. To turn it back on later, press:\nAlt + Shift + M");
            if (confirmed) {
                shutdown();
            }
        });

        volume.addEventListener("input", () => {
            audio.volume = Number(volume.value) / 100;
            settings.volume = audio.volume;
            save(); emit();
        });

        if (settings.position && Number.isFinite(settings.position.x) && Number.isFinite(settings.position.y) &&
            settings.position.x >= 0 && settings.position.y >= 0 && 
            settings.position.x < innerWidth - 20 && settings.position.y < innerHeight - 20) {
            root.style.left = `${settings.position.x}px`;
            root.style.top = `${settings.position.y}px`;
            root.style.right = "auto";
        }

        let drag = null;
        root.addEventListener("pointerdown", (event) => {
            if (['BUTTON', 'INPUT', 'LABEL', 'I', 'SPAN'].includes(event.target.tagName)) return;
            drag = { x: event.clientX, y: event.clientY, left: root.offsetLeft, top: root.offsetTop, moved: false };
            root.setPointerCapture(event.pointerId);
        });

        root.addEventListener("pointermove", (event) => {
            if (!drag) return;
            const x = Math.max(0, Math.min(innerWidth - root.offsetWidth, drag.left + event.clientX - drag.x));
            const y = Math.max(0, Math.min(innerHeight - root.offsetHeight, drag.top + event.clientY - drag.y));
            if (Math.abs(event.clientX - drag.x) > 4 || Math.abs(event.clientY - drag.y) > 4) drag.moved = true;
            root.style.left = `${x}px`;
            root.style.top = `${y}px`;
            root.style.right = "auto";
        });

        const stopDrag = (event) => {
            if (root.hasPointerCapture(event.pointerId)) {
                root.releasePointerCapture(event.pointerId);
            }
            if (!drag) return;
            settings.position = { x: root.offsetLeft, y: root.offsetTop };
            save();
            drag = null;
        };

        root.addEventListener("pointerup", stopDrag);
        root.addEventListener("pointercancel", stopDrag);

        render();
        
        new MutationObserver(updateContext).observe(document.documentElement, { childList: true, subtree: true });
        addEventListener("popstate", updateContext);
        
        if (settings.autoplay && !settings.disabled) {
            void tryAutoplay();
        }
    }

    window.addEventListener("keydown", (event) => {
        if (['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) return;

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
            const place = context();
            const willShow = !settings.scopes[place];
            settings.scopes[place] = willShow;
            save();
            updateContext();
            const targetBox = root?.querySelector(`[data-scope="${place}"]`);
            if (targetBox) targetBox.checked = willShow;
            showToast(willShow ? `UI Restored (${place})` : `UI Minimized (Alt + H to restore)`);
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === 'p' || event.key === 'P')) {
            event.preventDefault();
            void (audio.paused ? play() : pause());
            showToast(audio.paused ? "Paused" : "Playing");
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowUp') {
            event.preventDefault();
            api.setVolume(audio.volume + 0.05);
            showToast(`Volume: ${Math.round(audio.volume * 100)}%`);
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key === 'ArrowDown') {
            event.preventDefault();
            api.setVolume(audio.volume - 0.05);
            showToast(`Volume: ${Math.round(audio.volume * 100)}%`);
            return;
        }
    });

    audio.addEventListener("play", () => { render(); emit(); });
    audio.addEventListener("pause", () => { render(); emit(); });
    
    const api = {
        play, pause, shutdown, revive,
        toggle: () => audio.paused ? play() : (pause(), Promise.resolve(true)),
        setVolume(value) {
            audio.volume = Math.max(0, Math.min(1, Number(value)));
            settings.volume = audio.volume;
            save(); render(); emit();
        },
        getState() {
            return { playing: !audio.paused, volume: audio.volume, context: context(), disabled: settings.disabled, stream: "Lofi / Chill" };
        }
    };
    
    window.GeoDuelsMusic = api;
    
    if (document.body) mount();
    else addEventListener("DOMContentLoaded", mount, { once: true });
})();
