import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface ClearProjectButtonProps {
  onClear: () => void;
}

export const ClearProjectButton = ({ onClear }: ClearProjectButtonProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClear}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Clear All
    </Button>
  );
};
