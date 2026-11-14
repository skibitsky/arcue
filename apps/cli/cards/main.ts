import { App } from "@modelcontextprotocol/ext-apps";
import { Card } from "./card";
import "./card.css";

const root = document.getElementById("card");
if (!root) throw new Error("The card's page has no root.");
const app = new App({ name: "Arcue", version: "1" }, { availableDisplayModes: ["inline", "fullscreen"] });
const card = new Card(root, app);
await app.connect();
card.started();
