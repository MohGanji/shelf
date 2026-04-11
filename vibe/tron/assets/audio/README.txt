P8.2 music (optional)
---------------------
The game expects two loop MP3s if present (see js/config.js MUSIC_ASSET_URLS):
  music-lobby.mp3      — lobby / garage / editor ambience
  music-gameplay.mp3   — campaign arena combat

Generate with ElevenLabs (requires ELEVENLABS_API_KEY):
  node scripts/elevenlabs-music.mjs

If these files are missing or fail to load, js/engine/audio.js uses built-in procedural beds.
