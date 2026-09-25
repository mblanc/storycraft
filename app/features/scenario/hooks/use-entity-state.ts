"use client";

import { useState, useCallback } from "react";
import { clientLogger } from "@/lib/utils/client-logger";
import { Entity } from "@/app/types";

interface UseEntityStateOptions<T extends Entity> {
    entities: T[] | undefined;
    onUpdateEntities: (
        updatedEntities: T[],
        updatedScenarioText?: string,
    ) => void;
    deleteEntityAction: (
        scenarioText: string,
        name: string,
        description: string,
    ) => Promise<{ updatedScenario?: string }>;
    scenarioText: string | undefined;
    entityType: string;
    defaultNewEntity: T;
    loadingStates?: Set<number>;
}

export function useEntityState<T extends Entity>({
    entities: propEntities = [],
    onUpdateEntities,
    deleteEntityAction,
    scenarioText = "",
    entityType,
    defaultNewEntity,
    loadingStates,
}: UseEntityStateOptions<T>) {
    const [localEntities, setLocalEntities] = useState<T[]>(propEntities);
    const [localLoading, setLocalLoading] = useState<Set<number>>(new Set());
    const [newEntityIndex, setNewEntityIndex] = useState<number | null>(null);
    const [prevPropEntities, setPrevPropEntities] = useState<T[]>(propEntities);

    // Sync localEntities with propEntities when props change,
    // but preserve the new unsaved entity if one is being added.
    if (prevPropEntities !== propEntities) {
        setPrevPropEntities(propEntities);
        setLocalEntities((prev) => {
            if (newEntityIndex !== null && prev.length > propEntities.length) {
                const newEntity = prev[prev.length - 1];
                return [...propEntities, newEntity];
            }
            return propEntities;
        });
    }

    const isLoading = useCallback(
        (index: number) => {
            return loadingStates?.has(index) || localLoading.has(index);
        },
        [loadingStates, localLoading],
    );

    const isDeleting = useCallback(
        (index: number) => {
            return localLoading.has(index);
        },
        [localLoading],
    );

    const handleUpdate = useCallback(
        (index: number, updatedEntity: T, updatedScenarioText?: string) => {
            const updatedEntities = [...localEntities];
            updatedEntities[index] = {
                ...updatedEntities[index],
                ...updatedEntity,
            };
            onUpdateEntities(updatedEntities, updatedScenarioText);
            if (newEntityIndex === index) setNewEntityIndex(null);
        },
        [localEntities, onUpdateEntities, newEntityIndex],
    );

    const handleAdd = useCallback(() => {
        const updatedEntities = [...localEntities, defaultNewEntity];
        setLocalEntities(updatedEntities);
        setNewEntityIndex(updatedEntities.length - 1);
    }, [localEntities, defaultNewEntity]);

    const handleRemove = useCallback(
        async (index: number) => {
            if (index === newEntityIndex) {
                setLocalEntities((prev) => prev.filter((_, i) => i !== index));
                setNewEntityIndex(null);
                return;
            }

            setLocalLoading((prev) => new Set([...prev, index]));
            try {
                const response = await deleteEntityAction(
                    scenarioText,
                    localEntities[index].name,
                    localEntities[index].description,
                );
                const updatedEntities = localEntities.filter(
                    (_, i) => i !== index,
                );
                onUpdateEntities(updatedEntities, response.updatedScenario);
            } catch (error) {
                clientLogger.error(`Error deleting ${entityType}:`, error);
            } finally {
                setLocalLoading((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(index);
                    return newSet;
                });
            }
        },
        [
            localEntities,
            scenarioText,
            deleteEntityAction,
            onUpdateEntities,
            entityType,
            newEntityIndex,
        ],
    );

    return {
        entities: localEntities,
        isLoading,
        isDeleting,
        handleUpdate,
        handleAdd,
        handleRemove,
        newEntityIndex,
        setNewEntityIndex,
    };
}
