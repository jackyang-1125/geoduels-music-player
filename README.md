# GeoDuels music Player

A minimal, lightweight Userscript designed for [GeoDuels](https://geoduels.io/) that integrates a chill instrumental synth stream directly into the lobby and game interfaces.

## Features

- **Context-Aware Playback**: Automatically adapts based on your current state (`Lobby`, `Solo`, or `Duel`).
- **Persistent Settings**: Remembers your volume, panel preferences, and widget position via `localStorage`.
- **Draggable Widget**: Easily reposition the player anywhere on your screen.
- **Compact Mode**: Automatically minimizes during matches to stay out of your way.
- **External API Control**: Control playback programmatically via `window.GeoDuelsMusic`.

## Installation

1. Install a Userscript manager browser extension, such as **Tampermonkey**, **Violentmonkey**, or **Greasemonkey**.
2. Create a new script, paste the provided code, and save it.
3. Navigate to [GeoDuels](https://geoduels.io/), and the player widget will appear in the top-right corner.

## Configuration & Usage

### Play / Pause

Click the primary play button to toggle audio playback.

### Settings Panel

Click the gear (`⚙`) icon to choose where the music plays:

- **Lobby**: Always active in the lobby.
- **Solo**: Optional playback during single-player games.
- **Duel**: Optional playback during competitive duels.

### Volume Slider

Adjust the volume to your liking. The selected volume persists across sessions.

## Developer API

You can interact with the player programmatically using the global `window.GeoDuelsMusic` object:

```javascript
// Start playing
GeoDuelsMusic.play();

// Pause playback
GeoDuelsMusic.pause();

// Toggle play/pause state
GeoDuelsMusic.toggle();

// Set volume (range: 0.0 to 1.0)
GeoDuelsMusic.setVolume(0.4);

// Get current player state
const state = GeoDuelsMusic.getState();
console.log(state);
// { playing: true, volume: 0.4, context: "lobby", stream: "Lofi / Chill" }
```

### Events

The player also dispatches a custom window event whenever the state changes:

```javascript
window.addEventListener("geoduels-music:statechange", (event) => {
    console.log("Music state changed:", event.detail);
});
```
