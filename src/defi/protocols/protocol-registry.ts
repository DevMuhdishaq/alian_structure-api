import { Injectable, Logger } from "@nestjs/common";
import { ProtocolAdapter } from "./protocol-adapter.interface";

export interface ProtocolAdapterMetadata {
  name: string;
  supportedChains: string[];
  capabilities: string[];
}

@Injectable()
export class ProtocolRegistry {
  private readonly logger = new Logger(ProtocolRegistry.name);
  private readonly adapters: Map<string, ProtocolAdapter> = new Map();

  constructor() {}

  register(adapter: ProtocolAdapter) {
    if (this.adapters.has(adapter.name)) {
      this.logger.warn(
        `Protocol adapter ${adapter.name} is already registered. Overwriting.`,
      );
    }
    this.adapters.set(adapter.name, adapter);
    this.logger.log(`Registered protocol adapter: ${adapter.name}`);
  }

  getAdapter(protocolName: string): ProtocolAdapter {
    const adapter = this.adapters.get(protocolName);
    if (!adapter) {
      throw new Error(`Protocol adapter not found: ${protocolName}`);
    }
    return adapter;
  }

  getAllAdapters(): ProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  isProtocolSupported(protocolName: string): boolean {
    return this.adapters.has(protocolName);
  }

  getSupportedProtocols(): string[] {
    return Array.from(this.adapters.keys());
  }

  getProtocolsByChain(chain: string): ProtocolAdapter[] {
    const supportingAdapters: ProtocolAdapter[] = [];

    for (const adapter of this.adapters.values()) {
      if (adapter.supportedChains.includes(chain)) {
        supportingAdapters.push(adapter);
      }
    }

    return supportingAdapters;
  }
}



