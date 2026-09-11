import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { execSync } from "child_process";
import * as forge from "node-forge";

export class LibUtils {
  private D2E_MEM_TO_SWAP_LIMIT_RATIO: number;
  private D2E_RESOURCE_LIMIT: number;
  private TLS__INTERNAL__DOMAIN_NAME: string;
  private TLS__X509__SUBJ_BASE: string;
  private DEFAULT_PASSWORD_LENGTH: number = 30;
  private OS: string;

  constructor() {
    this.D2E_MEM_TO_SWAP_LIMIT_RATIO = parseInt(
      process.env.D2E_MEM_TO_SWAP_LIMIT_RATIO || "4"
    );
    this.D2E_RESOURCE_LIMIT = parseFloat(
      process.env.D2E_RESOURCE_LIMIT || "0.7"
    );
    // Consumers (docker-compose, Helm) read TLS__INTERNAL__DOMAIN, so that name
    // wins here; TLS__INTERNAL__DOMAIN_NAME stays as a fallback for existing
    // .env files. The SAN is built from this value — a mismatch means every
    // internal HTTPS hop fails hostname verification.
    this.TLS__INTERNAL__DOMAIN_NAME =
      process.env.TLS__INTERNAL__DOMAIN ||
      process.env.TLS__INTERNAL__DOMAIN_NAME ||
      "d2e.local";
    this.TLS__X509__SUBJ_BASE =
      process.env.TLS__X509__SUBJ_BASE || "/C=SG/O=D4L/OU=D2E";
    this.OS = this.detectOS();
  }

  detectOS(): string {
    const platform = process.platform;
    if (platform === "linux") return "Linux";
    if (platform === "darwin") return "Darwin";
    if (platform === "win32") return "Windows_NT";
    return os.type();
  }

  // Engines that enforce a password policy - HANA among them - require at least
  // one uppercase letter, one lowercase letter and one digit. Drawing uniformly
  // from the alphabet does not guarantee that: a sixteen-character password
  // contains no digit roughly six percent of the time, which surfaced as an
  // occasional HANA setup failure that looked like an infrastructure flake.
  // Redrawing leaves every compliant password equally likely, which placing one
  // character of each class at a fixed position would not.
  randomPassword(passwordLength: number): string {
    while (true) {
      const password = this.drawPassword(passwordLength);
      // Too short to hold one of each; the caller asked for what it asked for.
      if (
        passwordLength < 3 ||
        (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password))
      ) {
        return password;
      }
    }
  }

  private drawPassword(passwordLength: number): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let password = "";
    const charsLength = chars.length;
    const maxValidByte = Math.floor(256 / charsLength) * charsLength; // 248 for charsLength=62
    while (password.length < passwordLength) {
      const byte = crypto.randomBytes(1)[0];
      if (byte >= maxValidByte) continue;
      password += chars[byte % charsLength];
    }
    return password;
  }

  setCpuLimit(dotenvFile: string): void {
    console.log(". INFO set cpu limit");

    try {
      let nprocs: number;

      if (this.OS === "Linux") {
        const result = execSync("nproc --all", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        nprocs = parseInt(result.trim());
      } else if (this.OS === "Darwin") {
        const result = execSync("sysctl -n hw.ncpu", { encoding: "utf-8" });
        nprocs = parseInt(result.trim());
      } else if (this.OS === "Windows_NT") {
        try {
          const result = execSync(
            "wmic cpu get NumberOfLogicalProcessors /value",
            { encoding: "utf-8" }
          );
          const match = result.match(/NumberOfLogicalProcessors=(\d+)/);
          nprocs = match
            ? parseInt(match[1])
            : parseInt(process.env.NUMBER_OF_PROCESSORS || "1");
        } catch {
          nprocs = parseInt(process.env.NUMBER_OF_PROCESSORS || "1");
        }
      } else {
        const result = execSync("getconf _NPROCESSORS_ONLN", {
          encoding: "utf-8",
        });
        nprocs = parseInt(result.trim());
      }

      let d2eCpuLimit = Math.floor(nprocs * this.D2E_RESOURCE_LIMIT);
      if (d2eCpuLimit === 0) d2eCpuLimit = 1;

      let envContent = fs.readFileSync(dotenvFile, "utf-8");
      envContent = envContent.replace(/^D2E_CPU_LIMIT=.*$/gm, "").trim();
      envContent += `\nD2E_CPU_LIMIT=${d2eCpuLimit}\n`;
      fs.writeFileSync(dotenvFile, envContent);
      console.log(`D2E_CPU_LIMIT=${d2eCpuLimit}`);
    } catch (error) {
      console.error("Error setting CPU limit:", error);
    }
  }

  setMemoryLimit(dotenvFile: string): void {
    console.log(". INFO set memory limit");

    try {
      let memoryGb: number;

      if (this.OS === "Darwin") {
        const result = execSync("sysctl -n hw.memsize", { encoding: "utf-8" });
        const memoryBytes = parseInt(result.trim());
        memoryGb = Math.floor(memoryBytes / (1024 * 1024 * 1024));
      } else if (this.OS === "Windows_NT") {
        try {
          const result = execSync(
            "wmic ComputerSystem get TotalPhysicalMemory /value",
            {
              encoding: "utf-8",
            }
          );
          const match = result.match(/TotalPhysicalMemory=(\d+)/);
          const memoryBytes = match ? parseInt(match[1]) : 0;
          memoryGb = Math.floor(memoryBytes / (1024 * 1024 * 1024));
        } catch {
          memoryGb = 0;
        }
      } else {
        const result = execSync("free -g | grep Mem: | awk '{print $2}'", {
          encoding: "utf-8",
        });
        memoryGb = parseInt(result.trim());
      }

      let d2eMemoryLimit = Math.floor(memoryGb * this.D2E_RESOURCE_LIMIT);
      let d2eSwapLimit = d2eMemoryLimit * this.D2E_MEM_TO_SWAP_LIMIT_RATIO;

      const d2eMemoryLimitStr = `${d2eMemoryLimit}G`;
      const d2eSwapLimitStr = `${d2eSwapLimit}G`;

      let envContent = fs.readFileSync(dotenvFile, "utf-8");
      envContent = envContent
        .replace(/^D2E_MEMORY_LIMIT=.*$/gm, "")
        .replace(/^D2E_SWAP_LIMIT=.*$/gm, "")
        .trim();
      envContent += `\nD2E_MEMORY_LIMIT=${d2eMemoryLimitStr}\n`;
      envContent += `D2E_SWAP_LIMIT=${d2eSwapLimitStr}\n`;
      fs.writeFileSync(dotenvFile, envContent);
      console.log(`D2E_MEMORY_LIMIT=${d2eMemoryLimitStr}`);
      console.log(`D2E_SWAP_LIMIT=${d2eSwapLimitStr}`);
    } catch (error) {
      console.error("Error setting memory limit:", error);
    }
  }

  async genTlsInternal(dotenvFile: string): Promise<void> {
    console.log(". INFO generate x509 certs - TLS__INTERNAL_*");

    try {
      if (typeof globalThis.crypto === "undefined") {
        (globalThis as any).crypto = crypto.webcrypto;
      }

      const pki = forge.pki;

      // Generate CA keypair
      const caKeyPair = pki.rsa.generateKeyPair({ bits: 2048 });
      const caCert = pki.createCertificate();

      caCert.publicKey = caKeyPair.publicKey;
      caCert.serialNumber = globalThis.crypto.randomUUID().replace(/-/g, "").substring(0, 16);

      const caSubject = [
        {
          name: "commonName",
          value: "D2E Internal CA",
        },
      ];

      caCert.setSubject(caSubject);
      caCert.setIssuer(caSubject);

      const now = new Date();
      caCert.validity.notBefore = now;
      caCert.validity.notAfter = new Date(
        now.getTime() + 3650 * 24 * 60 * 60 * 1000
      );

      caCert.setExtensions([
        {
          name: "basicConstraints",
          cA: true,
          pathLenConstraint: 1,
        },
        {
          name: "keyUsage",
          keyCertSign: true,
          cRLSign: true,
        },
      ]);

      caCert.sign(caKeyPair.privateKey, forge.md.sha256.create());

      // Generate Server keypair
      const serverKeyPair = pki.rsa.generateKeyPair({ bits: 2048 });
      const serverCert = pki.createCertificate();

      serverCert.publicKey = serverKeyPair.publicKey;
      serverCert.serialNumber = globalThis.crypto.randomUUID().replace(/-/g, "").substring(0, 16);

      const serverSubject = [
        {
          name: "commonName",
          value: this.TLS__INTERNAL__DOMAIN_NAME,
        },
      ];

      serverCert.setSubject(serverSubject);
      serverCert.setIssuer(caSubject);

      serverCert.validity.notBefore = now;
      serverCert.validity.notAfter = new Date(
        now.getTime() + 3650 * 24 * 60 * 60 * 1000
      );

      serverCert.setExtensions([
        {
          name: "basicConstraints",
          cA: false,
        },
        {
          name: "keyUsage",
          digitalSignature: true,
          keyEncipherment: true,
        },
        {
          name: "extKeyUsage",
          serverAuth: true,
          clientAuth: true,
        },
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: `*.${this.TLS__INTERNAL__DOMAIN_NAME}` },
            { type: 2, value: this.TLS__INTERNAL__DOMAIN_NAME },
          ],
        },
      ]);

      serverCert.sign(caKeyPair.privateKey, forge.md.sha256.create());

      // Convert to PEM format
      const caRsaAsn1 = pki.privateKeyToAsn1(caKeyPair.privateKey);
      const caKeyInfo = pki.wrapRsaPrivateKey(caRsaAsn1);
      const TLS__INTERNAL__CA_KEY = pki.privateKeyInfoToPem(caKeyInfo).trim();

      const serverRsaAsn1 = pki.privateKeyToAsn1(serverKeyPair.privateKey);
      const serverKeyInfo = pki.wrapRsaPrivateKey(serverRsaAsn1);
      const TLS__INTERNAL__KEY = pki.privateKeyInfoToPem(serverKeyInfo).trim();

      const TLS__INTERNAL__CA_CRT = pki.certificateToPem(caCert).trim();
      const TLS__INTERNAL__CRT = pki.certificateToPem(serverCert).trim();

      let envContent = fs.readFileSync(dotenvFile, "utf-8");
      envContent = envContent
        .replace(/^TLS__INTERNAL__CA_CRT=[\s\S]*?END CERTIFICATE-----"$/gm, "")
        .replace(/^TLS__INTERNAL__CRT=[\s\S]*?END CERTIFICATE-----"$/gm, "")
        .replace(/^TLS__INTERNAL__KEY=[\s\S]*?END PRIVATE KEY-----"$/gm, "")
        .replace(/^TLS__INTERNAL__CA_KEY=[\s\S]*?END PRIVATE KEY-----"$/gm, "")
        .replace(/^TLS__INTERNAL__DOMAIN=.*$/gm, "")
        .trim();

      const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      envContent += `\nTLS__INTERNAL__CA_CRT="${esc(TLS__INTERNAL__CA_CRT)}"\n`;
      envContent += `TLS__INTERNAL__CRT="${esc(TLS__INTERNAL__CRT)}"\n`;
      envContent += `TLS__INTERNAL__KEY="${esc(TLS__INTERNAL__KEY)}"\n`;
      // Persist the domain the cert was actually issued for, so compose and the
      // chart cannot silently drift onto a name the SAN does not cover.
      envContent += `TLS__INTERNAL__DOMAIN="${this.TLS__INTERNAL__DOMAIN_NAME}"\n`;
      fs.writeFileSync(dotenvFile, envContent);
      console.log("TLS certificates generated successfully");
    } catch (error) {
      console.error("Error generating TLS certificates:", error);
    }
  }
}
