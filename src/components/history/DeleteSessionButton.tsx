import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  sessionId: string;
  sessionDate: string;
}

export default function DeleteSessionButton({ sessionId, sessionDate }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      if (res.ok) {
        window.location.reload();
      } else {
        setError("Nie udało się usunąć sesji. Spróbuj ponownie.");
        setPending(false);
      }
    } catch {
      setError("Nie udało się usunąć sesji. Sprawdź połączenie i spróbuj ponownie.");
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0 cursor-pointer"
          aria-label={`Usuń sesję z dnia ${sessionDate}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć tę sesję?</AlertDialogTitle>
          <AlertDialogDescription>
            Tej operacji nie można cofnąć. Sesja z dnia {sessionDate} i jej odpowiedzi zostaną trwale usunięte.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Anuluj</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending ? "Usuwanie…" : "Usuń"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
