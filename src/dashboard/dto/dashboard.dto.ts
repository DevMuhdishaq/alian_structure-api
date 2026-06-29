import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

export enum TimeRange {
  ONE_DAY = "1D",
  ONE_WEEK = "1W",
  ONE_MONTH = "1M",
  THREE_MONTHS = "3M",
  ONE_YEAR = "1Y",
  ALL = "ALL",
}

export class TimeRangeDto {
  @ApiProperty({
    enum: TimeRange,
    required: false,
    default: TimeRange.ONE_YEAR,
  })
  @IsOptional()
  @IsEnum(TimeRange)
  timeRange?: TimeRange;
}



