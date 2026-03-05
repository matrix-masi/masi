import type { MatrixClient } from "matrix-js-sdk";

export async function shareRecoveryKeyToAllClients(
  recoveryKeyBytes: Uint8Array<ArrayBuffer>,
  clients: MatrixClient[],
): Promise<void> {
  for (const client of clients) {
    try {
      const cryptoModule = client.getCrypto();
      if (!cryptoModule) continue;
      await cryptoModule.loadSessionBackupPrivateKeyFromSecretStorage();
      await cryptoModule.checkKeyBackupAndEnable();
    } catch (err) {
      console.warn(
        `Recovery key setup failed for ${client.getUserId()}:`,
        err,
      );
    }
  }
}

export async function exportAndImportRoomKeys(
  clients: MatrixClient[],
): Promise<{ exported: number; imported: number }> {
  if (clients.length < 2) return { exported: 0, imported: 0 };

  let bestClient: MatrixClient | null = null;
  let bestKeyCount = -1;

  for (const c of clients) {
    try {
      const crypto = c.getCrypto();
      if (!crypto) continue;
      const keys = await crypto.exportRoomKeys();
      if (keys.length > bestKeyCount) {
        bestKeyCount = keys.length;
        bestClient = c;
      }
    } catch {
      continue;
    }
  }

  if (!bestClient || bestKeyCount <= 0) return { exported: 0, imported: 0 };

  let keys: ReturnType<typeof JSON.parse>;
  try {
    const crypto = bestClient.getCrypto()!;
    keys = await crypto.exportRoomKeys();
  } catch (err) {
    console.error("Failed to export room keys:", err);
    return { exported: 0, imported: 0 };
  }

  let imported = 0;
  for (const c of clients) {
    if (c === bestClient) continue;
    try {
      const crypto = c.getCrypto();
      if (!crypto) continue;
      await crypto.importRoomKeys(keys);
      imported++;
    } catch (err) {
      console.warn(
        `Failed to import room keys into ${c.getUserId()}:`,
        err,
      );
    }
  }

  return { exported: bestKeyCount, imported };
}
