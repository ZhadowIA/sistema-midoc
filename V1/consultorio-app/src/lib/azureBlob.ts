import { DefaultAzureCredential } from "@azure/identity";
import { BlobSASPermissions, BlobServiceClient, ContainerClient, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { getServerEnv } from "@/lib/env";

let cachedServiceClient: BlobServiceClient | null = null;
let cachedContainerClient: ContainerClient | null = null;

function resolveAzureConfig() {
  const env = getServerEnv();
  const account = env.AZURE_STORAGE_ACCOUNT ?? process.env.AZURE_STORAGE_ACCOUNT;
  const container = env.AZURE_STORAGE_CONTAINER ?? process.env.AZURE_STORAGE_CONTAINER;

  if (!account) throw new Error("Falta AZURE_STORAGE_ACCOUNT para Azure Blob con Managed Identity");
  if (!container) throw new Error("Falta AZURE_STORAGE_CONTAINER para Azure Blob");

  return { account, container };
}

function getAzureBlobServiceClient(): BlobServiceClient {
  if (cachedServiceClient) return cachedServiceClient;
  const { account } = resolveAzureConfig();
  cachedServiceClient = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
  return cachedServiceClient;
}

export function getAzureBlobContainerClient(): ContainerClient {
  if (cachedContainerClient) return cachedContainerClient;
  const { container } = resolveAzureConfig();
  cachedContainerClient = getAzureBlobServiceClient().getContainerClient(container);
  return cachedContainerClient;
}

export async function uploadBufferToAzureBlob(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  folder: string;
}) {
  const container = getAzureBlobContainerClient();
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobName = `${params.folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const client = container.getBlockBlobClient(blobName);
  await client.uploadData(params.bytes, {
    blobHTTPHeaders: { blobContentType: params.mimeType },
  });
  // Returns blobName only — never expose permanent public URLs to clients.
  // Use generateBlobReadSasUrl() to produce short-lived read URLs.
  return { blobName };
}

/**
 * Generates a short-lived read-only SAS URL for a stored blob.
 * Uses User Delegation SAS (Managed Identity) — no account key required.
 * Handles legacy records whose fileUrl is already a full https:// URL.
 */
export async function generateBlobReadSasUrl(blobPath: string, expiryMinutes = 60): Promise<string> {
  // Backward-compat: old records stored the full public URL directly.
  if (blobPath.startsWith("https://")) return blobPath;

  const { account, container } = resolveAzureConfig();
  const serviceClient = getAzureBlobServiceClient();

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);

  const userDelegationKey = await serviceClient.getUserDelegationKey(startsOn, expiresOn);

  const sasParams = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
    },
    userDelegationKey,
    account
  );

  return `https://${account}.blob.core.windows.net/${container}/${blobPath}?${sasParams.toString()}`;
}
