import { ModuleLifecycle } from "src/modules/registry/interfaces/module-lifecycle.interface";

export const exampleGrantModuleEvents: string[] = [];

export default class ExampleGrantModuleLifecycle implements ModuleLifecycle {
  async onInstall(): Promise<void> {
    exampleGrantModuleEvents.push("installed");
  }

  async onUpgrade(fromVersion: string, toVersion: string): Promise<void> {
    exampleGrantModuleEvents.push(`upgraded:${fromVersion}->${toVersion}`);
  }
}
