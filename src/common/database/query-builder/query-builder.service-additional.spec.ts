import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { QueryBuilderService } from "./query-builder.service";

const makeQueryBuilder = (): any => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  having: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  rightJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getOne: jest.fn().mockResolvedValue(null),
  getMany: jest.fn().mockResolvedValue([]),
  getCount: jest.fn().mockResolvedValue(0),
  query: jest.fn().mockResolvedValue([]),
});

const mockDataSource = {
  getRepository: jest.fn(),
  createQueryRunner: jest.fn(),
};

describe("QueryBuilderService - additional coverage", () => {
  let service: QueryBuilderService<any>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockDataSource.getRepository as jest.Mock).mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilder()),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryBuilderService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<QueryBuilderService<any>>(QueryBuilderService);
  });

  it("applies custom select fields in findAll", async () => {
    const qb = makeQueryBuilder();
    qb.getManyAndCount.mockResolvedValue([[{ id: "1" }], 1]);
    (mockDataSource.getRepository as jest.Mock).mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    const result = await service.findAll(Object, {
      select: ["id", "name"],
    });
    expect(qb.addSelect).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
  });

  it("applies group by and having in findAll", async () => {
    const qb = makeQueryBuilder();
    qb.getManyAndCount.mockResolvedValue([[{ id: "1" }], 1]);
    (mockDataSource.getRepository as jest.Mock).mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });
    const result = await service.findAll(Object, {
      groupBy: ["status"],
      having: { field: "count", operator: ">", value: 0 },
    });
    expect(qb.addGroupBy).toHaveBeenCalled();
    expect(qb.having).toHaveBeenCalled();
  });
});
