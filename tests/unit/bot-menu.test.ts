import { assertEquals } from "@std/assert";
import { NOTINN_BOT_COMMANDS } from "../../scripts/set-bot-menu.ts";

Deno.test("native Telegram menu includes every commercial entry point once", () => {
  const commands = NOTINN_BOT_COMMANDS.map((item) => item.command);
  assertEquals(commands.includes("usage"), true);
  assertEquals(commands.includes("upgrade"), true);
  assertEquals(commands.includes("web"), true);
  assertEquals(new Set(commands).size, commands.length);
});
