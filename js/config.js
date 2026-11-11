/* ====== SETTINGS: this is the only file to edit when deploying ====== */
window.LT_CONFIG = {
  // The ".../exec" URL of the Apps Script web app (see README.md).
  // If left empty, the page runs in LOCAL MODE: everything works, but votes and the
  // leaderboard are only aggregated on this computer (in this browser).
  API_URL: "",

  // Default session code. Can be overridden in the link: index.html?s=KEST26
  // Tip: use the SAME code for both sessions, so the leaderboard accumulates.
  SESSION: "KEST26",

  // Instructor and course (shown in the header and the footer)
  INSTRUCTOR: "dr. Arnold Csonka",
  COURSE: "AI-supported planning in logistics (AGELG157N)",
  INSTITUTION: "Hungarian University of Agriculture and Life Sciences (MATE) · Kaposvár Campus",

  // Official MATE logo (optional). The white (negative) version suits the green header.
  // Put the file into the repository (e.g. assets/mate-logo.png) and give its path here.
  LOGO_URL: "",

  // AI services offered on the AI cards (they open in a new tab)
  AI_LINKS: [
    { name: "Copilot", url: "https://m365.cloud.microsoft/chat" },
    { name: "Gemini", url: "https://gemini.google.com/app" },
    { name: "Claude", url: "https://claude.ai/new" },
    { name: "ChatGPT", url: "https://chatgpt.com/" }
  ],

  // Refresh interval (ms): student view and instructor projector view
  POLL_STUDENT: 8000,
  POLL_TEACHER: 4000
};
