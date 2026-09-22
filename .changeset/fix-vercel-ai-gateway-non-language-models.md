---
"roo-code-continue": patch
---

Fix Vercel AI Gateway model fetching: speech/transcription models (e.g. fish-audio, openai/tts, openai/whisper) omit `context_window`/`max_tokens`, which failed the whole `/models` schema validation and dropped all language models. The schema now treats those fields as optional and the non-language filter handles exclusion.
