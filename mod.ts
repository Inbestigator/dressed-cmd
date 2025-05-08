import ora from "ora";
import { Command } from "commander";
import { build } from "@dressed/dressed/server";
import { writeFile } from "node:fs/promises";
import { green } from "@std/fmt/colors";
import { dirname, join } from "node:path";
import { cwd, exit } from "node:process";
import inquirer from "inquirer";
import parseString from "parse-env-string";

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
    "-R, --root <root>",
    "Source root for the bot, defaults to `src`",
  )
  .option(
    "-D, --dest <dest>",
    "Output file, defaults to `bot.gen.ts`",
  )
  .action(async ({ instance, register, endpoint, port, root, dest }) => {
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
    await writeFile(
      dest ?? "bot.gen.ts",
      new TextEncoder().encode(outputContent),
    );
    writing.succeed("Wrote to bot.gen.ts");
    exit();
  });

program
  .command("create")
  .description("Clone a new bot from the examples repository")
  .argument("[template]", "Template name (deno/economy)")
  .argument("[name]", "Project name")
  .action(async (name, template) => {
    if (!name) {
      name = prompt("Project name:");
    }
    if (!name) {
      console.log("Project name cannot be empty.");
      Deno.exit(1);
    }
    if (
      !template ||
      (!template.startsWith("node/") && !template.startsWith("deno/"))
    ) {
      const isDeno = confirm("Would you like to use a Deno specific template?");
      const res = await fetch(
        `https://api.github.com/repos/inbestigator/dressed-examples/contents/${
          isDeno ? "deno" : "node"
        }`,
      );
      if (!res.ok) {
        console.error("Failed to list templates.");
        Deno.exit(1);
      }
      const files =
        (await res.json() as { name: string; path: string; type: string }[])
          .filter((f) => f.type === "dir");
      ({ template } = await inquirer.prompt([{
        message: "Select the template to use",
        type: "select",
        name: "template",
        choices: files.map((f) => ({
          name: f.name,
          value: f.path,
        })),
      }]));
    }
    const res = await fetch(
      `https://raw.githubusercontent.com/inbestigator/dressed-examples/main/${template}/.env.example`,
    );
    if (!res.ok) {
      console.error("Failed to fetch template.");
      Deno.exit(1);
    }
    const parsed = parseString(
      (await res.text()).replaceAll(/(#.+)|\n/g, ""),
    );
    const envVars = await inquirer.prompt(
      Object.entries(parsed).map(([k, v]) => ({
        message: k,
        name: k,
        type: "input",
        default: v,
      })),
    );

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
            const fileContents = await fileRes.text();
            const destPath = join(dest, file.name);
            if (file.name === ".env.example") {
              const destPath = join(dest, ".env");
              Deno.mkdirSync(dirname(destPath), { recursive: true });
              Deno.writeTextFileSync(
                destPath,
                Object.entries(envVars).map(([k, v]) => `${k}="${v}"`).join(
                  "\n",
                ),
              );
            }
            Deno.mkdirSync(dirname(destPath), { recursive: true });
            Deno.writeTextFileSync(destPath, fileContents);
          }
        }
      }
    }

    try {
      const path =
        `https://api.github.com/repos/inbestigator/dressed-examples/contents/${template}`;

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
