P8.2 music (optional)
---------------------
If present (see js/config.js MUSIC_ASSET_URLS):
  music-lobby-v1.mp3        — lobby / garage / editor ambience stem A (default)
  music-lobby-v2.mp3        — lobby stem B (Dev HUD: lobby music variant 0|1)
  music-gameplay-v1.mp3     — campaign combat stem A (odd arenas: level-1, level-3, …)
  music-gameplay-v2.mp3     — campaign combat stem B (even arenas: level-2, level-4, …); Dev HUD can override for WIP / testing

Generate lobby + one gameplay file with ElevenLabs (requires ELEVENLABS_API_KEY):
  node scripts/elevenlabs-music.mjs
  (copy/rename a second gameplay stem to music-gameplay-v2.mp3 if you want variant B)

Prompts in that script describe mood and genre only (menu/hub ambience + arcade combat), and avoid names of films, games, or artists, so they stay within the provider’s terms. Use the same idea if you type prompts manually in the ElevenLabs UI.

If these files are missing or fail to load, js/engine/audio.js uses built-in procedural beds.
