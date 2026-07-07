# MoSh — Hacking Console

Interactive hacking console for the MoSh system and the *Hacker's Handbook* rules.

## V0.6.0

- Renamed module id from `mosh-hacking-console-fr` to `mosh-hacking-console`.
- English becomes the source language.
- Updated dependency to `mosh-hackers-handbook` `0.9.5+`.
- Software detection now reads the new handbook flag namespace first and falls back to the former `mosh-hackers-handbook-fr` namespace for compatibility.
- GM console remains authoritative: players send intents, the GM console applies state changes and broadcasts the canonical state.
- Default demo journals and the standard Intrusion Reaction table are now generated in English.
