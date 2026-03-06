import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReorderControlsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  disabled: boolean;
  fundName: string;
}

export function ReorderControls({ onMoveUp, onMoveDown, disableUp, disableDown, disabled, fundName }: ReorderControlsProps) {
  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={`上移 ${fundName}`}
        onClick={onMoveUp}
        disabled={disabled || disableUp}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={`下移 ${fundName}`}
        onClick={onMoveDown}
        disabled={disabled || disableDown}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
