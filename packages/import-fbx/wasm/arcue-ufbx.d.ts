export interface ArcueUfbxModule {
  readonly HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  /** Parses FBX bytes and returns a pointer to the result buffer, which `_arcue_free` releases. */
  _arcue_import(data: number, size: number): number;
  _arcue_free(result: number): void;
}

export default function createArcueUfbx(): Promise<ArcueUfbxModule>;
