import { createRoot } from "react-dom/client";
import { DATA_ELEMENT_ID, isExportPayload } from "@/lib/export-format";
import { ExportViewer } from "./export-viewer";

/**
 * Entry point of the bundle inlined into every HTML export. The board data is
 * already on the page; this only has to read it and mount the viewer.
 */
const root = document.getElementById("root");

if (root) {
  let payload: unknown = null;
  try {
    payload = JSON.parse(document.getElementById(DATA_ELEMENT_ID)?.textContent ?? "null");
  } catch {
    // Falls through to the message below.
  }

  if (isExportPayload(payload)) {
    createRoot(root).render(<ExportViewer payload={payload} />);
  } else {
    root.textContent =
      "This board export couldn't be read. It may be damaged, or from a newer version of Brain Board.";
  }
}
