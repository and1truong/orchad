import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Message } from "../packages/agent-client/src/protocol.js";
const digest = (m: Message) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls ?? [],
      }),
    )
    .digest("hex");
export class StateCodec {
  constructor(
    private key: Buffer,
    private ttlMs = 24 * 60 * 60 * 1000,
  ) {
    if (key.length !== 32) throw new Error("State key must be 32 bytes");
  }
  seal(
    principal: string,
    provider: string,
    model: string,
    message: Message,
    metadata: unknown,
  ) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.from(
      JSON.stringify({
        principal,
        provider,
        model,
        digest: digest(message),
        expires: Date.now() + this.ttlMs,
        metadata,
      }),
    );
    if (data.length > 100_000) throw new Error("Continuation too large");
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64url",
    );
  }
  open(
    value: string,
    principal: string,
    provider: string,
    model: string,
    message: Message,
  ) {
    try {
      const b = Buffer.from(value, "base64url");
      if (b.length < 29 || b.toString("base64url") !== value) throw 0;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        b.subarray(0, 12),
      );
      decipher.setAuthTag(b.subarray(12, 28));
      const data = JSON.parse(
        Buffer.concat([
          decipher.update(b.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
      if (
        data.principal !== principal ||
        data.provider !== provider ||
        data.model !== model ||
        data.digest !== digest(message) ||
        data.expires < Date.now()
      )
        throw 0;
      return data.metadata;
    } catch {
      throw new Error("Invalid continuation state");
    }
  }
}
