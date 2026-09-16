import { readJson, toErrorResponse } from "@/lib/api";
import { readAllConcepts } from "@/lib/store";
import { getVaultPath, setVaultPath, VaultError } from "@/lib/vault";

export async function GET() {
  try {
    const path = await getVaultPath();
    const conceptCount = path ? (await readAllConcepts()).length : 0;
    return Response.json({ path, conceptCount });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ path?: unknown }>(request);
    if (typeof body.path !== "string") throw new VaultError("A folder path is required.");

    const path = await setVaultPath(body.path);
    return Response.json({ path, conceptCount: (await readAllConcepts()).length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
