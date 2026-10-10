declare module "virtual:arcue-samples" {
  import type { CompositionFile } from "@arcue/protocol";

  const samples: readonly {
    id: string;
    file: string;
    description: string;
    gallery: boolean;
    files: readonly string[];
    composition?: CompositionFile;
  }[];
  export default samples;
}
