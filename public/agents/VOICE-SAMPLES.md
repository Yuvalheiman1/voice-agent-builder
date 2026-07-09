# Persona voice samples (drop-in)

Add a short (~3–6s) clip per persona so the ▶ **Hear voice** button on the persona
picker plays it. Filename must be `<personaId>-sample.mp3` in this folder. A missing
file simply disables the button (no crash) - drop the mp3 in and it lights up.

| Persona | File | Voice | Where to grab it |
|---------|------|-------|------------------|
| Ellie | `ellie-sample.mp3` | Layla (Vapi) | Vapi dashboard → Voices → Layla → preview |
| Vera  | `vera-sample.mp3`  | Savannah (Vapi) | Vapi dashboard → Voices → Savannah |
| Theo  | `theo-sample.mp3`  | Nico (Vapi) | Vapi dashboard → Voices → Nico |
| Remi  | `remi-sample.mp3`  | Jessica (ElevenLabs · `cgSgspJ2msm6clMCkdW9`) | elevenlabs.io → Voice Library → Jessica |
| Vince | `vince-sample.mp3` | Liam (ElevenLabs · `TX3LPaxmHKxFdv7VOQHJ`) | elevenlabs.io → Voice Library → Liam |

Tip: keep them small (mono, ~64–96kbps mp3) - they're loaded on demand (`preload="none"`),
only when someone taps ▶.
