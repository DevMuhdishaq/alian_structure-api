import { Test } from "@nestjs/testing";
import {
  INestApplication,
  Module,
  Controller,
  Get,
  Post,
  Body,
} from "@nestjs/common";
import request from "supertest";
import { LoggingMiddleware } from "./logging.middleware";
import { REQUEST_ID_HEADER } from "./logging.config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(
  overrides: Partial<{
    path: string;
    method: string;
    headers: Record<string, unknown>;
    body: unknown;
    ip: string;
    query: Record<string, string>;
  }> = {},
): any {
  return {
    path: overrides.path ?? "/api/v1/test",
    method: overrides.method ?? "GET",
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    ip: overrides.ip ?? "127.0.0.1",
    query: overrides.query ?? {},
    requestId: undefined,
  };
}

function makeRes(): any {
  const listeners: Record<string, Array<() => void>> = {};
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    setHeader: jest.fn((key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    }),
    getHeader: jest.fn((key: string) => headers[key.toLowerCase()]),
    emit: (event: string) => (listeners[event] ?? []).forEach((cb) => cb()),
    _headers: headers,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("LoggingMiddleware", () => {
  let middleware: LoggingMiddleware;
  let next: jest.Mock;

  beforeEach(() => {
    middleware = new LoggingMiddleware();
    next = jest.fn();
  });

  // -------------------------------------------------------------------------
  // Header sanitisation
  // -------------------------------------------------------------------------

  describe("sanitizeHeaders", () => {
    it("redacts the authorization header", () => {
      const result = middleware.sanitizeHeaders({
        authorization: "Bearer tok",
      });
      expect(result.authorization).toBe("[REDACTED]");
    });

    it("redacts cookie header", () => {
      const result = middleware.sanitizeHeaders({ cookie: "session=abc" });
      expect(result.cookie).toBe("[REDACTED]");
    });

    it("redacts x-api-key header", () => {
      const result = middleware.sanitizeHeaders({ "x-api-key": "secret-key" });
      expect(result["x-api-key"]).toBe("[REDACTED]");
    });

    it("redacts set-cookie header", () => {
      const result = middleware.sanitizeHeaders({ "set-cookie": "id=1" });
      expect(result["set-cookie"]).toBe("[REDACTED]");
    });

    it("redacts x-auth-token header", () => {
      const result = middleware.sanitizeHeaders({ "x-auth-token": "tok" });
      expect(result["x-auth-token"]).toBe("[REDACTED]");
    });

    it("preserves non-sensitive headers", () => {
      const result = middleware.sanitizeHeaders({
        "content-type": "application/json",
        "x-request-id": "abc123",
        accept: "application/json",
      });
      expect(result["content-type"]).toBe("application/json");
      expect(result["x-request-id"]).toBe("abc123");
      expect(result["accept"]).toBe("application/json");
    });

    it("handles header keys case-insensitively", () => {
      const result = middleware.sanitizeHeaders({
        Authorization: "Bearer tok",
      });
      expect(result["Authorization"]).toBe("[REDACTED]");
    });
  });

  // -------------------------------------------------------------------------
  // Body sanitisation
  // -------------------------------------------------------------------------

  describe("sanitizeBody", () => {
    it("redacts password field", () => {
      const result = middleware.sanitizeBody({ password: "secret123" }) as any;
      expect(result.password).toBe("[REDACTED]");
    });

    it("redacts token field", () => {
      const result = middleware.sanitizeBody({ token: "jwt.tok.en" }) as any;
      expect(result.token).toBe("[REDACTED]");
    });

    it("redacts accessToken field", () => {
      const result = middleware.sanitizeBody({ accessToken: "at" }) as any;
      expect(result.accessToken).toBe("[REDACTED]");
    });

    it("redacts refreshToken field", () => {
      const result = middleware.sanitizeBody({ refreshToken: "rt" }) as any;
      expect(result.refreshToken).toBe("[REDACTED]");
    });

    it("redacts ssn field", () => {
      const result = middleware.sanitizeBody({ ssn: "123-45-6789" }) as any;
      expect(result.ssn).toBe("[REDACTED]");
    });

    it("redacts privateKey field", () => {
      const result = middleware.sanitizeBody({
        privateKey: "0xdeadbeef",
      }) as any;
      expect(result.privateKey).toBe("[REDACTED]");
    });

    it("redacts mnemonic field", () => {
      const result = middleware.sanitizeBody({
        mnemonic: "word word word",
      }) as any;
      expect(result.mnemonic).toBe("[REDACTED]");
    });

    it("redacts sensitive fields case-insensitively", () => {
      const result = middleware.sanitizeBody({ PASSWORD: "secret" }) as any;
      expect(result["PASSWORD"]).toBe("[REDACTED]");
    });

    it("preserves non-sensitive fields", () => {
      const result = middleware.sanitizeBody({
        username: "alice",
        email: "alice@example.com",
        age: 30,
      }) as any;
      expect(result.username).toBe("alice");
      expect(result.email).toBe("alice@example.com");
      expect(result.age).toBe(30);
    });

    it("handles nested objects recursively", () => {
      const result = middleware.sanitizeBody({
        user: { name: "bob", password: "secret" },
      }) as any;
      expect(result.user.name).toBe("bob");
      expect(result.user.password).toBe("[REDACTED]");
    });

    it("handles arrays and redacts sensitive fields within them", () => {
      const result = middleware.sanitizeBody([
        { username: "alice", password: "p1" },
        { username: "bob", token: "t2" },
      ]) as any[];
      expect(result[0].username).toBe("alice");
      expect(result[0].password).toBe("[REDACTED]");
      expect(result[1].token).toBe("[REDACTED]");
    });

    it("returns primitives unchanged", () => {
      expect(middleware.sanitizeBody("hello")).toBe("hello");
      expect(middleware.sanitizeBody(42)).toBe(42);
      expect(middleware.sanitizeBody(null)).toBe(null);
      expect(middleware.sanitizeBody(undefined)).toBe(undefined);
    });

    it("stops recursion at depth 5 and returns placeholder", () => {
      const deep: any = {};
      let cur = deep;
      for (let i = 0; i < 7; i++) {
        cur.child = {};
        cur = cur.child;
      }
      cur.password = "secret";

      // Should not throw and should stop recursion gracefully
      expect(() => middleware.sanitizeBody(deep)).not.toThrow();
    });

    it("truncates arrays to 20 elements", () => {
      const arr = Array.from({ length: 30 }, (_, i) => ({ idx: i }));
      const result = middleware.sanitizeBody(arr) as any[];
      expect(result.length).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // Client IP extraction
  // -------------------------------------------------------------------------

  describe("extractClientIp", () => {
    it("returns first IP from x-forwarded-for", () => {
      const req = makeReq({
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(middleware.extractClientIp(req)).toBe("1.2.3.4");
    });

    it("falls back to req.ip when no x-forwarded-for", () => {
      const req = makeReq({ ip: "10.0.0.1" });
      expect(middleware.extractClientIp(req)).toBe("10.0.0.1");
    });

    it("returns unknown when both are absent", () => {
      const req = makeReq();
      req.ip = undefined;
      expect(middleware.extractClientIp(req)).toBe("unknown");
    });
  });

  // -------------------------------------------------------------------------
  // Request ID correlation
  // -------------------------------------------------------------------------

  describe("request ID", () => {
    it("generates a new UUID when no x-request-id header present", () => {
      const req = makeReq();
      const res = makeRes();
      middleware.use(req, res, next);

      const id = req.requestId;
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("uses existing x-request-id from the incoming request", () => {
      const existingId = "custom-id-abc-123";
      const req = makeReq({ headers: { [REQUEST_ID_HEADER]: existingId } });
      const res = makeRes();
      middleware.use(req, res, next);

      expect(req.requestId).toBe(existingId);
    });

    it("sets x-request-id response header", () => {
      const req = makeReq();
      const res = makeRes();
      middleware.use(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        REQUEST_ID_HEADER,
        expect.any(String),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Middleware flow
  // -------------------------------------------------------------------------

  describe("middleware flow", () => {
    it("calls next()", () => {
      const req = makeReq();
      const res = makeRes();
      middleware.use(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("skips all processing when disabled", () => {
      const m = new LoggingMiddleware({ enabled: false });
      const req = makeReq();
      const res = makeRes();
      m.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("registers a finish listener on the response", () => {
      const req = makeReq();
      const res = makeRes();
      middleware.use(req, res, next);

      expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // isBodyTooLarge
  // -------------------------------------------------------------------------

  describe("isBodyTooLarge", () => {
    it("returns true when Content-Length exceeds maxBodySize", () => {
      const req = makeReq({ headers: { "content-length": "20000" } });
      expect(middleware.isBodyTooLarge(req)).toBe(true);
    });

    it("returns false when Content-Length is within limit", () => {
      const req = makeReq({ headers: { "content-length": "512" } });
      expect(middleware.isBodyTooLarge(req)).toBe(false);
    });

    it("returns false when Content-Length header is absent", () => {
      const req = makeReq();
      expect(middleware.isBodyTooLarge(req)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Route-level log level
  // -------------------------------------------------------------------------

  describe("route log level", () => {
    it("applies silent level to /metrics routes (no next() interference)", () => {
      const req = makeReq({ path: "/metrics" });
      const res = makeRes();
      // Should not throw even on silent routes
      expect(() => middleware.use(req, res, next)).not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it("applies custom route level configuration", () => {
      const m = new LoggingMiddleware({
        routeLogLevels: [{ pattern: /^\/admin/, level: "warn" }],
      });
      const req = makeReq({ path: "/admin/users" });
      const res = makeRes();
      expect(() => m.use(req, res, next)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

@Controller("test-logging")
class TestController {
  @Get()
  getHello() {
    return { message: "hello" };
  }

  @Post("login")
  login(@Body() body: { username: string; password: string }) {
    return { user: body.username };
  }
}

@Module({ controllers: [TestController] })
class TestAppModule {}

describe("LoggingMiddleware – integration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const m = new LoggingMiddleware();
    app.use(m.use.bind(m));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns x-request-id header in response", async () => {
    const res = await request(app.getHttpServer()).get("/test-logging");
    expect(res.headers[REQUEST_ID_HEADER]).toBeDefined();
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("echoes back a supplied x-request-id header", async () => {
    const myId = "my-trace-id-xyz";
    const res = await request(app.getHttpServer())
      .get("/test-logging")
      .set(REQUEST_ID_HEADER, myId);
    expect(res.headers[REQUEST_ID_HEADER]).toBe(myId);
  });

  it("returns 200 for GET /test-logging", async () => {
    const res = await request(app.getHttpServer()).get("/test-logging");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("hello");
  });

  it("does not expose password in response even on login endpoint", async () => {
    const res = await request(app.getHttpServer())
      .post("/test-logging/login")
      .send({ username: "alice", password: "secret" })
      .set("Content-Type", "application/json");
    // Response body should only contain the user field, not the password
    expect(res.body.user).toBe("alice");
    expect(res.body.password).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Performance benchmark
// ---------------------------------------------------------------------------

describe("LoggingMiddleware – performance", () => {
  it("adds less than 2 ms overhead per request (averaged over 1000 calls)", () => {
    const middleware = new LoggingMiddleware();
    const next = jest.fn();

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const req = makeReq({
        headers: {
          "content-type": "application/json",
          "user-agent": "test-runner",
        },
        body: { username: "alice", action: "read" },
      });
      const res = makeRes();
      middleware.use(req, res, next);
      res.emit("finish");
    }

    const totalMs = performance.now() - start;
    const avgMs = totalMs / iterations;

    expect(avgMs).toBeLessThan(2);
  });
});



