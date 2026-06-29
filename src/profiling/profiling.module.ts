import { Module } from "@nestjs/common";
import { ProfilingService } from "./profiling.service";
import { ProfilingController } from "./profiling.controller";

@Module({
  providers: [ProfilingService],
  controllers: [ProfilingController],
  exports: [ProfilingService],
})
export class ProfilingModule {}



