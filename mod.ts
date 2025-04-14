import ora from "ora";
import { Command } from "commander";
import { build } from "@dressed/dressed/server";
import { writeFile } from "node:fs/promises";
import { green } from "@std/fmt/colors";
import { dirname, join } from "node:path";
import { cwd, exit } from "node:process";

const program = new Command();

program.name("dressed").description("A serverless Discord bot framework.");

program
  .command("build")
  .description("Builds the bot and writes to a bot.gen.ts")
  .option("-i, --instance", "Include an instance create in the generated file")
  .option("-r, --register", "Register slash commands")
  .option(
    "-e, --endpoint <endpoint>",
    "The endpoint to listen on, defaults to `/`",
  )
  .option("-p, --port <port>", "The port to listen on, defaults to `8000`")
  .option(
    "-R, --root <endpoint>",
    "Source root for the bot, defaults to `src`",
  )
  .action(async ({ instance, register, endpoint, port, root }) => {
    if (port && isNaN(Number(port))) {
      ora("Port must be a valid number").fail();
      exit();
    }
    port = port ? Number(port) : undefined;
    const outputContent = await build(instance, register, {
      endpoint,
      port,
      root,
    });
    const writing = ora("Writing to bot.gen.ts");
    await writeFile("./bot.gen.ts", new TextEncoder().encode(outputContent));
    writing.succeed("Wrote to bot.gen.ts");
    exit();
  });

program
  .command("create")
  .description("Clone a new bot from the examples repository")
  .argument("[template]", "Template name (deno/economy)")
  .argument("[name]", "Project name")
  .option("-t, --token <token>", "Bot token")
  .option("-i, --id <id>", "Bot ID")
  .option("-k, --key <key>", "Bot public key")
  .action(async (name, template, { token, id, key }) => {
    if (!name) {
      name = prompt("Project name:");
    }
    if (!name) {
      console.log("Project name cannot be empty.");
      Deno.exit(1);
    }
    if (!template) {
      template = prompt("Template:");
    }
    if (!template) {
      console.log("Template cannot be empty. Are you sure you it's correct?");
      Deno.exit(1);
    }
    const res = await fetch(
      `https://api.github.com/repos/inbestigator/dressed-examples/contents/${template}`,
    );
    if (!res.ok) {
      console.error("Failed to fetch template.");
      Deno.exit(1);
    }
    if (!token) {
      token = prompt("Bot token (optional):");
    }
    if (!id) {
      id = prompt("Bot ID (optional):");
    }
    if (!key) {
      key = prompt("Bot public key (optional):");
    }
    const mkdirLoader = ora(`Creating files for project: ${name}`).start();

    async function createFiles(path: string, dest: string) {
      Deno.mkdirSync(dest, { recursive: true });
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const json = await response.json();
      if (Array.isArray(json)) {
        for (const file of json) {
          if (file.type === "dir") {
            await createFiles(file.url, join(dest, file.name));
          } else {
            const fileRes = await fetch(file.download_url);
            if (!fileRes.ok) {
              throw new Error(fileRes.statusText);
            }
            let fileContents = await fileRes.text();
            let destPath = join(dest, file.name);
            if (file.name === ".env.example" && (token || id || key)) {
              fileContents =
                `DISCORD_TOKEN="${token}"\nDISCORD_APP_ID="${id}"\nDISCORD_PUBLIC_KEY="${key}"`;
              destPath = join(dest, ".env");
            }
            Deno.mkdirSync(dirname(destPath), { recursive: true });
            Deno.writeTextFileSync(destPath, fileContents);
          }
        }
      }
    }

    try {
      const path =
        `https://api.github.com/repos/Inbestigator/dressed-examples/contents/${template}`;

      await createFiles(path, join(cwd(), name));
    } catch {
      mkdirLoader.fail();
      exit(1);
    }
    mkdirLoader.succeed();

    console.log(green("Project created successfully."));
    exit();
  });

program.parse();
