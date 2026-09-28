import "./style.css";
import { PhotoBlast } from "./game/PhotoBlast";

const canvas = document.getElementById("game-canvas");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game-canvas");
}

new PhotoBlast(canvas);
