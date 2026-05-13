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

    it("emits native image content for capture_viewport results", () => {
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
});
