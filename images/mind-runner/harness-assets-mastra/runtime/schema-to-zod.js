import { jsonSchemaToZod } from "json-schema-to-zod";
import { z } from "zod";

export function jsonSchemaToZodInstance(schemaJson) {
  const code = jsonSchemaToZod(schemaJson, { module: "esm" });
  const marker = "export default ";
  const start = code.indexOf(marker);
  if (start === -1) {
    throw new Error("malformed jsonSchemaToZod output");
  }
  const expression = code.slice(start + marker.length).trim().replace(/;$/, "");
  return new Function("z", `return ${expression};`)(z);
}
