export const softwareRendering = process.platform !== "darwin" || process.env.ARCUE_E2E_SOFTWARE === "1";

export const rendererSwitches = softwareRendering ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [];
