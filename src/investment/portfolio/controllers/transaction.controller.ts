import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Param,
  Patch,
  Res,
} from "@nestjs/common";
import { TradingTransactionService } from "../services/trading-transaction.service";
import {
  CreateTransactionDto,
  FilterTransactionDto,
} from "../dto/transaction.dto";
import { Response } from "express";

@Controller("portfolios/:portfolioId/transactions")
export class TransactionController {
  constructor(private readonly transactionService: TradingTransactionService) {}

  @Post()
  createTransaction(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.createTransaction(createTransactionDto);
  }

  @Get()
  getTransactions(
    @Param("portfolioId") portfolioId: string,
    @Query() filterDto: FilterTransactionDto,
  ) {
    return this.transactionService.getTransactions(portfolioId, filterDto);
  }

  @Patch(":id/archive")
  archiveTransaction(@Param("id") id: string) {
    return this.transactionService.archiveTransaction(id);
  }

  @Get("export")
  async exportTransactions(
    @Param("portfolioId") portfolioId: string,
    @Query() filterDto: FilterTransactionDto,
    @Res() res: Response,
  ) {
    const stream = await this.transactionService.exportTransactionsToCsv(
      portfolioId,
      filterDto,
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=transactions.csv",
    );
    stream.pipe(res);
  }

  @Get("assets/:assetId/cost-basis")
  calculateCostBasis(@Param("assetId") assetId: string) {
    return this.transactionService.calculateCostBasis(assetId);
  }
}
