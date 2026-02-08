import { Game } from "./game/Game.js";

const canvas = document.getElementById("game");
const loadingEl = document.getElementById("loading");

const game = new Game({ canvas, loadingEl });
window.chickenGame = game;

game.init().catch((error) => {
  console.error(error);
  loadingEl?.classList.remove("hidden");
  loadingEl?.classList.add("error");
});

window.addEventListener("beforeunload", () => {
  game.destroy();
});
