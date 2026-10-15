import { QueryClient } from "@tanstack/react-query";

import { base64UrlToBytes, disablePush, enablePush, PushError, pushStatusQuery } from "./push";

const ENDPOINT = "https://push.example.com/send/1";

type FakeBrowserOptions = {
  permission?: NotificationPermission;
  answer?: NotificationPermission;
  subscribed?: boolean;
};

/** Stands in for the Push API, which jsdom doesn't have. */
function fakeBrowser({
  permission = "default",
  answer = "granted",
  subscribed = false,
}: FakeBrowserOptions = {}) {
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "key", auth: "secret" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscribed ? subscription : null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { pushManager };
  vi.stubGlobal("navigator", {
    serviceWorker: {
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  vi.stubGlobal("PushManager", vi.fn());
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue(answer),
  });
  return { subscription, pushManager };
}

type MockApiOptions = { publicKey?: string | null; status?: number };

function mockApi({ publicKey = "BAEC", status = 204 }: MockApiOptions = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const request = input as Request;
    if (request.url.endsWith("/api/v1/notifications/push")) {
      return Promise.resolve(
        new Response(JSON.stringify({ public_key: publicKey }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status }));
  });
}

function requests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls.map(([input]) => input as Request);
}

function pushStatus() {
  return new QueryClient().query(pushStatusQuery);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("base64UrlToBytes", () => {
  it("decodes unpadded base64url", () => {
    expect([...base64UrlToBytes("-_8")]).toEqual([0xfb, 0xff]);
  });
});

describe("pushStatusQuery", () => {
  it("is unsupported without the Push API", async () => {
    vi.stubGlobal("navigator", {});

    expect(await pushStatus()).toBe("unsupported");
  });

  it("is unavailable when the server has no keys", async () => {
    fakeBrowser();
    mockApi({ publicKey: null });

    expect(await pushStatus()).toBe("unavailable");
  });

  it("is blocked when the user denied notifications", async () => {
    fakeBrowser({ permission: "denied" });
    mockApi();

    expect(await pushStatus()).toBe("blocked");
  });

  it.each([
    [false, "off"],
    [true, "on"],
  ])("follows the browser's subscription (subscribed: %s)", async (subscribed, status) => {
    fakeBrowser({ subscribed });
    mockApi();

    expect(await pushStatus()).toBe(status);
  });
});

describe("enablePush", () => {
  it("subscribes with the server's key and registers the browser", async () => {
    const { pushManager } = fakeBrowser();
    const fetchSpy = mockApi({ publicKey: "-_8" });

    await enablePush();

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes("-_8"),
    });
    const register = requests(fetchSpy).at(-1);
    expect(register?.method).toBe("POST");
    expect(await register?.json()).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: "key", auth: "secret" },
    });
  });

  it("replaces an existing subscription", async () => {
    const { subscription } = fakeBrowser({ subscribed: true });
    mockApi();

    await enablePush();

    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("explains when the user doesn't allow notifications", async () => {
    const { pushManager } = fakeBrowser({ answer: "denied" });
    mockApi();

    await expect(enablePush()).rejects.toThrow(PushError);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("explains when the server has no keys", async () => {
    fakeBrowser();
    mockApi({ publicKey: null });

    await expect(enablePush()).rejects.toThrow("aren't set up on this server");
  });

  it("unsubscribes again when the server doesn't accept the browser", async () => {
    const { subscription } = fakeBrowser();
    mockApi({ status: 500 });

    await expect(enablePush()).rejects.toThrow(PushError);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("disablePush", () => {
  it("unregisters the browser on the server, then unsubscribes", async () => {
    const { subscription } = fakeBrowser({ subscribed: true });
    const fetchSpy = mockApi();

    await disablePush();

    const [unregister] = requests(fetchSpy);
    expect(unregister?.method).toBe("DELETE");
    expect(await unregister?.json()).toEqual({ endpoint: ENDPOINT });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does nothing when the browser isn't subscribed", async () => {
    fakeBrowser();
    const fetchSpy = mockApi();

    await disablePush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing without the Push API", async () => {
    vi.stubGlobal("navigator", {});
    const fetchSpy = mockApi();

    await disablePush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
