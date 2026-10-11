// Preloaded into `next start` after fakeB2.mjs by push.test.mjs: the push
// services (https://push.fake.test/...) and ntfy (https://ntfy.fake.test/...)
// become the test's own recorder at E2E_PUSH_TARGET, so the deployed routes
// send exactly as they would to FCM, APNs or ntfy.sh, and the test reads what
// arrived. The service host travels in `x-fake-host`.

const target = process.env.E2E_PUSH_TARGET;
const inner = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!target || !/^(push|ntfy)\.fake\.test$/.test(url.hostname)) return inner(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-fake-host", url.hostname);
  return inner(`${target}${url.pathname}`, { ...init, headers });
};
