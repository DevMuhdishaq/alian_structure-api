import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Repository,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
  FindOptionsWhere,
} from "typeorm";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../entities/transaction.entity";
import {
  CreateTransactionDto,
  FilterTransactionDto,
} from "../dto/transaction.dto";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { Portfolio } from "../entities/portfolio.entity";
import * as fastcsv from "fast-csv";
import { Readable } from "stream";

@Injectable()
export class TradingTransactionService {
  private readonly logger = new Logger(TradingTransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
    @InjectRepository(PortfolioAsset)
    private readonly portfolioAssetRepository: Repository<PortfolioAsset>,
  ) {}

  async createTransaction(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    const { portfolioId, portfolioAssetId, ...transactionData } =
      createTransactionDto;

    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
    });
    if (!portfolio) {
      throw new NotFoundException(`Portfolio with ID ${portfolioId} not found`);
    }

    let portfolioAsset: PortfolioAsset | null = null;
    if (portfolioAssetId) {
      portfolioAsset = await this.portfolioAssetRepository.findOne({
        where: { id: portfolioAssetId },
      });
      if (!portfolioAsset) {
        throw new NotFoundException(
          `PortfolioAsset with ID ${portfolioAssetId} not found`,
        );
      }
    }

    const transaction = this.transactionRepository.create({
      ...transactionData,
      portfolio,
      portfolioAsset,
    });

    await this.validateTransaction(transaction);

    return this.transactionRepository.save(transaction);
  }

  async getTransactions(
    portfolioId: string,
    filterDto: FilterTransactionDto,
  ): Promise<Transaction[]> {
    const { type, startDate, endDate, status } = filterDto;

    const where: FindOptionsWhere<Transaction> = { portfolioId };

    if (type) {
      where.type = type;
    }

    if (startDate && endDate) {
      where.date = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.date = MoreThanOrEqual(new Date(startDate));
    } else if (endDate) {
      where.date = LessThanOrEqual(new Date(endDate));
    }

    if (status) {
      where.status = status;
    } else {
      where.status = TransactionStatus.ACTIVE;
    }

    return this.transactionRepository.find({
      where,
      order: { date: "DESC" },
    });
  }

  async archiveTransaction(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    transaction.status = TransactionStatus.ARCHIVED;
    return this.transactionRepository.save(transaction);
  }

  async exportTransactionsToCsv(
    portfolioId: string,
    filterDto: FilterTransactionDto,
  ): Promise<Readable> {
    const transactions = await this.getTransactions(portfolioId, filterDto);
    return fastcsv.write(transactions, { headers: true });
  }

  async calculateCostBasis(portfolioAssetId: string): Promise<{
    averageCost: number;
    totalCost: number;
    totalQuantity: number;
  }> {
    const transactions = await this.transactionRepository.find({
      where: {
        portfolioAssetId,
        type: TransactionType.BUY,
        status: TransactionStatus.ACTIVE,
      },
    });

    let totalCost = 0;
    let totalQuantity = 0;

    for (const transaction of transactions) {
      totalCost += transaction.amount * transaction.price;
      totalQuantity += transaction.amount;
    }

    const averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    return { averageCost, totalCost, totalQuantity };
  }

  async executeTrade(
    portfolioId: string,
    ticker: string,
    action: "buy" | "sell",
    quantity: number,
    price: number,
  ): Promise<Transaction> {
    const portfolioAsset = await this.portfolioAssetRepository.findOne({
      where: { portfolioId, ticker },
    });
    if (!portfolioAsset) {
      throw new NotFoundException(
        `Asset with ticker ${ticker} not found in portfolio ${portfolioId}`,
      );
    }

    const createTransactionDto: CreateTransactionDto = {
      portfolioId,
      portfolioAssetId: portfolioAsset.id,
      type: action === "buy" ? TransactionType.BUY : TransactionType.SELL,
      amount: quantity,
      price: price,
      date: new Date().toISOString(),
    };

    return this.createTransaction(createTransactionDto);
  }

  private async validateTransaction(transaction: Transaction): Promise<void> {
    if (
      transaction.type === TransactionType.SELL ||
      transaction.type === TransactionType.UNSTAKE
    ) {
      const { totalQuantity } = await this.calculateCostBasis(
        transaction.portfolioAssetId,
      );
      if (transaction.amount > totalQuantity) {
        throw new Error("Insufficient balance for this transaction");
      }
    }
  }
}
