// A stand-in phone for the push tests (#319): a key pair and auth secret like
// a browser's PushSubscription, and the RFC 8291 (aes128gcm) decryption a
// browser does, so a test reads exactly what the phone would show.

import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

export function standinDevice(endpoint: string) {
  const ecdh = createECDH("prime256v1");
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    subscription: { endpoint, keys: { p256dh: publicKey.toString("base64url"), auth: auth.toString("base64url") } },
    /** The push body as the phone reads it, parsed. */
    read(body: Buffer): { title: string; body: string; tag: string; url: string } {
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const serverKey = body.subarray(21, 21 + idlen);
      const secret = ecdh.computeSecret(serverKey);
      const info = (label: string) => Buffer.from(`Content-Encoding: ${label}\0`);
      const ikm = Buffer.from(
        hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), publicKey, serverKey]), 32),
      );
      const key = Buffer.from(hkdfSync("sha256", ikm, salt, info("aes128gcm"), 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, info("nonce"), 12));
      const sealed = body.subarray(21 + idlen);
      const decipher = createDecipheriv("aes-128-gcm", key, nonce);
      decipher.setAuthTag(sealed.subarray(-16));
      const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
      return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString("utf8"));
    },
  };
}
