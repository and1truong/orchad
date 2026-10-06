import type { Tool } from "./model.ts";
export const string = (maxLength = 128) => ({
  type: "string",
  minLength: 1,
  maxLength,
});
export const integer = (maximum: number, minimum = 0) => ({
  type: "integer",
  minimum,
  maximum,
});
export const array = (items: unknown, maxItems: number, minItems = 0) => ({
  type: "array",
  items,
  maxItems,
  minItems,
});
export const enumeration = (...values: string[]) => ({
  type: "string",
  enum: values,
});
export const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
export const tool = (
  name: string,
  effect: Tool["effect"],
  properties: Record<string, unknown>,
  description: string,
  required = Object.keys(properties),
): Tool => ({
  name,
  effect,
  description,
  inputSchema: object(properties, required),
});
