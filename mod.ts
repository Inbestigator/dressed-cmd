import ora from "ora";
import { Command } from "commander";
import { build } from "@dressed/dressed";
import { writeFile } from "node:fs/promises";

const program = new Command();

program.name("dressed").description("An HTTP Discord bot framework.");

program
  .command("build")
  .description("Builds the bot and writes to a bot.gen.ts")
  .option(
    "-i, --instance",
    "Include an instance create in the generated file",
  )
  .option("-r, --register", "Register slash commands")
  .action(async ({ instance, register }) => {
    const outputContent = await build(instance, register);
    const writing = ora("Writing to bot.gen.ts");
    await writeFile(
      "./bot.gen.ts",
      new TextEncoder().encode(outputContent),
    );
    writing.succeed("Wrote to bot.gen.ts");
    Deno.exit();
  });

program.parse();
