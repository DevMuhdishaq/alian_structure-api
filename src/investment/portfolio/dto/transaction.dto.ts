import {
  IsEnum,
  IsOptional,
  IsDateString,
  IsNumber,
  Min,
} from "class-validator";
import {
  TransactionType,
  TransactionStatus,
} from "../entities/transaction.entity";

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fees?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gasFees?: number;

  portfolioId: string;

  @IsOptional()
  portfolioAssetId?: string;

  @IsOptional()
  notes?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class FilterTransactionDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
}
