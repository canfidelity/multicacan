import type { ChatTimelineItem } from "@multica/core/chat";

/**
 * Parse <tool_call> and <tool_response> XML blocks that proxies like claude.gg
 * embed inline in text messages, and convert them into properly typed timeline items.
 *
 * When all messages arrive as type="text" with XML embedded, consecutive text chunks
 * are concatenated then split on XML block boundaries to produce tool_use / tool_result
 * items that render as collapsed UI components instead of raw XML.
 */
export function parseEmbeddedXmlBlocks(textItems: ChatTimelineItem[]): ChatTimelineItem[] {
  const fullText = textItems.map((i) => i.content ?? "").join("");
  if (!fullText.includes("<tool_call>") && !fullText.includes("<tool_response>")) {
    return textItems;
  }

  const result: ChatTimelineItem[] = [];
  let seq = textItems[0]?.seq ?? 0;
  const blockRe = /(<tool_call>[\s\S]*?<\/tool_call>|<tool_response>[\s\S]*?<\/tool_response>)/g;

  for (const part of fullText.split(blockRe)) {
    if (!part) continue;

    if (part.startsWith("<tool_call>")) {
      const body = part.slice("<tool_call>".length, part.length - "</tool_call>".length).trim();
      try {
        const parsed = JSON.parse(body) as {
          name?: string;
          tool_name?: string;
          arguments?: Record<string, unknown>;
          input?: Record<string, unknown>;
        };
        result.push({
          seq: seq++,
          type: "tool_use",
          tool: parsed.name ?? parsed.tool_name ?? "unknown",
          input: parsed.arguments ?? parsed.input ?? {},
        });
      } catch {
        result.push({ seq: seq++, type: "text", content: part });
      }
    } else if (part.startsWith("<tool_response>")) {
      const body = part.slice("<tool_response>".length, part.length - "</tool_response>".length).trim();
      result.push({ seq: seq++, type: "tool_result", output: body });
    } else {
      const trimmed = part.trim();
      if (trimmed) result.push({ seq: seq++, type: "text", content: trimmed });
    }
  }

  return result;
}

/**
 * Group consecutive text items, run them through XML block parsing, and return
 * a flat list of properly typed timeline items. Non-text items pass through unchanged.
 */
export function resolveXmlTextBlocks(items: ChatTimelineItem[]): ChatTimelineItem[] {
  const result: ChatTimelineItem[] = [];
  let textGroup: ChatTimelineItem[] = [];

  const flushText = () => {
    if (textGroup.length > 0) {
      result.push(...parseEmbeddedXmlBlocks(textGroup));
      textGroup = [];
    }
  };

  for (const item of items) {
    if (item.type === "text") {
      textGroup.push(item);
    } else {
      flushText();
      result.push(item);
    }
  }
  flushText();
  return result;
}
