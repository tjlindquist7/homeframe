import { writeFile } from "node:fs/promises";

export async function POST(request: Request) {
  if (request.headers.get("x-homeframe-action") !== "close") {
    return Response.json({ error: "Invalid close request." }, { status: 403 });
  }

  const closeFile = process.env.HOMEFRAME_CLOSE_FILE;
  if (!closeFile) {
    return Response.json(
      { error: "The desktop launcher is not active." },
      { status: 409 },
    );
  }

  await writeFile(closeFile, "close\n", { encoding: "utf8" });
  return Response.json({ closing: true });
}
