"use client";

import { useState, useCallback } from "react";
import { Entity } from "@/app/types";

interface UseScenarioItemEditorOptions<T extends Entity> {
    entity: T;
    onUpdate: (updatedEntity: T, ...args: unknown[]) => Promise<void> | void;
    initialIsEditing?: boolean;
}

export function useScenarioItemEditor<T extends Entity>({
    entity,
    onUpdate,
    initialIsEditing = false,
}: UseScenarioItemEditorOptions<T>) {
    const [isEditing, setIsEditing] = useState(initialIsEditing);
    const [editedEntity, setEditedEntity] = useState<T>(entity);
    const [isSaving, setIsSaving] = useState(false);
    const [prevEntity, setPrevEntity] = useState<T>(entity);
    const [prevIsEditing, setPrevIsEditing] = useState(isEditing);

    // Sync state with props
    if (prevEntity !== entity || prevIsEditing !== isEditing) {
        setPrevEntity(entity);
        setPrevIsEditing(isEditing);
        if (!isEditing) {
            setEditedEntity(entity);
        } else if (editedEntity.imageGcsUri !== entity.imageGcsUri) {
            // If editing, preserve local changes but sync image updates
            // which happen via separate actions (Regenerate/Upload)
            setEditedEntity({
                ...editedEntity,
                imageGcsUri: entity.imageGcsUri,
            });
        }
    }

    const enterEditMode = useCallback(() => {
        setIsEditing(true);
        setEditedEntity(entity);
    }, [entity]);

    const exitEditMode = useCallback(() => {
        setIsEditing(false);
    }, []);

    const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
        setEditedEntity((prev) => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    const handleSave = useCallback(
        async (...args: unknown[]) => {
            setIsSaving(true);
            try {
                await Promise.resolve(onUpdate(editedEntity, ...args));
                setIsEditing(false);
            } catch (error) {
                console.error("Failed to save entity:", error);
            } finally {
                setIsSaving(false);
            }
        },
        [editedEntity, onUpdate],
    );

    const handleCancel = useCallback(() => {
        setEditedEntity(entity);
        setIsEditing(false);
    }, [entity]);

    return {
        isEditing,
        editedEntity,
        isSaving,
        enterEditMode,
        exitEditMode,
        updateField,
        handleSave,
        handleCancel,
        setEditedEntity,
    };
}
