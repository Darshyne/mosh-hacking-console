if (!globalThis.MoshHackingConsole?.launchConsole) {
  ui.notifications.error("MoSh — Hacking Console is not active or has not finished loading yet.");
} else {
  globalThis.MoshHackingConsole.launchConsole();
}
