# MoSh — Hacking Console

Interactive hacking console for the MoSh system and the *Hacker's Handbook* rules.

## Legal

This module is an **unofficial** fan project, not affiliated with Tuesday
Knight Games. Mothership© is the property of Tuesday Knight Games —
[tuesdayknightgames.com](https://www.tuesdayknightgames.com/). All related
rights and trademarks belong to their respective owners. This module is
distributed free of charge for non-commercial purposes.

## V0.6.0

- Renamed module id from `mosh-hacking-console-fr` to `mosh-hacking-console`.
- English becomes the source language.
- Updated dependency to `mosh-hackers-handbook` `0.9.5+`.
- Software detection now reads the new handbook flag namespace first and falls back to the former `mosh-hackers-handbook-fr` namespace for compatibility.
- GM console remains authoritative: players send intents, the GM console applies state changes and broadcasts the canonical state.
- Default demo journals and the standard Intrusion Reaction table are now generated in English.

## V0.7.0 — Hacking Network Builder

First version of the in-Foundry network editor.

- Opens a dedicated **Hacking Network Builder** window.
- Loads existing Journals marked as `HACK_SYSTEM`.
- Displays nodes on the same grid used by the hacking console.
- Lets the GM drag nodes and snap them to grid positions.
- Lets the GM edit core node fields: Node, Network, Function, Security, Reaction, Grid, Connections, GM Description, Data, Success, and Failure.
- Saves changes back into the source Journal pages.
- Active hacking sessions are not automatically changed; the GM must explicitly reload the system in the console.

## V0.7.1 — Builder grid and new system

- Added a **New system** button to the Hacking Network Builder.
- The button creates a new `HACK_SYSTEM` Journal with:
  - `_CONFIG` page;
  - one initial entry node;
  - proper module flag.
- Added a visible grid behind the nodes.
- Dragged nodes snap to the same grid used by the console layout.

## V0.7.2 — Centered builder grid

- Shifted the visible builder grid so intersections align with node centers.
- Added a small center point on builder nodes to make the snap position visually clear.

## V0.7.3 — Security levels cleanup

- Removed `BROKEN` from the Network Builder security level list.
- The supported security levels are now:
  - `UNSECURED`
  - `SECURE`
  - `HARDENED`
  - `ENCRYPTED`
- Legacy text containing `Broken`, `Cassé`, or `HS` is no longer normalized as a separate node security level.

## V0.7.4 — UNSECURED normalization fix

- Fixed a bug where selecting `UNSECURED` in the Network Builder could be normalized back to `SECURE`.
- Cause: `UNSECURED` contains the substring `SECURE`, so the security parser now checks `UNSECURED` before `SECURE`.

## V0.7.5 — Draggable node library

- Added a node library to the Network Builder.
- Node types can be dragged from the library onto the grid.
- Dropped nodes snap to the grid and are added to the current source Journal on save.
- New unsaved nodes are created as new Journal pages when using **Save to Journal**.
- Initial library includes Terminal, Databank, Router, Firewall, Infrastructure, Uplink, Mobile Terminal, and Encrypted Databank.

## V0.7.6 — Basic link editor

- Added Builder modes:
  - **Select / Move**
  - **Create link**
  - **Delete link**
- Nodes now show four link ports: top, right, bottom, left.
- In **Create link** mode:
  - click a port on the first node;
  - click a port on another node;
  - a logical bidirectional connection is created.
- In **Delete link** mode:
  - click a visible link to remove it.
- Link creation and deletion update the `Connections` field, so the existing hacking logic for discovery, accessibility, and routers is preserved.

## V0.7.7 — Builder link ports fix

- Fixed a bug where link ports were not rendered on nodes inside the Network Builder.
- Link ports are now only added to the Builder node markup, not the player/GM hacking console node markup.
