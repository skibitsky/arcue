declare module "virtual:arcue-samples" {
  const samples: readonly { id: string; file: string; description: string; files: readonly string[] }[];
  export default samples;
}
