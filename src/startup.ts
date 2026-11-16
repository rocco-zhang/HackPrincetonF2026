// Let the lightweight HTML start screen paint before loading the game engine.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    void import("./main").catch(error => {
      console.error("Game startup failed", error);
      document.getElementById("gateMsg")!.textContent = "Game failed to load. Refresh to try again.";
    });
  });
});
