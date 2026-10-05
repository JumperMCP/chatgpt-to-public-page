import { Zip, ZipPassThrough } from "fflate";
import { LIMITS, requireThat, type Revision, type Store } from "./types";
export function exportStream(revision: Revision, store: Store) {
  const entries = Object.entries(revision.files),
    output: Uint8Array[] = [];
  let index = 0,
    part = 0,
    item: ZipPassThrough | undefined,
    ended = false,
    failure: Error | null = null;
  const zip = new Zip((error, bytes, final) => {
    if (error) failure = error;
    if (bytes.length) output.push(bytes);
    if (final) ended = true;
  });
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        while (!output.length && !ended) {
          if (index === entries.length) {
            zip.end();
            break;
          }
          const [name, file] = entries[index];
          if (!item) {
            item = new ZipPassThrough(name);
            zip.add(item);
          }
          const bytes = file.size
            ? store.chunk(file.hash, part)
            : new Uint8Array();
          requireThat(
            bytes,
            "storage_error",
            "A stored export chunk is missing.",
            500,
          );
          const last = (part + 1) * LIMITS.chunkBytes >= file.size;
          item.push(bytes, last);
          part++;
          if (last) {
            index++;
            part = 0;
            item = undefined;
          }
        }
        if (failure) throw failure;
        if (output.length) controller.enqueue(output.shift()!);
        if (ended && !output.length) controller.close();
      } catch (error) {
        zip.terminate();
        controller.error(error);
      }
    },
    cancel() {
      zip.terminate();
      output.length = 0;
    },
  });
}
