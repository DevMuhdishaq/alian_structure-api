import manifest from "src/modules/example-grant-module/module.manifest.json";

interface RegistrationResponse {
  module?: { id: string; name: string; version: string };
  message?: string;
}

async function registerExampleModule(): Promise<void> {
  const endpoint =
    process.env.MODULE_REGISTRY_URL ?? "http://localhost:3001/api/v1/modules";
  const token = process.env.MODULE_REGISTRY_TOKEN;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      manifest,
      description:
        "A minimal grant-funded module demonstrating registry lifecycle hooks.",
      author: "GrantFox example contributor",
    }),
  });
  const body = (await response.json()) as RegistrationResponse;

  if (!response.ok) {
    throw new Error(
      `Example module registration failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  process.stdout.write(
    `Registered ${body.module?.name}@${body.module?.version} (${body.module?.id})\n`,
  );
}

registerExampleModule().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
