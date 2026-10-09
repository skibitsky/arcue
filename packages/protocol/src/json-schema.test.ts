import { describe, expect, it } from "vitest";
import { commands } from "./commands";
import { protocolJsonSchemas } from "./json-schema";
import { queries } from "./queries";

describe("protocolJsonSchemas", () => {
  const schemas = protocolJsonSchemas();

  it("covers every command and query except internal ones", () => {
    const internal = ["view.moveAsset", "view.releaseAsset", "view.reportFocus", "view.reportState", "view.showAsset"];
    const expected = [...Object.keys(commands).filter((name) => !internal.includes(name)), ...Object.keys(queries)];
    expect(Object.keys(schemas).sort()).toEqual(expected.sort());
  });

  it("writes bytes as base64 strings", () => {
    const create = schemas["comment.create"]?.input.properties?.screenshot;
    expect(create).toEqual({ anyOf: [{ type: "string", contentEncoding: "base64" }, { type: "null" }] });
    expect(schemas["view.screenshot"]?.output.properties?.png).toEqual({ type: "string", contentEncoding: "base64" });
  });

  it("writes a void result as null", () => {
    expect(schemas["asset.close"]?.output).toMatchObject({ type: "null" });
  });

  it("leaves inputs with defaults optional", () => {
    expect(schemas["view.screenshot"]?.input.required).toEqual(["assetId"]);
  });
});
