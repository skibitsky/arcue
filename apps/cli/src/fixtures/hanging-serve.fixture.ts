import { Server } from "node:http";

/** Loaded with `--import` before `arcue.js`: no HTTP server finishes closing, so `arcue serve`'s close never ends. */
Server.prototype.close = function (this: Server) {
  return this;
};
