import { SanitizePipe } from "./sanitize.pipe";

describe("SanitizePipe", () => {
  let pipe: SanitizePipe;

  beforeEach(() => {
    pipe = new SanitizePipe();
  });

  it("should trim string values", () => {
    const input = "   hello world   ";
    const result = pipe.transform(input);
    expect(result).toBe("hello world");
  });

  it("should sanitize XSS script tags and HTML markup", () => {
    const input = "<script>alert('XSS')</script><b>Hello</b>";
    const result = pipe.transform(input) as string;
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("&lt;b&gt;Hello&lt;&#x2F;b&gt;");
  });

  it("should sanitize inline event handlers", () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = pipe.transform(input) as string;
    expect(result).not.toContain("onerror");
  });

  it("should neutralize javascript: URIs", () => {
    const input = "javascript:alert(1)";
    const result = pipe.transform(input) as string;
    expect(result).not.toContain("javascript:");
    expect(result).toBe("alert(1)");
  });

  it("should neutralize SQL injection comment markers", () => {
    const input = "admin' -- ";
    const result = pipe.transform(input) as string;
    expect(result).not.toContain("--");
    expect(result).toContain("admin&#x27;");
  });

  it("should recursively sanitize nested objects", () => {
    const input = {
      username: "  alice  ",
      profile: {
        bio: "<script>hack()</script>  Software Engineer  ",
        social: {
          website: "javascript:evil()",
        },
      },
      tags: ["  node  ", "<img src=x onerror=bad()>"],
    };

    const result = pipe.transform(input) as any;

    expect(result.username).toBe("alice");
    expect(result.profile.bio).toBe("Software Engineer");
    expect(result.profile.bio).not.toContain("<script>");
    expect(result.profile.social.website).not.toContain("javascript:");
    expect(result.tags[0]).toBe("node");
    expect(result.tags[1]).not.toContain("onerror");
  });

  it("should leave numbers, booleans, dates, null and undefined untouched", () => {
    const date = new Date();
    const input = {
      count: 42,
      active: true,
      createdAt: date,
      empty: null,
      missing: undefined,
    };

    const result = pipe.transform(input) as any;

    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.createdAt).toBe(date);
    expect(result.empty).toBeNull();
    expect(result.missing).toBeUndefined();
  });
});
