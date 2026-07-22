import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { StakingService } from "./staking.service";
import {
  DeFiPosition,
  PositionStatus,
  PositionType,
  DeFiProtocol,
} from "../entities/defi-position.entity";
import { DeFiYieldRecord } from "../entities/defi-yield-record.entity";
import { ProtocolRegistry } from "../protocols/protocol-registry";

const mockPosition = (): Partial<DeFiPosition> => ({
  id: "pos-1",
  user_id: "user-1",
  protocol: DeFiProtocol.LIDO,
  position_type: PositionType.STAKING,
  status: PositionStatus.ACTIVE,
  contract_address: DeFiProtocol.LIDO,
  wallet_address: "0xabc",
  token_symbol: "ETH",
  principal_amount: 10,
  current_amount: 10,
  accumulated_yield: 0,
  apy: 5,
  auto_compound_enabled: false,
  created_at: new Date("2026-01-01"),
});

describe("StakingService", () => {
  let service: StakingService;
  let positionRepo: Record<string, jest.Mock>;
  let yieldRepo: Record<string, jest.Mock>;
  let protocolRegistry: Record<string, jest.Mock>;

  const mockAdapter = {
    name: DeFiProtocol.LIDO,
    supportedChains: ["ethereum"],
    stake: jest.fn(),
    getAPY: jest.fn().mockResolvedValue(5.2),
    getRewards: jest
      .fn()
      .mockResolvedValue([
        { token: "ETH", amount: 0.1, valueUSD: 350, apy: 5, claimable: true },
      ]),
    getProtocolMetrics: jest
      .fn()
      .mockResolvedValue({ tvl: 5e9, audits: ["Sigma"], apy: 5 }),
  };

  beforeEach(async () => {
    positionRepo = {
      create: jest.fn((d) => ({ ...mockPosition(), ...d })),
      save: jest.fn((p) => Promise.resolve({ ...mockPosition(), ...p })),
      find: jest.fn().mockResolvedValue([mockPosition()]),
      findOne: jest.fn().mockResolvedValue(mockPosition()),
    };
    yieldRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve(d)),
    };
    protocolRegistry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
      getAllAdapters: jest.fn().mockReturnValue([mockAdapter]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakingService,
        { provide: getRepositoryToken(DeFiPosition), useValue: positionRepo },
        { provide: getRepositoryToken(DeFiYieldRecord), useValue: yieldRepo },
        { provide: ProtocolRegistry, useValue: protocolRegistry },
      ],
    }).compile();

    service = module.get<StakingService>(StakingService);
  });

  describe("stake", () => {
    it("creates a staking position with correct fields", async () => {
      const result = await service.stake("user-1", {
        protocol: DeFiProtocol.LIDO,
        walletAddress: "0xabc",
        tokenSymbol: "ETH",
        amount: 10,
        autoCompound: true,
      });

      expect(positionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position_type: PositionType.STAKING,
          status: PositionStatus.ACTIVE,
          auto_compound_enabled: true,
        }),
      );
      expect(positionRepo.save).toHaveBeenCalled();
      expect(result.tokenSymbol).toBe("ETH");
    });
  });

  describe("unstake", () => {
    it("reduces current_amount and returns updated position", async () => {
      positionRepo.findOne.mockResolvedValue({
        ...mockPosition(),
        current_amount: 10,
      });
      positionRepo.save.mockResolvedValue({
        ...mockPosition(),
        current_amount: 5,
        status: PositionStatus.ACTIVE,
      });

      const result = await service.unstake("user-1", {
        positionId: "pos-1",
        amount: 5,
      });
      expect(result.currentValue).toBe(5);
    });

    it("closes position when all tokens unstaked", async () => {
      positionRepo.findOne.mockResolvedValue({
        ...mockPosition(),
        current_amount: 10,
      });
      positionRepo.save.mockResolvedValue({
        ...mockPosition(),
        current_amount: 0,
        status: PositionStatus.CLOSED,
      });

      await service.unstake("user-1", { positionId: "pos-1", amount: 10 });
      expect(positionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          current_amount: 0,
          status: PositionStatus.CLOSED,
        }),
      );
    });

    it("throws NotFoundException for unknown position", async () => {
      positionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.unstake("user-1", { positionId: "bad-id", amount: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getStakingPositions", () => {
    it("returns positions filtered by STAKING type", async () => {
      const result = await service.getStakingPositions("user-1");
      expect(positionRepo.find).toHaveBeenCalledWith({
        where: { user_id: "user-1", position_type: PositionType.STAKING },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("claimRewards", () => {
    it("records yield and updates accumulated_yield", async () => {
      const result = await service.claimRewards("user-1", "pos-1");
      expect(yieldRepo.save).toHaveBeenCalled();
      expect(result.claimed).toBe(350);
      expect(result.positionId).toBe("pos-1");
    });
  });

  describe("autoCompound", () => {
    it("returns 0 compounded when autoCompound is disabled", async () => {
      positionRepo.findOne.mockResolvedValue({
        ...mockPosition(),
        auto_compound_enabled: false,
      });
      const result = await service.autoCompound("user-1", "pos-1");
      expect(result.compounded).toBe(0);
    });

    it("compounds rewards into position when autoCompound is enabled", async () => {
      positionRepo.findOne.mockResolvedValue({
        ...mockPosition(),
        auto_compound_enabled: true,
      });
      positionRepo.save.mockResolvedValue({
        ...mockPosition(),
        current_amount: 10.1,
        auto_compound_enabled: true,
      });

      const result = await service.autoCompound("user-1", "pos-1");
      expect(result.compounded).toBe(0.1);
      expect(positionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ current_amount: 10.1 }),
      );
    });
  });

  describe("setAutoCompound", () => {
    it("enables auto-compound on a position", async () => {
      positionRepo.save.mockResolvedValue({
        ...mockPosition(),
        auto_compound_enabled: true,
      });
      const result = await service.setAutoCompound("user-1", "pos-1", true);
      expect(result.autoCompound).toBe(true);
    });
  });

  describe("getStakingOpportunities", () => {
    it("returns opportunities only for adapters with stake capability", async () => {
      const adapterNoStake = { ...mockAdapter, stake: undefined };
      protocolRegistry.getAllAdapters.mockReturnValue([
        mockAdapter,
        adapterNoStake,
      ]);

      const result = await service.getStakingOpportunities(["ETH"]);
      expect(result).toHaveLength(1);
      expect(result[0].tokenSymbol).toBe("ETH");
      expect(result[0].apy).toBe(5.2);
    });
  });
});
