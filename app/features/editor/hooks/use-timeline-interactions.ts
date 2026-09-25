import { useState, useCallback, useEffect } from "react";
import { TimelineItem, TimelineLayer } from "@/app/types";
import { TIMELINE_DURATION } from "../constants/editor-constants";
import { useSnapPoints } from "./use-snap-points";

interface UseTimelineInteractionsProps {
    layers: TimelineLayer[];
    setLayers: React.Dispatch<React.SetStateAction<TimelineLayer[]>>;
    timelineRef: React.RefObject<HTMLDivElement | null>;
}

export function useTimelineInteractions({
    layers,
    setLayers,
    timelineRef,
}: UseTimelineInteractionsProps) {
    const { findResizeSnapPoint, findSnapPointForInsert } =
        useSnapPoints(layers);

    const [selectedItem, setSelectedItem] = useState<{
        layerId: string;
        itemId: string;
    } | null>(null);

    // Resize state
    const [isResizing, setIsResizing] = useState(false);
    const [resizeStartX, setResizeStartX] = useState(0);
    const [resizeStartTime, setResizeStartTime] = useState(0);
    const [resizeStartDuration, setResizeStartDuration] = useState(0);
    const [resizeStartTrimStart, setResizeStartTrimStart] = useState(0);
    const [resizeHandle, setResizeHandle] = useState<"start" | "end" | null>(
        null,
    );
    const [resizingItem, setResizingItem] = useState<{
        layerId: string;
        itemId: string;
    } | null>(null);

    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartTime, setDragStartTime] = useState(0);
    const [draggingItem, setDraggingItem] = useState<{
        layerId: string;
        itemId: string;
    } | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{
        layerId: string;
        position: number;
    } | null>(null);
    const [snapLinePosition, setSnapLinePosition] = useState<number | null>(
        null,
    );
    const [originalLayerItems, setOriginalLayerItems] = useState<
        TimelineItem[]
    >([]);

    const handleItemClick = useCallback(
        (e: React.MouseEvent, layerId: string, itemId: string) => {
            e.stopPropagation();
            setSelectedItem({ layerId, itemId });
        },
        [],
    );

    const handleResizeStart = useCallback(
        (
            e: React.MouseEvent,
            layerId: string,
            itemId: string,
            handle: "start" | "end",
        ) => {
            e.stopPropagation();
            e.preventDefault();
            setIsResizing(true);
            setResizeHandle(handle);
            setResizeStartX(e.clientX);
            setResizingItem({ layerId, itemId });
            setSelectedItem({ layerId, itemId });

            const layer = layers.find((l) => l.id === layerId);
            const item = layer?.items.find((i) => i.id === itemId);
            if (item) {
                setResizeStartTime(item.startTime);
                setResizeStartDuration(item.duration);
                setResizeStartTrimStart(
                    (item.metadata?.trimStart as number) || 0,
                );
            }
        },
        [layers],
    );

    const handleResizeMove = useCallback(
        (e: MouseEvent | React.MouseEvent) => {
            if (
                !isResizing ||
                !timelineRef.current ||
                !resizingItem ||
                !resizeHandle
            )
                return;

            const rect = timelineRef.current.getBoundingClientRect();
            const timeScale = rect.width / TIMELINE_DURATION;
            const deltaX = e.clientX - resizeStartX;
            const deltaTime = deltaX / timeScale;

            const layer = layers.find((l) => l.id === resizingItem.layerId);
            const currentItem = layer?.items.find(
                (i) => i.id === resizingItem.itemId,
            );
            if (!layer || !currentItem) return;

            const sortedItems = [...layer.items].sort(
                (a, b) => a.startTime - b.startTime,
            );
            const currentIndex = sortedItems.findIndex(
                (i) => i.id === resizingItem.itemId,
            );
            const prevItem =
                currentIndex > 0 ? sortedItems[currentIndex - 1] : null;
            const nextItem =
                currentIndex < sortedItems.length - 1
                    ? sortedItems[currentIndex + 1]
                    : null;

            const originalDuration = currentItem.metadata?.originalDuration as
                number | undefined;
            const hasTrimmableContent = originalDuration !== undefined;

            let currentSnapLine: number | null = null;

            setLayers((prevLayers) =>
                prevLayers.map((l) => {
                    if (l.id !== resizingItem.layerId) return l;

                    return {
                        ...l,
                        items: l.items.map((item) => {
                            if (item.id !== resizingItem.itemId) return item;

                            let newStartTime = resizeStartTime;
                            let newDuration = resizeStartDuration;
                            let newTrimStart = resizeStartTrimStart;

                            if (resizeHandle === "start") {
                                const potentialNewStart =
                                    resizeStartTime + deltaTime;
                                const minStart = prevItem
                                    ? prevItem.startTime + prevItem.duration
                                    : 0;
                                const snapResult = findResizeSnapPoint(
                                    potentialNewStart,
                                    resizingItem.layerId,
                                    resizingItem.itemId,
                                );
                                const snappedStart = snapResult.snappedPosition;

                                if (deltaTime > 0) {
                                    const maxDelta = resizeStartDuration - 0.5;
                                    const actualDelta =
                                        snappedStart - resizeStartTime;
                                    const clampedDelta = Math.min(
                                        Math.max(0, actualDelta),
                                        maxDelta,
                                    );
                                    newStartTime =
                                        resizeStartTime + clampedDelta;
                                    newDuration =
                                        resizeStartDuration - clampedDelta;
                                    if (hasTrimmableContent)
                                        newTrimStart =
                                            resizeStartTrimStart + clampedDelta;
                                    if (
                                        snapResult.snapLineAt !== null &&
                                        Math.abs(newStartTime - snappedStart) <
                                            0.01
                                    )
                                        currentSnapLine = snapResult.snapLineAt;
                                } else {
                                    if (hasTrimmableContent) {
                                        const maxExpand = Math.min(
                                            resizeStartTrimStart,
                                            resizeStartTime - minStart,
                                        );
                                        const actualExpand =
                                            resizeStartTime -
                                            Math.max(minStart, snappedStart);
                                        const expandAmount = Math.min(
                                            Math.max(0, actualExpand),
                                            maxExpand,
                                        );
                                        newStartTime =
                                            resizeStartTime - expandAmount;
                                        newDuration =
                                            resizeStartDuration + expandAmount;
                                        newTrimStart =
                                            resizeStartTrimStart - expandAmount;
                                        if (
                                            snapResult.snapLineAt !== null &&
                                            Math.abs(
                                                newStartTime - snappedStart,
                                            ) < 0.01
                                        )
                                            currentSnapLine =
                                                snapResult.snapLineAt;
                                    } else {
                                        newStartTime = Math.max(
                                            minStart,
                                            snappedStart,
                                        );
                                        newDuration =
                                            resizeStartDuration -
                                            (newStartTime - resizeStartTime);
                                        if (
                                            snapResult.snapLineAt !== null &&
                                            Math.abs(
                                                newStartTime - snappedStart,
                                            ) < 0.01
                                        )
                                            currentSnapLine =
                                                snapResult.snapLineAt;
                                    }
                                }
                            } else {
                                const maxEnd = nextItem
                                    ? nextItem.startTime
                                    : TIMELINE_DURATION;
                                const potentialNewEnd =
                                    resizeStartTime +
                                    resizeStartDuration +
                                    deltaTime;
                                const snapResult = findResizeSnapPoint(
                                    potentialNewEnd,
                                    resizingItem.layerId,
                                    resizingItem.itemId,
                                );
                                const snappedEnd = snapResult.snappedPosition;

                                if (deltaTime < 0) {
                                    const newEndFromSnap = Math.max(
                                        resizeStartTime + 0.5,
                                        snappedEnd,
                                    );
                                    newDuration =
                                        newEndFromSnap - resizeStartTime;
                                    if (
                                        snapResult.snapLineAt !== null &&
                                        Math.abs(
                                            resizeStartTime +
                                                newDuration -
                                                snappedEnd,
                                        ) < 0.01
                                    )
                                        currentSnapLine = snapResult.snapLineAt;
                                } else {
                                    if (hasTrimmableContent) {
                                        const currentTrimEnd =
                                            resizeStartTrimStart +
                                            resizeStartDuration;
                                        const availableAtEnd =
                                            originalDuration - currentTrimEnd;
                                        const maxExpandForTimeline =
                                            maxEnd -
                                            (resizeStartTime +
                                                resizeStartDuration);
                                        const maxExpand = Math.min(
                                            availableAtEnd,
                                            maxExpandForTimeline,
                                        );
                                        const actualExpand =
                                            Math.min(snappedEnd, maxEnd) -
                                            (resizeStartTime +
                                                resizeStartDuration);
                                        const expandAmount = Math.min(
                                            Math.max(0, actualExpand),
                                            maxExpand,
                                        );
                                        newDuration =
                                            resizeStartDuration + expandAmount;
                                        if (
                                            snapResult.snapLineAt !== null &&
                                            Math.abs(
                                                resizeStartTime +
                                                    newDuration -
                                                    snappedEnd,
                                            ) < 0.01
                                        )
                                            currentSnapLine =
                                                snapResult.snapLineAt;
                                    } else {
                                        const maxDuration =
                                            maxEnd - resizeStartTime;
                                        newDuration = Math.min(
                                            snappedEnd - resizeStartTime,
                                            maxDuration,
                                        );
                                        newDuration = Math.max(
                                            0.5,
                                            newDuration,
                                        );
                                        if (
                                            snapResult.snapLineAt !== null &&
                                            Math.abs(
                                                resizeStartTime +
                                                    newDuration -
                                                    snappedEnd,
                                            ) < 0.01
                                        )
                                            currentSnapLine =
                                                snapResult.snapLineAt;
                                    }
                                }
                            }

                            return {
                                ...item,
                                startTime: newStartTime,
                                duration: newDuration,
                                metadata: {
                                    ...item.metadata,
                                    trimStart: newTrimStart,
                                },
                            };
                        }),
                    };
                }),
            );
            setSnapLinePosition(currentSnapLine);
        },
        [
            isResizing,
            resizingItem,
            resizeHandle,
            resizeStartX,
            layers,
            resizeStartTime,
            resizeStartDuration,
            resizeStartTrimStart,
            findResizeSnapPoint,
            setLayers,
            timelineRef,
        ],
    );

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
        setResizeHandle(null);
        setResizingItem(null);
        setSnapLinePosition(null);
    }, []);

    const handleDragStart = useCallback(
        (e: React.MouseEvent, layerId: string, itemId: string) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains("resize-handle")) return;

            e.stopPropagation();
            e.preventDefault();
            setIsDragging(true);
            setDragStartX(e.clientX);
            setDraggingItem({ layerId, itemId });
            setSelectedItem({ layerId, itemId });

            const layer = layers.find((l) => l.id === layerId);
            const item = layer?.items.find((i) => i.id === itemId);
            if (item && layer) {
                setDragStartTime(item.startTime);
                setOriginalLayerItems(layer.items.map((i) => ({ ...i })));
            }
        },
        [layers],
    );

    const handleDragMove = useCallback(
        (e: MouseEvent | React.MouseEvent) => {
            if (!isDragging || !timelineRef.current || !draggingItem) return;

            const rect = timelineRef.current.getBoundingClientRect();
            const timeScale = rect.width / TIMELINE_DURATION;
            const deltaX = e.clientX - dragStartX;
            const deltaTime = deltaX / timeScale;

            const originalItem = originalLayerItems.find(
                (i) => i.id === draggingItem.itemId,
            );
            if (!originalItem) return;

            const proposedStart = Math.max(
                0,
                Math.min(
                    dragStartTime + deltaTime,
                    TIMELINE_DURATION - originalItem.duration,
                ),
            );
            const snapResult = findSnapPointForInsert(
                proposedStart,
                originalItem.duration,
                draggingItem.itemId,
                originalLayerItems,
                draggingItem.layerId,
            );

            const finalPosition =
                snapResult.snapLineAt !== null
                    ? snapResult.clipStart
                    : proposedStart;
            setSnapLinePosition(snapResult.snapLineAt);
            setDropIndicator({
                layerId: draggingItem.layerId,
                position: finalPosition,
            });

            const draggedDuration = originalItem.duration;
            const otherClips = originalLayerItems
                .filter((i) => i.id !== draggingItem.itemId)
                .map((i) => ({ ...i }))
                .sort((a, b) => a.startTime - b.startTime);

            const overlappingClips = otherClips.filter((clip) => {
                const clipEnd = clip.startTime + clip.duration;
                const draggedEndTime = finalPosition + draggedDuration;
                return (
                    finalPosition < clipEnd && draggedEndTime > clip.startTime
                );
            });

            const previewPositions = new Map<string, number>();
            let draggedPreviewPosition = finalPosition;

            if (overlappingClips.length > 0) {
                const leftmostOverlap = overlappingClips.sort(
                    (a, b) => a.startTime - b.startTime,
                )[0];
                draggedPreviewPosition = leftmostOverlap.startTime;
            }

            previewPositions.set(draggingItem.itemId, draggedPreviewPosition);
            let currentEndTime = draggedPreviewPosition + draggedDuration;

            const clipsToProcess = otherClips
                .filter((clip) => {
                    const clipEnd = clip.startTime + clip.duration;
                    return (
                        clip.startTime >= draggedPreviewPosition ||
                        (draggedPreviewPosition < clipEnd &&
                            currentEndTime > clip.startTime)
                    );
                })
                .sort((a, b) => a.startTime - b.startTime);

            for (const clip of clipsToProcess) {
                const clipOriginalStart = clip.startTime;
                const clipEnd = clipOriginalStart + clip.duration;
                if (
                    clipOriginalStart < currentEndTime &&
                    clipEnd > draggedPreviewPosition
                ) {
                    const newStart = currentEndTime;
                    if (newStart + clip.duration <= TIMELINE_DURATION) {
                        previewPositions.set(clip.id, newStart);
                        currentEndTime = newStart + clip.duration;
                    } else {
                        previewPositions.set(clip.id, clipOriginalStart);
                    }
                }
            }

            for (const clip of otherClips) {
                if (!previewPositions.has(clip.id))
                    previewPositions.set(clip.id, clip.startTime);
            }

            setLayers((prevLayers) =>
                prevLayers.map((l) => {
                    if (l.id !== draggingItem.layerId) return l;
                    return {
                        ...l,
                        items: l.items.map((i) => {
                            const previewPos = previewPositions.get(i.id);
                            return previewPos !== undefined
                                ? { ...i, startTime: previewPos }
                                : i;
                        }),
                    };
                }),
            );
        },
        [
            isDragging,
            draggingItem,
            dragStartX,
            dragStartTime,
            findSnapPointForInsert,
            setLayers,
            timelineRef,
            originalLayerItems,
        ],
    );

    const handleDragEnd = useCallback(() => {
        if (isDragging && draggingItem && dropIndicator) {
            const originalDraggedItem = originalLayerItems.find(
                (i) => i.id === draggingItem.itemId,
            );

            if (originalDraggedItem) {
                const proposedStartTime = dropIndicator.position;
                const draggedDuration = originalDraggedItem.duration;
                const otherClips = originalLayerItems
                    .filter((i) => i.id !== draggingItem.itemId)
                    .map((i) => ({ ...i }))
                    .sort((a, b) => a.startTime - b.startTime);

                const overlappingClips = otherClips.filter((clip) => {
                    const clipEnd = clip.startTime + clip.duration;
                    const draggedEndTime = proposedStartTime + draggedDuration;
                    return (
                        proposedStartTime < clipEnd &&
                        draggedEndTime > clip.startTime
                    );
                });

                const newPositions = new Map<string, number>();
                let finalDraggedPosition = proposedStartTime;

                if (overlappingClips.length > 0) {
                    const leftmostOverlap = overlappingClips.sort(
                        (a, b) => a.startTime - b.startTime,
                    )[0];
                    finalDraggedPosition = leftmostOverlap.startTime;
                }

                newPositions.set(draggingItem.itemId, finalDraggedPosition);
                let currentEndTime = finalDraggedPosition + draggedDuration;

                const clipsToProcess = otherClips
                    .filter((clip) => {
                        const clipEnd = clip.startTime + clip.duration;
                        return (
                            clip.startTime >= finalDraggedPosition ||
                            (finalDraggedPosition < clipEnd &&
                                currentEndTime > clip.startTime)
                        );
                    })
                    .sort((a, b) => a.startTime - b.startTime);

                for (const clip of clipsToProcess) {
                    const clipOriginalStart = clip.startTime;
                    const clipEnd = clipOriginalStart + clip.duration;
                    if (
                        clipOriginalStart < currentEndTime &&
                        clipEnd > finalDraggedPosition
                    ) {
                        const newStart = currentEndTime;
                        if (newStart + clip.duration <= TIMELINE_DURATION) {
                            newPositions.set(clip.id, newStart);
                            currentEndTime = newStart + clip.duration;
                        } else {
                            newPositions.set(clip.id, clipOriginalStart);
                        }
                    }
                }

                for (const clip of otherClips) {
                    if (!newPositions.has(clip.id))
                        newPositions.set(clip.id, clip.startTime);
                }

                setLayers((prevLayers) =>
                    prevLayers.map((l) => {
                        if (l.id !== draggingItem.layerId) return l;
                        const itemsWithNewPos = l.items.map((item) => {
                            const newPos = newPositions.get(item.id);
                            return newPos !== undefined
                                ? { ...item, startTime: newPos }
                                : item;
                        });
                        return {
                            ...l,
                            items: itemsWithNewPos.sort(
                                (a, b) => a.startTime - b.startTime,
                            ),
                        };
                    }),
                );
            }
        }
        setIsDragging(false);
        setDraggingItem(null);
        setDropIndicator(null);
        setSnapLinePosition(null);
        setOriginalLayerItems([]);
    }, [
        isDragging,
        draggingItem,
        dropIndicator,
        setLayers,
        originalLayerItems,
    ]);

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isResizing) handleResizeMove(e);
            if (isDragging) handleDragMove(e);
        };

        const handleGlobalMouseUp = () => {
            if (isResizing) handleResizeEnd();
            if (isDragging) handleDragEnd();
        };

        if (isResizing || isDragging) {
            document.addEventListener("mousemove", handleGlobalMouseMove);
            document.addEventListener("mouseup", handleGlobalMouseUp);
            return () => {
                document.removeEventListener(
                    "mousemove",
                    handleGlobalMouseMove,
                );
                document.removeEventListener("mouseup", handleGlobalMouseUp);
            };
        }
    }, [
        isResizing,
        isDragging,
        handleDragEnd,
        handleDragMove,
        handleResizeEnd,
        handleResizeMove,
    ]);

    return {
        selectedItem,
        setSelectedItem,
        isResizing,
        resizingItem,
        resizeHandle,
        isDragging,
        draggingItem,
        snapLinePosition,
        handleItemClick,
        handleResizeStart,
        handleDragStart,
        originalLayerItems,
    };
}
