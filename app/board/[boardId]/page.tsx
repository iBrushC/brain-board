import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardApp } from "@/components/board-app";
import { requirePlacedViewer } from "@/lib/auth";
import { getBoard } from "@/lib/boards";

export async function generateMetadata({
  params,
}: PageProps<"/board/[boardId]">): Promise<Metadata> {
  const { boardId } = await params;
  const loaded = await getBoard(boardId);
  return { title: loaded ? `${loaded.board.name} · Brain Board` : "Brain Board" };
}

export default async function Page({ params }: PageProps<"/board/[boardId]">) {
  const viewer = await requirePlacedViewer();
  const { boardId } = await params;

  const loaded = await getBoard(boardId);
  // RLS returns nothing for a board you can't read, which is the same answer as
  // a board that doesn't exist — and should stay that way.
  if (!loaded) notFound();

  return (
    <BoardApp
      board={loaded.board}
      initialConcepts={loaded.concepts}
      // Admins can read every board in the organization but write to none, so
      // the editing affordances are withheld rather than left to fail.
      readOnly={loaded.board.ownerId !== viewer.id}
    />
  );
}
