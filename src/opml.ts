import { readFileSync } from "fs";
import { XMLParser } from "fast-xml-parser";
import type { OpmlFeed } from "./types.js";

interface OpmlOutline {
  "@_text"?: string;
  "@_title"?: string;
  "@_type"?: string;
  "@_xmlUrl"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function walk(
  node: OpmlOutline | OpmlOutline[] | undefined,
  parentCategory: string | null,
  out: OpmlFeed[],
): void {
  if (!node) return;
  const items = Array.isArray(node) ? node : [node];
  for (const item of items) {
    const xmlUrl = item["@_xmlUrl"];
    if (xmlUrl) {
      out.push({
        url: xmlUrl,
        title: item["@_title"] ?? item["@_text"] ?? null,
        category: parentCategory,
      });
    } else {
      const nextCategory = item["@_text"] ?? item["@_title"] ?? parentCategory;
      walk(item.outline, nextCategory, out);
    }
  }
}

export function parseOpml(filePath: string): OpmlFeed[] {
  const xml = readFileSync(filePath, "utf8");
  const parsed = xmlParser.parse(xml);
  const body = parsed?.opml?.body;
  if (!body) return [];
  const out: OpmlFeed[] = [];
  walk(body.outline, null, out);
  return out;
}
