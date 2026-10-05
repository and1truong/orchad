import {
  appId,
  failure,
  type Bridge,
  type Invoke,
  type Result,
} from "../shared/contract.ts";
import { catalog } from "../shared/catalog.ts";
import type { Document, Operation } from "../shared/domain.ts";
export class ApplicationController {
  private csrf = "";
  private listeners = new Set<() => void>();
  document: Document | null = null;
  selectionIds: string[] = [];
  principal: { id: string; role: string } | null = null;
  documents: Pick<Document, "id" | "title" | "summary" | "revision">[] = [];
  lastMutationId: string | null = null;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  notify() {
    for (const fn of this.listeners) fn();
  }
  private async request(path: string, body?: unknown) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: body
        ? { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }
        : {},
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(data.error?.message ?? "Request failed"), {
        result: data,
      });
    return data;
  }
  async restore() {
    try {
      const session = await this.request("/api/session");
      this.principal = session.principal;
      this.csrf = session.csrf;
      await this.loadDocuments();
    } catch (e) {
      if ((e as any).result?.error?.code === "UNAUTHORIZED") {
        this.principal = null;
        this.document = null;
        this.csrf = "";
      }
      // Transient failures keep the current view; the next poll retries.
    }
    this.notify();
  }
  async login(username: string, password: string) {
    const s = await this.request("/api/login", { username, password });
    this.principal = s.principal;
    this.csrf = s.csrf;
    await this.loadDocuments();
    this.notify();
  }
  async logout() {
    await this.request("/api/logout", {});
    this.principal = null;
    this.csrf = "";
    this.document = null;
    this.selectionIds = [];
    this.notify();
  }
  async loadDocuments() {
    this.documents = (await this.request("/api/documents")).documents;
    const current = this.document?.id;
    const next =
      this.documents.find((d) => d.id === current)?.id ??
      this.documents.find((d) => d.id === "rca-consumer-lag")?.id ??
      this.documents[0]?.id;
    if (!next) {
      this.document = null;
      this.selectionIds = [];
      return;
    }
    await this.open(next);
  }
  async open(id: string) {
    const document = await this.request(
      "/api/documents/" + encodeURIComponent(id),
    );
    this.document = document;
    this.selectionIds = [];
    this.lastMutationId = null;
    this.notify();
  }
  async refresh() {
    const id = this.document?.id;
    if (!id) return;
    const d = await this.request("/api/documents/" + encodeURIComponent(id));
    if (this.document?.id === id) {
      this.document = d;
      this.selectionIds = this.selectionIds.filter(
        (id) =>
          d.graph.nodes.some((n: any) => n.id === id) ||
          d.graph.edges.some((e: any) => e.id === id),
      );
      this.notify();
    }
  }
  select(ids: string[]) {
    this.selectionIds = ids;
    this.notify();
  }
  async invoke(call: Invoke): Promise<Result> {
    if (!this.document || call.documentId !== this.document.id)
      return failure(
        "TARGET_CLOSED",
        "Current document no longer matches request",
      );
    try {
      const result = await this.request("/api/invoke", call);
      if (
        result.ok &&
        call.expectedRevision !== null &&
        this.document?.id === call.documentId
      ) {
        this.lastMutationId = result.data.mutationId;
        try {
          await this.refresh();
        } catch {
          /* Commit already acknowledged; polling will reconcile UI. */
        }
      }
      return result;
    } catch (e) {
      return (
        (e as any).result ??
        failure(
          "INTERNAL",
          "Connection lost; mutation outcome unknown. Do not automatically retry.",
          true,
        )
      );
    }
  }
  async mutate(toolName: string, args: Record<string, unknown>, human = false) {
    if (!this.document) return failure("TARGET_CLOSED", "No active document");
    const call: Invoke = {
      requestId: crypto.randomUUID(),
      documentId: this.document.id,
      toolName,
      arguments: args,
      expectedRevision: this.document.revision,
      idempotencyKey: crypto.randomUUID(),
    };
    if (!human) return this.invoke(call);
    try {
      const result = await this.request("/api/human/accept-conclusion", call);
      if (this.document?.id === call.documentId) {
        this.lastMutationId = result.data.mutationId;
        try {
          await this.refresh();
        } catch {
          /* Already acknowledged; polling reconciles. */
        }
      }
      return result;
    } catch (e) {
      return (e as any).result ?? failure("INTERNAL", "Request failed");
    }
  }
  patch(operations: Operation[]) {
    return this.mutate("canvas_apply_patch", { operations });
  }
  bridge(): Bridge {
    return {
      describe: async () => ({
        protocolVersion: "0.1",
        appId,
        tools: structuredClone(catalog),
      }),
      getContext: async () => {
        const session = await this.request("/api/session");
        // sessionInstanceId is an opaque per-login marker (already returned by
        // /api/session); hosts pin it as the binding's sessionEpoch so a login,
        // logout, account switch or session rotation invalidates authority.
        // Keep the stored CSRF aligned with the session that answered.
        this.csrf = session.csrf;
        await this.refresh();
        if (!this.document) throw new Error("No authenticated active document");
        return {
          appId,
          documentId: this.document.id,
          revision: this.document.revision,
          selectionIds: [...this.selectionIds],
          summary: this.document.summary.slice(0, 400),
          sessionEpoch: session.sessionInstanceId,
        };
      },
      invoke: (call) => this.invoke(call),
    };
  }
  async audit() {
    return this.request(
      "/api/documents/" + encodeURIComponent(this.document!.id) + "/audit",
    );
  }
}
