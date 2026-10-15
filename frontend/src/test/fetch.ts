/**
 * The Request a mocked `fetch` was called with. `fetch` also takes a URL or a string, but the API
 * client always passes a Request, so anything else is a bug in the test.
 */
export function requestOf(input: RequestInfo | URL | undefined): Request {
  if (!(input instanceof Request)) {
    throw new Error("fetch was called without a Request.");
  }
  return input;
}
