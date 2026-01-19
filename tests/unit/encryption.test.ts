import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptCredential, decryptCredential } from "../../server/lib/encryption";

describe("Encryption Module", () => {
  describe("encrypt/decrypt", () => {
    it("should encrypt and decrypt a simple string", () => {
      const plaintext = "hello world";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt an empty string", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt unicode characters", () => {
      const plaintext = "Hello 世界 🌍 привет";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt a long string", () => {
      const plaintext = "a".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertexts for the same plaintext (due to random IV)", () => {
      const plaintext = "same message";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it("should throw error when decrypting invalid data", () => {
      expect(() => decrypt("invalid-base64")).toThrow();
    });

    it("should throw error when decrypting tampered data", () => {
      const encrypted = encrypt("test");
      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -5) + "XXXXX";
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("encryptCredential/decryptCredential", () => {
    it("should encrypt and decrypt an OAuth token", () => {
      const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const encrypted = encryptCredential(token);
      const decrypted = decryptCredential(encrypted);

      expect(encrypted).not.toBe(token);
      expect(decrypted).toBe(token);
    });

    it("should handle JSON token data", () => {
      const tokenData = JSON.stringify({
        access_token: "abc123",
        refresh_token: "def456",
        expires_in: 3600,
      });
      const encrypted = encryptCredential(tokenData);
      const decrypted = decryptCredential(encrypted);

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(tokenData));
    });
  });
});
