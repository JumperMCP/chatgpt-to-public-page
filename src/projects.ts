import {
  contentType,
  isText,
  safePath,
  servingSettings,
  warningsFor,
} from "./files";
import {
  LIMITS,
  Problem,
  canonical,
  decoder,
  encoder,
  requireThat,
  sha256,
  type FileEntry,
  type Operation,
  type Project,
  type Revision,
  type StageInput,
  type Store,
} from "./types";

export class Projects {
  constructor(
    readonly store: Store,
    readonly subdomain: string,
    readonly now: () => number = Date.now,
  ) {}
  project(id: string): Project {
    const direct = this.store.get<Project>("project:" + id);
    if (direct) return direct;
    const matches = this.store
      .list<Project>("project:")
      .map(([, p]) => p)
      .filter((p) => p.name === id || this.url(p) === id);
    requireThat(
      matches.length === 1,
      matches.length ? "ambiguous_project" : "not_found",
      matches.length
        ? "Several projects have this name. Use a project ID."
        : "Project not found.",
      matches.length ? 409 : 404,
    );
    return matches[0];
  }
  url(project: Project) {
    return `https://${project.hostname}.${this.subdomain}.workers.dev`;
  }
  revision(id: string, project: string): Revision {
    const revision = this.store.get<Revision>("revision:" + id);
    requireThat(
      revision && revision.project === project,
      "not_found",
      "Revision not found or no longer retained.",
      404,
    );
    return revision;
  }
  base(project: Project, expected: string | null) {
    requireThat(
      project.head === expected,
      "conflict",
      "The project changed. Retrieve fresh state before editing.",
      409,
    );
  }
  bytes(file: FileEntry): Uint8Array {
    const out = new Uint8Array(file.size);
    for (
      let offset = 0, part = 0;
      offset < file.size;
      offset += LIMITS.chunkBytes, part++
    ) {
      const bytes = this.store.chunk(file.hash, part);
      requireThat(bytes, "storage_error", "Stored file is incomplete.", 500);
      out.set(bytes, offset);
    }
    return out;
  }
  usage() {
    return this.store
      .list<{ size: number }>("blob:")
      .reduce((sum, [, b]) => sum + b.size, 0);
  }
  list(cursor = "", limit = 20) {
    requireThat(
      Number.isInteger(limit) && limit > 0 && limit <= 50,
      "invalid_range",
      "Page size must be between 1 and 50.",
    );
    const all = this.store
      .list<Project>("project:")
      .map(([, p]) => p)
      .filter((p) => p.id > cursor);
    const items = all.slice(0, limit);
    return {
      projects: items.map((p) => ({ ...p, url: this.url(p) })),
      next_cursor: all.length > limit ? items.at(-1)!.id : null,
      retained_bytes: this.usage(),
      limit_bytes: LIMITS.retainedBytes,
    };
  }
  get(id: string, historyOffset = 0) {
    const p = this.project(id);
    requireThat(
      Number.isInteger(historyOffset) && historyOffset >= 0,
      "invalid_range",
      "Invalid history offset.",
    );
    return {
      ...p,
      url: this.url(p),
      manifest: p.head ? this.revision(p.head, p.id) : null,
      history: p.history.slice(historyOffset, historyOffset + 20),
      next_history_offset:
        p.history.length > historyOffset + 20 ? historyOffset + 20 : null,
    };
  }
  async stage(
    input: StageInput,
    imported = new Map<string, Uint8Array>(),
    request?: { key: string; digest: string },
  ): Promise<Revision> {
    if (request) {
      const saved = this.store.get<{ digest: string; revision: string }>(
        "request:" + request.key,
      );
      if (saved) {
        requireThat(
          saved.digest === request.digest,
          "request_key_reuse",
          "This request key was used with different input.",
          409,
        );
        const revision = this.store.get<Revision>("revision:" + saved.revision);
        requireThat(
          revision,
          "expired_candidate",
          "The original candidate expired. Use a new request key.",
          409,
        );
        return revision;
      }
    }
    const existing = input.project ? this.project(input.project) : undefined;
    let derived = (input.name ?? "site")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 43)
      .replace(/^-|-$/g, "");
    if (!/^[a-z]/.test(derived)) derived = "site-" + derived;
    if (derived.length < 2) derived += "-site";
    const hostname = input.hostname ?? derived.replace(/-$/, "");
    const project: Project = existing
      ? { ...existing }
      : {
          id: crypto.randomUUID(),
          name: input.name ?? "Untitled",
          hostname,
          head: null,
          live: null,
          history: [],
          created: this.now(),
          owned: false,
        };
    if (existing && input.hostname && input.hostname !== existing.hostname) {
      requireThat(
        !existing.owned &&
          !existing.head &&
          !this.store.get("remote:" + existing.id) &&
          !this.active(existing.id),
        "stable_hostname",
        "An owned or published hostname cannot be changed.",
        409,
      );
      project.hostname = input.hostname;
    }
    requireThat(
      existing || input.base_revision === null,
      "conflict",
      "A new project must have a null base revision.",
      409,
    );
    this.base(project, input.base_revision);
    requireThat(
      /^[a-z][a-z0-9-]{0,46}[a-z0-9]$/.test(project.hostname),
      "invalid_hostname",
      "Choose a hostname of 2–48 lowercase letters, digits, or hyphens, starting with a letter.",
    );
    requireThat(
      project.name.length <= 120,
      "invalid_name",
      "Project names may contain at most 120 characters.",
    );
    const source = input.candidate ?? project.head;
    const parent = source ? this.revision(source, project.id) : undefined;
    if (input.candidate)
      requireThat(
        parent?.base === input.base_revision,
        "conflict",
        "The candidate was based on an older publication.",
        409,
      );
    const files: Record<string, FileEntry> = { ...parent?.files };
    const changed = new Map<string, Uint8Array>();
    const warnings: string[] = [];
    const set = (raw: string, bytes: Uint8Array) => {
      const path = safePath(raw);
      requireThat(
        !changed.has(path),
        "duplicate_path",
        "Each file may be supplied only once.",
      );
      requireThat(
        bytes.length <= LIMITS.fileBytes,
        "too_large",
        "A file exceeds the size limit.",
      );
      changed.set(path, bytes);
    };
    for (const [path, bytes] of imported) set(path, bytes);
    for (const [path, text] of Object.entries(input.files ?? {})) {
      requireThat(
        encoder.encode(text).length <= LIMITS.textBytes,
        "too_large",
        "Attach large files instead of sending them as text.",
      );
      set(path, encoder.encode(text));
    }
    const deletes = new Set((input.deletes ?? []).map(safePath));
    for (const path of deletes) {
      requireThat(
        !changed.has(path),
        "invalid_change",
        "A file cannot be replaced and deleted together.",
      );
      delete files[path];
    }
    for (const patch of input.patches ?? []) {
      const path = safePath(patch.path);
      requireThat(
        !deletes.has(path),
        "invalid_change",
        "A deleted file cannot be patched.",
      );
      const previous =
        changed.get(path) ?? (files[path] && this.bytes(files[path]));
      requireThat(previous, "not_found", "Patch file not found.");
      let text: string;
      try {
        text = decoder.decode(previous);
      } catch {
        throw new Problem(
          "binary_file",
          "Binary files require complete replacement.",
        );
      }
      const at = text.indexOf(patch.old_string);
      requireThat(
        patch.old_string.length > 0 &&
          at >= 0 &&
          text.indexOf(patch.old_string, at + 1) === -1,
        "patch_mismatch",
        "Each old_string must match exactly once. No edits were applied.",
        409,
      );
      changed.set(
        path,
        encoder.encode(
          text.slice(0, at) +
            patch.new_string +
            text.slice(at + patch.old_string.length),
        ),
      );
    }
    for (const [path, bytes] of changed) {
      requireThat(
        bytes.length <= LIMITS.fileBytes,
        "too_large",
        "A file exceeds the size limit.",
      );
      const type = contentType(path);
      const hash = await sha256(bytes);
      if (isText(type)) {
        let after: string;
        try {
          after = decoder.decode(bytes);
        } catch {
          throw new Problem("invalid_text", "Text files must use UTF-8.");
        }
        warnings.push(
          ...warningsFor(
            path,
            files[path] ? decoder.decode(this.bytes(files[path])) : "",
            after,
          ),
        );
      }
      files[path] = { hash, size: bytes.length, type };
    }
    requireThat(
      files["index.html"],
      "missing_entry",
      "Upload ready-to-host output with an index.html entry point.",
    );
    requireThat(
      Object.keys(files).length <= LIMITS.files &&
        Object.values(files).reduce((sum, f) => sum + f.size, 0) <=
          LIMITS.projectBytes,
      "capacity",
      "Project capacity exceeded. Existing files have been preserved.",
    );
    const settings = servingSettings(
      files,
      (path) => decoder.decode(changed.get(path) ?? this.bytes(files[path])),
      input.spa,
      parent?.settings,
    );
    const revision: Revision = {
      id: crypto.randomUUID(),
      project: project.id,
      base: input.base_revision,
      files,
      settings,
      created: this.now(),
      warnings,
      changes: {
        added: Object.keys(files).filter((path) => !parent?.files[path]),
        modified: Object.keys(files).filter(
          (path) =>
            parent?.files[path] && parent.files[path].hash !== files[path].hash,
        ),
        deleted: Object.keys(parent?.files ?? {}).filter(
          (path) => !files[path],
        ),
        serving_changed:
          canonical(settings) !== canonical(parent?.settings ?? {}),
      },
    };
    this.store.transaction(() => {
      if (existing) this.base(this.project(existing.id), input.base_revision);
      else {
        requireThat(
          this.store.list("project:").length < LIMITS.projects,
          "capacity",
          "The installation has reached its project limit.",
        );
        requireThat(
          !this.store
            .list<Project>("project:")
            .some(([, p]) => p.hostname === hostname),
          "name_unavailable",
          "That hostname belongs to another project.",
          409,
        );
      }
      requireThat(
        !this.store
          .list<Project>("project:")
          .some(
            ([, p]) => p.id !== project.id && p.hostname === project.hostname,
          ),
        "name_unavailable",
        "That hostname belongs to another project.",
        409,
      );
      const unique = new Map(
        [...changed].map(([path, bytes]) => [files[path].hash, bytes]),
      );
      const added = [...unique].filter(
        ([hash]) => !this.store.get("blob:" + hash),
      );
      requireThat(
        this.usage() + added.reduce((n, [, b]) => n + b.length, 0) <=
          LIMITS.retainedBytes,
        "capacity",
        "Retained storage is full. Export and delete unused projects before retrying.",
      );
      for (const [hash, bytes] of added) {
        for (
          let at = 0, part = 0;
          at < bytes.length;
          at += LIMITS.chunkBytes, part++
        )
          this.store.putChunk(
            hash,
            part,
            bytes.slice(at, at + LIMITS.chunkBytes),
          );
        this.store.put("blob:" + hash, { size: bytes.length });
      }
      this.store.put("project:" + project.id, project);
      this.store.put("revision:" + revision.id, revision);
      if (request)
        this.store.put("request:" + request.key, {
          digest: request.digest,
          revision: revision.id,
        });
    });
    return revision;
  }
  publish(
    revisionId: string,
    base: string | null,
    acknowledgeWarnings = false,
  ): Operation {
    const revision = this.store.get<Revision>("revision:" + revisionId);
    requireThat(revision, "not_found", "Candidate revision not found.", 404);
    const prior = this.store.get<Operation>("operation:" + revisionId);
    if (prior && prior.state !== "failed") return prior;
    const project = this.project(revision.project);
    this.base(project, base);
    requireThat(
      revision.base === base,
      "conflict",
      "The candidate was created from a different base.",
      409,
    );
    requireThat(
      this.now() - revision.created < LIMITS.stagingMs,
      "expired_candidate",
      "The candidate has expired.",
    );
    requireThat(
      !revision.warnings.length || acknowledgeWarnings,
      "review_required",
      "Candidate remains private. Review its warnings, then explicitly acknowledge the intended rewrite.",
      409,
    );
    requireThat(
      !this.active(project.id),
      "busy",
      "Another operation is running for this project.",
      409,
    );
    const op: Operation = {
      id: revisionId,
      project: project.id,
      revision: revision.id,
      base,
      kind: "publish",
      state: "staged",
      attempts: 0,
      created: this.now(),
    };
    this.store.put("operation:" + op.id, op);
    return op;
  }
  active(project: string) {
    return this.store
      .list<Operation>("operation:")
      .map(([, op]) => op)
      .find(
        (op) =>
          op.project === project && !["failed", "published"].includes(op.state),
      );
  }
  async combined(
    input: StageInput,
    key: string,
    acknowledge = false,
    imported = new Map<string, Uint8Array>(),
  ) {
    requireThat(
      /^[\w-]{8,128}$/.test(key),
      "invalid_key",
      "Use a request key of 8–128 letters, digits, underscores or hyphens.",
    );
    const hashes = [];
    for (const [name, bytes] of imported)
      hashes.push([name, await sha256(bytes)]);
    const revision = await this.stage(input, imported, {
      key,
      digest: await sha256(canonical({ input, hashes: hashes.sort() })),
    });
    if (revision.warnings.length && !acknowledge)
      return { candidate: revision, state: "staged", review_required: true };
    return this.result(
      this.publish(revision.id, input.base_revision, acknowledge),
    );
  }
  result(op: Operation) {
    const p = this.project(op.project);
    return {
      ...op,
      url: this.url(p),
      changes: this.store.get<Revision>("revision:" + op.revision)?.changes,
      undo_hint:
        p.history.length > 1
          ? "Use restore_revision to undo the last publication."
          : null,
    };
  }
  read(
    id: string,
    revisionId: string | undefined,
    path: string,
    offset = 0,
    limit = 16000,
  ) {
    requireThat(
      Number.isInteger(offset) &&
        offset >= 0 &&
        Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 16000,
      "invalid_range",
      "Use a nonnegative character offset and limit up to 16000.",
    );
    const p = this.project(id),
      revision = this.revision(revisionId ?? p.head ?? "", p.id),
      file = revision.files[safePath(path)];
    requireThat(file, "not_found", "File not found.", 404);
    requireThat(
      isText(file.type),
      "binary_file",
      "Use export_project to download binary files.",
    );
    const text = decoder.decode(this.bytes(file));
    requireThat(
      offset <= text.length,
      "invalid_range",
      "Offset is past the end of the file.",
    );
    const end = Math.min(offset + limit, text.length);
    return {
      revision: revision.id,
      path,
      text: text.slice(offset, end),
      offset,
      end,
      total_characters: text.length,
      next_offset: end < text.length ? end : null,
    };
  }
  search(id: string, query: string, revisionId?: string, cursor = 0) {
    requireThat(
      query.length > 0 &&
        query.length <= 256 &&
        Number.isInteger(cursor) &&
        cursor >= 0,
      "invalid_search",
      "Supply 1–256 search characters and a nonnegative cursor.",
    );
    const p = this.project(id),
      r = this.revision(revisionId ?? p.head ?? "", p.id);
    const results: { path: string; offset: number; excerpt: string }[] = [];
    let match = 0;
    for (const [path, file] of Object.entries(r.files).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!isText(file.type)) continue;
      const text = decoder.decode(this.bytes(file));
      let at = -1;
      while ((at = text.indexOf(query, at + 1)) !== -1) {
        if (match++ < cursor) continue;
        if (results.length === 50)
          return { revision: r.id, matches: results, next_cursor: cursor + 50 };
        results.push({
          path,
          offset: at,
          excerpt: text.slice(Math.max(0, at - 60), at + query.length + 60),
        });
      }
    }
    return { revision: r.id, matches: results, next_cursor: null };
  }
  async restore(id: string, base: string | null, target?: string) {
    const p = this.project(id);
    this.base(p, base);
    const original = this.revision(target ?? p.history.at(-2) ?? "", p.id);
    const copy: Revision = {
      ...original,
      id: crypto.randomUUID(),
      base,
      created: this.now(),
      warnings: [],
    };
    this.store.put("revision:" + copy.id, copy);
    return this.result(this.publish(copy.id, base));
  }
  remove(
    id: string,
    base: string | null,
    kind: "unpublish" | "delete",
    confirmation?: string,
  ) {
    const p = this.project(id);
    this.base(p, base);
    if (kind === "delete")
      requireThat(
        confirmation === p.id,
        "confirmation_required",
        "Confirm deletion using the exact project ID.",
      );
    requireThat(
      !this.active(p.id),
      "busy",
      "Another operation is running.",
      409,
    );
    const op: Operation = {
      id: crypto.randomUUID(),
      project: p.id,
      base,
      revision: p.head ?? "",
      kind,
      state: "staged",
      attempts: 0,
      created: this.now(),
    };
    this.store.put("operation:" + op.id, op);
    return op;
  }
  collect() {
    this.store.transaction(() => {
      const retained = new Set<string>();
      for (const [, grant] of this.store.list<{
        revision: string;
        expires: number;
      }>("download:"))
        if (grant.expires > this.now()) retained.add(grant.revision);
      for (const [, p] of this.store.list<Project>("project:")) {
        if (p.head) retained.add(p.head);
        if (p.live) retained.add(p.live);
        for (const r of p.history) retained.add(r);
      }
      for (const [, op] of this.store.list<Operation>("operation:"))
        if (!["failed", "published"].includes(op.state))
          retained.add(op.revision);
      for (const [key, r] of this.store.list<Revision>("revision:"))
        if (
          !retained.has(r.id) &&
          (this.now() - r.created >= LIMITS.stagingMs ||
            this.store.get<Operation>("operation:" + r.id)?.state ===
              "published")
        )
          this.store.delete(key);
      for (const [key, project] of this.store.list<Project>("project:")) {
        if (
          !project.head &&
          !project.owned &&
          !this.active(project.id) &&
          !this.store
            .list<Revision>("revision:")
            .some(([, r]) => r.project === project.id)
        )
          this.store.delete(key);
      }
      const blobs = new Set(
        this.store
          .list<Revision>("revision:")
          .flatMap(([, r]) => Object.values(r.files).map((f) => f.hash)),
      );
      for (const [key] of this.store.list("blob:"))
        if (!blobs.has(key.slice(5))) {
          this.store.deleteChunks(key.slice(5));
          this.store.delete(key);
        }
    });
  }
}
