/**
 * Unit tests for formatToolResponse — the layer that maps Unreal's
 * {success, message, data, isError?} response envelope onto the MCP
 * tool-result {content, isError} envelope.
 */

import { describe, it, expect } from "vitest";
import { formatToolResponse } from "../../lib.js";

describe("formatToolResponse", () => {
  describe("error detection", () => {
    it("treats explicit `isError: true` as an error", () => {
      const out = formatToolResponse("spawn_actor", {
        success: false,
        isError: true,
        message: "Class not found",
      });
      expect(out.isError).toBe(true);
      expect(out.content[0].type).toBe("text");
      expect(out.content[0].text).toContain("Class not found");
    });

    it("treats explicit `isError: false` as success even if `success` is missing", () => {
      const out = formatToolResponse("spawn_actor", {
        isError: false,
        message: "OK",
      });
      expect(out.isError).toBe(false);
    });

    it("falls back to `!success` when `isError` is absent (legacy bridge contract)", () => {
      const out = formatToolResponse("spawn_actor", {
        success: false,
        message: "Legacy error path",
      });
      expect(out.isError).toBe(true);
      expect(out.content[0].text).toContain("Legacy error path");
    });

    it("prefers `isError` over `success` when both are present and disagree", () => {
      // Hypothetical: an upstream layer set success:true but explicitly marked isError.
      // The canonical MCP field wins so client tooling stays consistent.
      const out = formatToolResponse("spawn_actor", {
        success: true,
        isError: true,
        message: "Something went wrong",
      });
      expect(out.isError).toBe(true);
    });

    it("renders 'Unknown error' when message is missing on an error result", () => {
      const out = formatToolResponse("spawn_actor", {
        success: false,
        isError: true,
      });
      expect(out.isError).toBe(true);
      expect(out.content[0].text).toBe("Error: Unknown error");
    });
  });

  describe("success path", () => {
    it("returns text content with the result message", () => {
      const out = formatToolResponse(
        "spawn_actor",
        { success: true, message: "Spawned", data: { name: "BP_Enemy_1" } },
      );
      expect(out.isError).toBe(false);
      expect(out.content[0].type).toBe("text");
      expect(out.content[0].text).toContain("Spawned");
      expect(out.content[0].text).toContain("BP_Enemy_1");
    });

    it("appends warnings block when warnings are present", () => {
      const out = formatToolResponse(
        "asset_search",
        {
          success: true,
          message: "Found 1 asset",
          warnings: ["deprecated param: asset_type"],
        },
      );
      expect(out.content[0].text).toContain("Warnings:");
      expect(out.content[0].text).toContain("deprecated param: asset_type");
    });

    it("emits native image content for capture_viewport results (legacy data.image_base64 path)", () => {
      const out = formatToolResponse(
        "capture_viewport",
        {
          success: true,
          message: "Captured",
          data: { image_base64: "ZmFrZS1pbWFnZS1ieXRlcw==", format: "png" },
        },
      );
      expect(out.isError).toBe(false);
      expect(out.content[0].type).toBe("image");
      expect(out.content[0].mimeType).toBe("image/png");
      expect(out.content[0].data).toBe("ZmFrZS1pbWFnZS1ieXRlcw==");
      // The metadata-text block follows, and should not contain the base64 payload.
      expect(out.content[1].type).toBe("text");
      expect(out.content[1].text).not.toContain("ZmFrZS1pbWFnZS1ieXRlcw==");
    });
  });

  describe("contentType dispatch (new plugin format)", () => {
    it("emits image content from top-level base64 + mimeType when contentType=image", () => {
      const out = formatToolResponse("capture_viewport", {
        success: true,
        message: "Captured",
        contentType: "image",
        mimeType: "image/jpeg",
        base64: "Y2Fub25pY2FsLWltYWdlLWJ5dGVz",
        data: { width: 1024, height: 576 },
      });
      expect(out.isError).toBe(false);
      expect(out.content[0].type).toBe("image");
      expect(out.content[0].mimeType).toBe("image/jpeg");
      expect(out.content[0].data).toBe("Y2Fub25pY2FsLWltYWdlLWJ5dGVz");
      expect(out.content[1].type).toBe("text");
      expect(out.content[1].text).toContain("Captured");
      expect(out.content[1].text).toContain("1024");
      // Base64 payload must not leak into the text channel.
      expect(out.content[1].text).not.toContain("Y2Fub25pY2FsLWltYWdlLWJ5dGVz");
    });

    it("prefers canonical contentType=image over legacy data.image_base64 when both are present", () => {
      // Plugins emit data.image_base64 as a backward-compat mirror. The bridge should
      // use the canonical top-level base64, not the legacy field, when both are set.
      const out = formatToolResponse("capture_viewport", {
        success: true,
        message: "Captured",
        contentType: "image",
        mimeType: "image/png",
        base64: "Y2Fub25pY2Fs",
        data: { image_base64: "bGVnYWN5Lw==", format: "png", width: 100 },
      });
      expect(out.content[0].data).toBe("Y2Fub25pY2Fs");
      expect(out.content[0].mimeType).toBe("image/png");
      // Neither base64 should leak into the text block.
      expect(out.content[1].text).not.toContain("Y2Fub25pY2Fs");
      expect(out.content[1].text).not.toContain("bGVnYWN5Lw==");
    });

    it("works for any toolName when contentType=image (not just capture_viewport)", () => {
      // The whole point of the typed envelope: future image-producing tools
      // don't require editing the bridge.
      const out = formatToolResponse("future_image_tool", {
        success: true,
        message: "Rendered",
        contentType: "image",
        mimeType: "image/webp",
        base64: "ZnV0dXJl",
      });
      expect(out.content[0].type).toBe("image");
      expect(out.content[0].mimeType).toBe("image/webp");
      expect(out.content[0].data).toBe("ZnV0dXJl");
    });

    it("falls back to text when contentType=image but base64 is missing", () => {
      const out = formatToolResponse("capture_viewport", {
        success: true,
        message: "Captured",
        contentType: "image",
        mimeType: "image/jpeg",
        // base64 deliberately missing — should not produce a malformed image block.
      });
      expect(out.content[0].type).toBe("text");
      expect(out.content[0].text).toContain("Captured");
    });

    it("treats contentType=text the same as omitted contentType", () => {
      const out = formatToolResponse("spawn_actor", {
        success: true,
        message: "Spawned",
        contentType: "text",
        data: { name: "BP_Enemy_1" },
      });
      expect(out.content[0].type).toBe("text");
      expect(out.content[0].text).toContain("Spawned");
      expect(out.content[0].text).toContain("BP_Enemy_1");
    });

    it("falls back to text for reserved contentType values (audio, structured)", () => {
      // Reserved enum values that the bridge does not yet have a content-block
      // handler for — degrade to text rather than dropping the payload.
      const audio = formatToolResponse("future_audio_tool", {
        success: true,
        message: "Generated audio",
        contentType: "audio",
        base64: "YXVkaW8tYnl0ZXM=",
      });
      expect(audio.content[0].type).toBe("text");
      expect(audio.content[0].text).toContain("Generated audio");

      const structured = formatToolResponse("future_struct_tool", {
        success: true,
        message: "Got structured data",
        contentType: "structured",
        data: { foo: "bar" },
      });
      expect(structured.content[0].type).toBe("text");
      expect(structured.content[0].text).toContain("Got structured data");
      expect(structured.content[0].text).toContain("bar");
    });
  });
});
