"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface MetadataField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type: "text" | "textarea";
}

interface CustomMetadataProps {
  fields: MetadataField[];
  values: Record<string, string>;
  onChange: (fieldName: string, value: string) => void;
  disabled?: boolean;
}

export function CustomMetadata({
  fields,
  values,
  onChange,
  disabled = false,
}: CustomMetadataProps) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <label htmlFor={field.name} className="text-sm font-medium">
            {field.label}
            {field.required && " *"}
          </label>
          {field.type === "textarea" ? (
            <Textarea
              id={field.name}
              value={values[field.name] || ""}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              rows={3}
            />
          ) : (
            <Input
              id={field.name}
              value={values[field.name] || ""}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
            />
          )}
        </div>
      ))}
    </div>
  );
}
