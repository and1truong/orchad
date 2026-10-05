import { writeFileSync } from "node:fs";
import prettier from "prettier";
import {
  requestSchema,
  callSchema,
} from "../packages/agent-client/src/protocol.js";
const message = requestSchema.properties.messages.items;
const usage = {
  anyOf: [
    { type: "null" },
    {
      type: "object",
      required: ["prompt_tokens", "completion_tokens", "total_tokens"],
      properties: {
        prompt_tokens: { type: "integer", minimum: 0 },
        completion_tokens: { type: "integer", minimum: 0 },
        total_tokens: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
  ],
};
const finish = {
  enum: ["stop", "tool_calls", "length", "content_filter", null],
};
const base = {
  id: { type: "string" },
  created: { type: "integer" },
  model: { type: "string" },
};
const chunk = {
  type: "object",
  required: ["id", "object", "created", "model", "choices"],
  properties: {
    ...base,
    object: { const: "chat.completion.chunk" },
    choices: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        required: ["index", "delta", "finish_reason"],
        properties: {
          index: { const: 0 },
          finish_reason: finish,
          delta: {
            type: "object",
            properties: {
              role: { const: "assistant" },
              content: { type: "string" },
              x_gateway_state: {
                type: "string",
                description:
                  "Opaque authenticated-encrypted provider continuation. Final choice delta only. Replay unchanged on assistant message.",
              },
              tool_calls: {
                type: "array",
                items: {
                  type: "object",
                  required: ["index"],
                  properties: {
                    index: { type: "integer", minimum: 0, maximum: 15 },
                    id: { type: "string" },
                    type: { const: "function" },
                    function: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        arguments: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    usage,
  },
};
const completion = {
  type: "object",
  required: ["id", "object", "created", "model", "choices", "usage"],
  properties: {
    ...base,
    object: { const: "chat.completion" },
    choices: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        required: ["index", "message", "finish_reason"],
        properties: { index: { const: 0 }, message, finish_reason: finish },
      },
    },
    usage,
  },
};
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Agent App Bridge Model Gateway 0.1 subset",
  description:
    "Schemas for documented subset only. SSE transport frames CompletionChunk JSON and terminates with [DONE]. No partial tool execution.",
  definitions: {
    ChatRequest: requestSchema,
    Message: message,
    ToolCall: callSchema,
    Completion: completion,
    CompletionChunk: chunk,
    Error: {
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["message", "type", "code"],
          properties: {
            message: { type: "string" },
            type: { const: "gateway_error" },
            code: { type: "string" },
          },
        },
      },
    },
    Models: {
      type: "object",
      required: ["object", "data"],
      properties: {
        object: { const: "list" },
        data: {
          type: "array",
          items: {
            type: "object",
            required: [
              "id",
              "object",
              "created",
              "owned_by",
              "x_gateway_capabilities",
            ],
            properties: {
              id: { type: "string" },
              object: { const: "model" },
              created: { type: "integer" },
              owned_by: { type: "string" },
              x_gateway_capabilities: {
                type: "object",
                required: [
                  "text",
                  "streaming",
                  "functionTools",
                  "max_completion_tokens",
                  "compatibility",
                ],
                properties: {
                  text: { type: "boolean" },
                  streaming: { type: "boolean" },
                  functionTools: { type: "boolean" },
                  max_completion_tokens: { type: "integer" },
                  compatibility: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  },
};
// Prettier keeps regeneration byte-identical to the committed document.
writeFileSync(
  "api.schema.json",
  await prettier.format(JSON.stringify(schema), { parser: "json" }),
);
