import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  UpgradeRecord,
} from "src/modules/upgradeability/entities/upgrade-record.entity";
import {
  ImplementationVersion,
} from "src/modules/upgradeability/entities/implementation-version.entity";
import { UpgradeabilityService } from "src/modules/upgradeability/upgradeability.service";
import { UpgradeabilityController } from "src/modules/upgradeability/upgradeability.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([UpgradeRecord, ImplementationVersion]),
  ],
  controllers: [UpgradeabilityController],
  providers: [UpgradeabilityService],
  exports: [UpgradeabilityService],
})
export class UpgradeabilityModule {}
